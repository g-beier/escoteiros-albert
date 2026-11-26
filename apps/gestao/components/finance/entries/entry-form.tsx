"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconArrowDownLeft, IconArrowUpRight, IconCash, IconPlus, IconReceipt2, IconTrash } from "@tabler/icons-react";
import { createDebtLines, createEntry, deleteEntry, updateEntry } from "@/app/actions";
import { createEntryFromStatementLine } from "@/app/(financeiro)/financeiro/extrato/conciliar/actions";
import { OptionCombobox, OptionSelect, type Option } from "@geas/ui/components/option-controls";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geas/ui/components/dialog";
import { Input } from "@geas/ui/components/input";
import { Textarea } from "@geas/ui/components/textarea";
import { NOTES_MAX } from "@/lib/finance/entry-schema";
import { Label } from "@geas/ui/components/label";
import { Link } from "@geas/ui/components/link";
import { accountAfterPaymentChange } from "@/lib/finance/accounts";
import type { EditableEntry } from "@/lib/finance/entries";
import { suggestAllocation, type OpenDebt } from "@/lib/finance/debts";
import { centsToInput, dateBR, money } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/money";
import { cn } from "@geas/ui/lib/utils";
import type { CategoryItem } from "@/lib/finance/categories";
import { categorySellsItems, type SaleLot } from "@/lib/finance/sales";
import { CategoryPicker } from "./category-picker";
import { SaleItemsEditor, itemDraftsTotal, toItemDrafts, type SaleItemDraft } from "./sale-items";

export type CatalogItem = { id: string; name: string; active: boolean };
export type PaymentMethodItem = CatalogItem & { default_account_id?: string | null };
export type Catalogs = {
  categories: CategoryItem[]; paymentMethods: PaymentMethodItem[]; associates: CatalogItem[]; accounts: CatalogItem[];
  /** Lojinha (021): lotes à venda para os itens vendidos. */
  saleLots: SaleLot[];
  /** Linhas em aberto das contas a receber (023, 024): "Paga a dívida" e "Receber da conta". */
  openDebts: OpenDebt[];
};
type Direction = "entrada" | "saida";

/** Rateio do caixa. `debtId` = a linha da conta que ele paga (rubrica e associado dela). */
type SplitDraft = { key: number; categoryId: string; amount: string; description: string; associateId: string; items: SaleItemDraft[]; debtId: string };
/**
 * Linha de dívida (024): o que fica a pagar, na conta do associado, fora do caixa e do total. Num rateio com itens
 * vendidos da mesma rubrica e associado, os itens somam o rateio + estas linhas.
 */
type DebtLineDraft = { key: number; debtId: string; categoryId: string; description: string; associateId: string; amount: string; paidCents: number };
/** "Receber" a conta (024): o lançamento já vem com um rateio ligado a cada linha em aberto (todas, ou a escolhida). */
export type DebtReceivePrefill = {
  associateId: string; associateName: string;
  lines: { debtId: string; categoryId: string; description: string; openCents: number }[];
};
/** Linha do extrato que origina o lançamento: data, valor e conta vêm dela (valor e conta ficam travados). */
export type StatementLinePrefill = { id: string; date: string; name: string; totalCents: number; accountId: string; paymentMethodId: string };
type Draft = {
  direction: Direction | null; date: string; name: string; total: string; paymentMethodId: string; accountId: string; document: string;
  documentFiled: boolean; notes: string; splits: SplitDraft[]; debtLines: DebtLineDraft[];
};

let splitKey = 0;
const emptySplit = (): SplitDraft => ({ key: ++splitKey, categoryId: "", amount: "", description: "", associateId: "", items: [], debtId: "" });
const today = () => new Date().toISOString().slice(0, 10);

function toDraft(entry: EditableEntry | null, fromLine?: StatementLinePrefill, receive?: DebtReceivePrefill): Draft {
  const base = { paymentMethodId: "", accountId: "", document: "", documentFiled: false, notes: "", debtLines: [] as DebtLineDraft[] };
  if (!entry && receive) return {
    ...base, direction: "entrada", date: today(), name: receive.associateName,
    total: centsToInput(receive.lines.reduce((sum, line) => sum + line.openCents, 0)),
    splits: receive.lines.map((line) => ({ ...emptySplit(), categoryId: line.categoryId, amount: centsToInput(line.openCents), description: line.description,
      associateId: receive.associateId, debtId: line.debtId })),
  };
  if (!entry && fromLine) return {
    ...base, direction: fromLine.totalCents < 0 ? "saida" : "entrada", date: fromLine.date, name: fromLine.name,
    total: centsToInput(Math.abs(fromLine.totalCents)), paymentMethodId: fromLine.paymentMethodId, accountId: fromLine.accountId, splits: [emptySplit()],
  };
  if (!entry) return { ...base, direction: null, date: today(), name: "", total: "", splits: [emptySplit()] };
  return {
    direction: entry.totalCents < 0 ? "saida" : "entrada",
    date: entry.date,
    name: entry.name,
    total: centsToInput(Math.abs(entry.totalCents)),
    paymentMethodId: entry.paymentMethodId,
    accountId: entry.accountId,
    document: entry.document,
    documentFiled: entry.documentFiled,
    notes: entry.notes,
    splits: entry.splits.map((s) => ({ key: ++splitKey, categoryId: s.categoryId, amount: centsToInput(Math.abs(s.amountCents)), description: s.description,
      associateId: s.associateId ?? "", items: toItemDrafts(s.items ?? []), debtId: s.debtId ?? "" })),
    debtLines: (entry.debtLines ?? []).map((line) => ({ key: ++splitKey, debtId: line.debtId, categoryId: line.categoryId, description: line.description,
      associateId: line.associateId, amount: centsToInput(line.amountCents), paidCents: line.paidCents })),
  };
}

/** Valor digitado sempre como magnitude; o sinal vem de entrada/saída (total) ou do tipo da rubrica (rateio). */
const magnitude = (value: string) => Math.abs(parseMoneyToCents(value) ?? 0);
const kindFor = (direction: Direction | null) => direction === "entrada" ? "receita" : direction === "saida" ? "despesa" : null;
const directionSign = (direction: Direction | null) => direction === "saida" ? -1 : 1;

/** Opções ativas, mais as inativas já usadas no lançamento. */
function visibleOptions(items: CatalogItem[], used: string[]): Option[] {
  return items.filter((item) => item.active || used.includes(item.id))
    .map((item) => ({ value: item.id, label: item.active ? item.name : `${item.name} (inativo)` }));
}

export function EntryForm({ entry, catalogs, canEdit, backHref, fromLine, receive }: {
  entry: EditableEntry | null; catalogs: Catalogs; canEdit: boolean; backHref: string; fromLine?: StatementLinePrefill;
  /** "Receber" a conta de um associado em Devedores (024): rateios já ligados às linhas em aberto. */
  receive?: DebtReceivePrefill;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(entry, fromLine, receive));
  const [saved, setSaved] = useState<Draft>(() => toDraft(entry, fromLine, receive));
  const [receiving, setReceiving] = useState(false);
  const locked = Boolean(fromLine);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const readOnly = !canEdit;
  const dirty = JSON.stringify(stripKeys(draft)) !== JSON.stringify(stripKeys(saved));

  const update = (patch: Partial<Draft>) => { setDraft((current) => ({ ...current, ...patch })); };
  const updateSplit = (key: number, patch: Partial<SplitDraft>) => update({ splits: draft.splits.map((s) => s.key === key ? { ...s, ...patch } : s) });
  const updateLine = (key: number, patch: Partial<DebtLineDraft>) => update({ debtLines: draft.debtLines.map((l) => l.key === key ? { ...l, ...patch } : l) });

  const options = useMemo(() => ({
    paymentMethods: visibleOptions(catalogs.paymentMethods, [draft.paymentMethodId]),
    accounts: visibleOptions(catalogs.accounts, [saved.accountId]),
    associates: visibleOptions(catalogs.associates, [...draft.splits.map((s) => s.associateId), ...draft.debtLines.map((l) => l.associateId)]),
  }), [catalogs, draft.splits, draft.debtLines, draft.paymentMethodId, saved.accountId]);

  /** A conta acompanha a conta padrão da forma de pagamento, salvo se escolhida à mão. */
  function choosePaymentMethod(paymentMethodId: string) {
    if (locked) { update({ paymentMethodId }); return; }
    update({ paymentMethodId, accountId: accountAfterPaymentChange(draft, paymentMethodId, catalogs.paymentMethods, catalogs.accounts) });
  }
  // rubricas do lançamento salvo: continuam selecionáveis mesmo se inativadas depois
  const usedCategoryIds = useMemo(() => [...saved.splits, ...saved.debtLines].map((s) => s.categoryId).filter(Boolean), [saved]);

  const categoryKinds = useMemo(() => new Map(catalogs.categories.map((c) => [c.id, c.kind])), [catalogs.categories]);
  /** Rubricas que vendem itens do inventário (a marca vale para as filhas). */
  const sells = useMemo(() => new Set(catalogs.categories.filter((c) => categorySellsItems(c.id, catalogs.categories)).map((c) => c.id)), [catalogs.categories]);
  /** Itens vendidos do lançamento salvo: o que já saiu do estoque volta antes de sair de novo ao editar. */
  const savedItems = useMemo(() => entry?.splits.flatMap((s) => s.items ?? []) ?? [], [entry]);
  const itemsOf = (split: SplitDraft) => (sells.has(split.categoryId) && !split.debtId ? split.items : []);
  const associateName = (id: string) => catalogs.associates.find((a) => a.id === id)?.name ?? "o associado";
  /** Linhas de dívida da mesma rubrica e associado do rateio: com itens vendidos, ficam a pagar do total dos itens. */
  const debtFor = (split: SplitDraft) => draft.debtLines.filter((l) => l.categoryId === split.categoryId && l.associateId === split.associateId)
    .reduce((sum, l) => sum + magnitude(l.amount), 0);
  /** O que entrou no rateio: com itens vendidos, a soma deles menos as linhas de dívida da mesma rubrica e associado. */
  const splitMagnitude = (split: SplitDraft) => (itemsOf(split).length ? Math.max(itemDraftsTotal(itemsOf(split)) - debtFor(split), 0) : magnitude(split.amount));

  /** Linhas em aberto do associado do rateio, mais a que ele já paga (mesmo quitada por ele). */
  const debtOptions = (split: SplitDraft): Option[] => {
    const open = catalogs.openDebts.filter((debt) => debt.associate_id === split.associateId);
    const list = open.map((debt) => ({ value: debt.id, label: `${debt.description} · ${dateBR(debt.debt_date)} · falta ${money(debt.open_cents / 100)}` }));
    if (split.debtId && !open.some((debt) => debt.id === split.debtId)) list.unshift({ value: split.debtId, label: "Dívida já ligada a este rateio" });
    return list;
  };
  /** Rateio passa a pagar a linha: rubrica e descrição dela, valor = o que falta; sem itens. */
  function chooseDebt(split: SplitDraft, debtId: string) {
    const debt = catalogs.openDebts.find((d) => d.id === debtId);
    if (!debtId || !debt) { updateSplit(split.key, { debtId: "" }); return; }
    updateSplit(split.key, { debtId, categoryId: debt.category_id, description: split.description || debt.description, amount: centsToInput(debt.open_cents), items: [] });
  }

  /** Receita soma, despesa subtrai; rubrica sem tipo (antiga) ou ainda não escolhida segue entrada/saída. */
  const splitSign = (split: SplitDraft) => {
    const kind = categoryKinds.get(split.categoryId);
    return kind === "receita" ? 1 : kind === "despesa" ? -1 : directionSign(draft.direction);
  };
  const signedSplit = (split: SplitDraft) => splitSign(split) * splitMagnitude(split);
  const totalCents = draft.direction ? directionSign(draft.direction) * magnitude(draft.total) : 0;
  const splitCents = draft.splits.reduce((sum, s) => sum + signedSplit(s), 0);
  const debtCents = draft.debtLines.reduce((sum, l) => sum + magnitude(l.amount), 0);
  const incomeCents = draft.splits.reduce((sum, s) => sum + Math.max(0, signedSplit(s)), 0);
  const expenseCents = draft.splits.reduce((sum, s) => sum + Math.min(0, signedSplit(s)), 0);
  const mixed = incomeCents !== 0 && expenseCents !== 0;
  const balanced = totalCents !== 0 && splitCents === totalCents;
  const remaining = totalCents - splitCents;
  const linesReady = draft.debtLines.every((l) => l.categoryId && l.associateId && l.description.trim().length >= 2 && magnitude(l.amount) > 0);

  // "Criar dívida com a diferença": entrou menos do que os rateios somam; a diferença vira linha de dívida do último rateio
  // de entrada com associado (que não paga dívida), na mesma rubrica e descrição.
  const dueSplit = [...draft.splits].reverse().find((s) => categoryKinds.get(s.categoryId) === "receita" && s.associateId && !s.debtId) ?? null;
  const canDue = !fromLine && !receive && draft.direction === "entrada" && remaining < 0 && dueSplit !== null && splitMagnitude(dueSplit) + remaining >= 0;
  // Só dívida: lançamento novo de entrada sem valor recebido e com linhas de dívida (venda ou cobrança toda a pagar).
  const onlyDebt = !entry && !fromLine && !receive && draft.direction === "entrada" && magnitude(draft.total) === 0 && draft.debtLines.length > 0
    && draft.splits.every((s) => splitMagnitude(s) === 0);

  function chooseDirection(direction: Direction) {
    if (direction !== draft.direction) update({ direction });
  }

  function fillRemaining() {
    const last = draft.splits[draft.splits.length - 1];
    if (!last || remaining === 0) return;
    const sign = splitSign(last);
    updateSplit(last.key, { amount: centsToInput(Math.max(0, sign * (signedSplit(last) + remaining))) });
  }

  /** A diferença vira linha de dívida; num rateio sem itens, o valor dele cai para o que entrou. */
  function dueRemaining() {
    if (!dueSplit) return;
    const due = -remaining;
    const line: DebtLineDraft = { key: ++splitKey, debtId: "", categoryId: dueSplit.categoryId, description: dueSplit.description, associateId: dueSplit.associateId,
      amount: centsToInput(due), paidCents: 0 };
    update({
      debtLines: [...draft.debtLines, line],
      splits: itemsOf(dueSplit).length ? draft.splits : draft.splits.map((s) => s.key === dueSplit.key ? { ...s, amount: centsToInput(splitMagnitude(s) - due) } : s),
    });
  }

  function addDebtLine() {
    const from = dueSplit;
    update({ debtLines: [...draft.debtLines, { key: ++splitKey, debtId: "", categoryId: from?.categoryId ?? "", description: from?.description ?? "",
      associateId: from?.associateId ?? "", amount: "", paidCents: 0 }] });
  }

  /** Lança só as linhas de dívida (nada entrou): cada uma leva os itens vendidos do rateio da mesma rubrica e associado. */
  function submitOnlyDebt() {
    const payload = {
      date: draft.date,
      lines: draft.debtLines.map((l) => {
        const sale = draft.splits.find((s) => s.categoryId === l.categoryId && s.associateId === l.associateId && itemsOf(s).length > 0);
        const items = sale ? itemsOf(sale).map((item) => ({ lotId: item.lotId, quantity: Number(item.quantity), unitPriceCents: magnitude(item.price) })) : [];
        return { associateId: l.associateId, categoryId: l.categoryId, description: l.description, amountCents: items.length ? null : magnitude(l.amount), items };
      }),
    };
    startTransition(async () => {
      const result = await createDebtLines(payload);
      if (result.error) { toast.error(result.error); return; }
      toast.success("Dívida lançada em Devedores (nada entrou no caixa).");
      router.push(backHref);
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    if (onlyDebt) { submitOnlyDebt(); return; }
    const payload = {
      date: draft.date,
      name: draft.name,
      paymentMethodId: draft.paymentMethodId,
      accountId: draft.accountId,
      document: draft.document,
      documentFiled: draft.documentFiled,
      notes: draft.notes,
      totalCents,
      splits: draft.splits.map((s) => ({ categoryId: s.categoryId, amountCents: signedSplit(s), description: s.description, associateId: s.associateId || null,
        debtId: s.debtId || null,
        items: itemsOf(s).map((item) => ({ lotId: item.lotId, quantity: Number(item.quantity), unitPriceCents: magnitude(item.price) })) })),
      debtLines: draft.debtLines.map((l) => ({ debtId: l.debtId || null, categoryId: l.categoryId, description: l.description, associateId: l.associateId,
        amountCents: magnitude(l.amount) })),
    };
    startTransition(async () => {
      const result = entry ? await updateEntry(entry.id, payload) : fromLine ? await createEntryFromStatementLine(fromLine.id, payload) : await createEntry(payload);
      if (result.error) { toast.error(result.error); return; }
      if (!entry) {
        toast.success(fromLine ? "Lançamento criado e conciliado." : receive ? "Recebimento lançado na conta (Devedores)."
          : draft.debtLines.length ? "Lançamento salvo; as linhas de dívida foram para Devedores." : "Lançamento salvo.");
        router.push(backHref);
        return;
      }
      setSaved(draft);
      toast.success("Alterações salvas.");
    });
  }

  function remove() {
    if (!entry) return;
    startTransition(async () => {
      const result = await deleteEntry(entry.id);
      if (result.error) { toast.error(result.error); setConfirmDelete(false); return; }
      toast.info("Lançamento excluído.");
      router.push(backHref);
    });
  }

  /** "Receber da conta": um rateio ligado a cada linha que recebe; substitui um rateio vazio. */
  function addReceipts(rows: { debt: OpenDebt; amountCents: number }[]) {
    const kept = draft.splits.filter((s) => s.categoryId || s.description || s.amount || s.items.length);
    const added = rows.map(({ debt, amountCents }) => ({ ...emptySplit(), categoryId: debt.category_id, description: debt.description,
      associateId: debt.associate_id, amount: centsToInput(amountCents), debtId: debt.id }));
    const sum = rows.reduce((total, row) => total + row.amountCents, 0);
    update({ splits: [...kept, ...added], total: draft.total ? draft.total : centsToInput(sum), name: draft.name || associateName(rows[0]?.debt.associate_id ?? "") });
    setReceiving(false);
  }

  return <form onSubmit={submit} className="grid gap-5">

    <fieldset disabled={readOnly} className="grid gap-3">
      <legend className="mb-2 text-sm font-semibold">Linha do extrato</legend>
      <div role="radiogroup" aria-label="Tipo do lançamento" className="flex flex-wrap items-center gap-2">
        <DirectionButton value="entrada" current={draft.direction} onSelect={chooseDirection} disabled={readOnly || locked} />
        <DirectionButton value="saida" current={draft.direction} onSelect={chooseDirection} disabled={readOnly || locked} />
        {!draft.direction && <span className="text-muted-foreground">Comece escolhendo se o dinheiro entrou ou saiu da conta.</span>}
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_10rem]">
        <div className="grid gap-1.5"><Label htmlFor="entry-date">Data</Label><Input id="entry-date" type="date" value={draft.date} onChange={(e) => update({ date: e.target.value })} required /></div>
        {!onlyDebt && <div className="grid gap-1.5"><Label htmlFor="entry-name">Histórico</Label><Input id="entry-name" maxLength={200} placeholder="Quem pagou ou recebeu, emitente da nota…" value={draft.name} onChange={(e) => update({ name: e.target.value })} required /></div>}
        <div className="grid gap-1.5"><Label htmlFor="entry-total">Valor total (R$){draft.direction && <span className={cn("ml-1", draft.direction === "saida" ? "text-destructive" : "text-success")}>· {draft.direction === "saida" ? "saída" : "entrada"}</span>}</Label><Input id="entry-total" inputMode="decimal" placeholder="0,00" value={draft.total} onChange={(e) => update({ total: e.target.value })} readOnly={locked} title={locked ? "Valor da linha do extrato" : undefined} className="text-right num" required={!onlyDebt && draft.debtLines.length === 0} /></div>
      </div>
      {!onlyDebt && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-1.5"><Label htmlFor="entry-payment">Forma de pagamento</Label><OptionSelect id="entry-payment" value={draft.paymentMethodId} onValueChange={choosePaymentMethod} options={options.paymentMethods} disabled={readOnly} /></div>
        <div className="grid gap-1.5"><Label htmlFor="entry-account">Conta</Label><OptionSelect id="entry-account" value={draft.accountId} onValueChange={(accountId) => update({ accountId })} options={options.accounts} placeholder="Escolha a conta…" disabled={readOnly || locked} /></div>
        <div className="grid gap-1.5"><Label htmlFor="entry-document">Documento (opcional)</Label><Input id="entry-document" maxLength={60} placeholder="NF 1234, recibo…" value={draft.document} onChange={(e) => update({ document: e.target.value })} /></div>
        <Label className="h-7 w-fit cursor-pointer gap-2 font-medium">
          <Checkbox checked={draft.documentFiled} onCheckedChange={(checked) => update({ documentFiled: checked === true })} disabled={readOnly} />
          Documento arquivado
        </Label>
      </div>}
      {onlyDebt && <p className="m-0 text-xs text-muted-foreground">Nada entrou agora: ao salvar, só as linhas de dívida vão para a conta dos associados em Devedores (os itens vendidos baixam do estoque). Quando pagarem, use “Receber…”.</p>}
    </fieldset>

    <fieldset disabled={readOnly} className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="text-sm font-semibold">Rateio por rubricas</legend>
        {!readOnly && <div className="flex flex-wrap gap-1">
          {draft.direction === "entrada" && catalogs.openDebts.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => setReceiving(true)}>
            <IconCash data-icon="inline-start" /> Receber da conta…</Button>}
          <Button type="button" variant="ghost" size="sm" onClick={() => update({ splits: [...draft.splits, emptySplit()] })}><IconPlus data-icon="inline-start" /> Adicionar rubrica</Button>
          {draft.direction === "entrada" && <Button type="button" variant="ghost" size="sm" onClick={addDebtLine}><IconReceipt2 data-icon="inline-start" /> Adicionar dívida</Button>}
        </div>}
      </div>
      {draft.splits.map((split, index) => <div key={split.key} role="group" aria-label={`Rubrica ${index + 1}`} className="grid gap-2 rounded-lg bg-muted p-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_8rem_auto] sm:items-end">
        <div className="grid gap-1.5"><Label htmlFor={`split-category-${index}`}>Rubrica</Label><CategoryPicker id={`split-category-${index}`} value={split.categoryId} onChange={(categoryId) => updateSplit(split.key, { categoryId })} categories={catalogs.categories} preferredKind={kindFor(draft.direction)} usedIds={usedCategoryIds} placeholder="Buscar receita ou despesa…" disabled={readOnly || Boolean(split.debtId)} /></div>
        <div className="grid gap-1.5"><Label htmlFor={`split-description-${index}`}>Descrição</Label><Input id={`split-description-${index}`} maxLength={200} placeholder="Ex.: Lanche do acampamento" value={split.description} onChange={(e) => updateSplit(split.key, { description: e.target.value })} required={!onlyDebt} /></div>
        <div className="grid gap-1.5"><Label htmlFor={`split-associate-${index}`}>Associado (opcional)</Label><OptionCombobox id={`split-associate-${index}`} value={split.associateId} onValueChange={(associateId) => updateSplit(split.key, { associateId, debtId: "" })} options={options.associates} placeholder={readOnly ? "—" : "Buscar associado…"} emptyText="Nenhum associado encontrado." disabled={readOnly} /></div>
        <div className="grid gap-1.5"><Label htmlFor={`split-amount-${index}`}>Valor (R$){split.categoryId && <span className={cn("ml-1", splitSign(split) < 0 ? "text-destructive" : "text-success")}>{splitSign(split) < 0 ? "−" : "+"}</span>}</Label><Input id={`split-amount-${index}`} inputMode="decimal" placeholder="0,00" value={itemsOf(split).length ? centsToInput(splitMagnitude(split)) : split.amount} onChange={(e) => updateSplit(split.key, { amount: e.target.value })} readOnly={itemsOf(split).length > 0} title={itemsOf(split).length ? "Soma dos itens vendidos menos as linhas de dívida da mesma rubrica" : undefined} className="text-right num" required={!onlyDebt} /></div>
        {!readOnly && <Button type="button" variant="ghost" size="icon" aria-label={`Remover rubrica ${index + 1}`} disabled={draft.splits.length === 1} onClick={() => update({ splits: draft.splits.filter((s) => s.key !== split.key) })}><IconTrash /></Button>}
        {draft.direction === "entrada" && split.associateId && debtOptions(split).length > 0 && <div className="grid gap-1.5 sm:col-span-full sm:max-w-xl">
          <Label htmlFor={`split-debt-${index}`}>Paga a dívida (opcional)</Label>
          <OptionSelect id={`split-debt-${index}`} value={split.debtId} onValueChange={(value) => chooseDebt(split, value)} options={debtOptions(split)}
            emptyLabel="Não: receita avulsa" disabled={readOnly} />
          {split.debtId && <span className="text-[11px] text-muted-foreground">A rubrica é a da dívida. O valor entra nela e abate o que falta em Devedores.</span>}
        </div>}
        {itemsOf(split).length > 0 && debtFor(split) > 0 && <p className="m-0 text-xs sm:col-span-full">
          Itens <strong className="num">{money(itemDraftsTotal(itemsOf(split)) / 100)}</strong> · recebido <strong className="num">{money(splitMagnitude(split) / 100)}</strong> · a pagar <strong className="num text-destructive">{money(debtFor(split) / 100)}</strong> (linha de dívida abaixo)</p>}
        {sells.has(split.categoryId) && !split.debtId && <SaleItemsEditor className="sm:col-span-full" index={index} items={split.items} lots={catalogs.saleLots}
          savedItems={savedItems} readOnly={readOnly} onChange={(items) => updateSplit(split.key, { items })} />}
      </div>)}

      {draft.debtLines.map((line, index) => <div key={line.key} role="group" aria-label={`Dívida ${index + 1}`}
        className="grid gap-2 rounded-lg border border-dashed border-destructive/40 bg-destructive/5 p-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_8rem_auto] sm:items-end">
        <p className="m-0 text-xs font-semibold text-destructive sm:col-span-full">A pagar (vai para a conta do associado em Devedores; não entra no caixa){line.paidCents > 0 && <span className="font-normal text-muted-foreground"> · já pago {money(line.paidCents / 100)}</span>}</p>
        <div className="grid gap-1.5"><Label htmlFor={`debt-category-${index}`}>Rubrica</Label><CategoryPicker id={`debt-category-${index}`} value={line.categoryId} onChange={(categoryId) => updateLine(line.key, { categoryId })} categories={catalogs.categories} preferredKind="receita" usedIds={usedCategoryIds} placeholder="Mensalidade, lojinha, atividade…" disabled={readOnly || line.paidCents > 0} /></div>
        <div className="grid gap-1.5"><Label htmlFor={`debt-description-${index}`}>Descrição</Label><Input id={`debt-description-${index}`} maxLength={200} value={line.description} onChange={(e) => updateLine(line.key, { description: e.target.value })} required /></div>
        <div className="grid gap-1.5"><Label htmlFor={`debt-associate-${index}`}>Associado</Label><OptionCombobox id={`debt-associate-${index}`} value={line.associateId} onValueChange={(associateId) => updateLine(line.key, { associateId })} options={options.associates} placeholder="Quem fica devendo…" emptyText="Nenhum associado encontrado." disabled={readOnly || line.paidCents > 0} /></div>
        <div className="grid gap-1.5"><Label htmlFor={`debt-amount-${index}`}>Valor (R$)</Label><Input id={`debt-amount-${index}`} inputMode="decimal" placeholder="0,00" value={line.amount} onChange={(e) => updateLine(line.key, { amount: e.target.value })} className="text-right num" required /></div>
        {!readOnly && <Button type="button" variant="ghost" size="icon" aria-label={`Remover dívida ${index + 1}`} disabled={line.paidCents > 0} title={line.paidCents > 0 ? "Já tem pagamento" : undefined}
          onClick={() => update({ debtLines: draft.debtLines.filter((l) => l.key !== line.key) })}><IconTrash /></Button>}
      </div>)}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span>Soma do rateio: <strong className="num">{money(splitCents / 100)}</strong>
          {mixed && <span className="ml-2 text-muted-foreground">(receitas <span className="num text-success">{money(incomeCents / 100)}</span>, despesas <span className="num text-destructive">{money(expenseCents / 100)}</span>)</span>}
          {debtCents > 0 && <span className="ml-2">· a receber <strong className="num text-destructive">{money(debtCents / 100)}</strong></span>}
        </span>
        {!onlyDebt && <span role="status" aria-live="polite" className={cn("font-semibold", balanced ? "text-success" : "text-destructive")}>
          {balanced ? "✓ Valores conferem" : `Diferença: ${money(remaining / 100)}`}
        </span>}
      </div>
      {!readOnly && !onlyDebt && !balanced && remaining !== 0 && <div className="flex flex-wrap gap-2">
        {totalCents !== 0 && <Button type="button" variant="outline" size="sm" className="w-fit" onClick={fillRemaining}>Lançar diferença na última rubrica</Button>}
        {canDue && <Button type="button" variant="outline" size="sm" className="w-fit" onClick={dueRemaining}>
          Criar dívida com a diferença ({money(-remaining / 100)}) de {associateName(dueSplit!.associateId)}</Button>}
      </div>}
      {entry && draft.debtLines.length > 0 && <p className="m-0 text-xs text-muted-foreground">
        As linhas de dívida deste lançamento ficam na conta dos associados — <Link href="/financeiro/mensalidades/devedores" className="font-semibold text-primary hover:underline">ver em Devedores</Link></p>}
    </fieldset>

    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor="entry-notes">Observações (opcional)</Label>
        <span className="num text-xs text-muted-foreground" aria-live="polite">{draft.notes.length}/{NOTES_MAX}</span>
      </div>
      <Textarea id="entry-notes" rows={5} maxLength={NOTES_MAX} value={draft.notes} readOnly={readOnly}
        onChange={(e) => update({ notes: e.target.value })} className="min-h-28 resize-y" />
      <p className="m-0 text-xs text-muted-foreground">Algum detalhe do lançamento: combinado, quem autorizou, pendência… Entra na busca dos lançamentos.</p>
    </div>

    {!readOnly && <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
      <div>{entry && <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}><IconTrash data-icon="inline-start" /> Excluir lançamento</Button>}</div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => entry && dirty ? setDraft(saved) : router.push(backHref)}>{entry && dirty ? "Descartar alterações" : "Voltar"}</Button>
        {onlyDebt
          ? <Button type="submit" size="lg" disabled={!linesReady || pending}>{pending ? "Salvando…" : "Lançar dívida"}</Button>
          : <Button type="submit" size="lg" disabled={!draft.direction || !balanced || !linesReady || pending || (Boolean(entry) && !dirty)}>{pending ? "Salvando…" : entry ? "Salvar alterações" : receive ? "Receber" : "Salvar lançamento"}</Button>}
      </div>
    </div>}

    {receiving && <ReceiveDialog openDebts={catalogs.openDebts} associateName={associateName}
      used={draft.splits.filter((s) => s.debtId).map((s) => s.debtId)} onClose={() => setReceiving(false)} onAdd={addReceipts} />}

    {entry && <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir lançamento?</DialogTitle>
          <DialogDescription>“{entry.name}”, todos os seus rateios e os comprovantes anexados serão excluídos. As linhas de dívida que ele gerou saem junto (se ninguém pagou nada delas). A exclusão fica registrada na auditoria.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={remove} disabled={pending}>{pending ? "Excluindo…" : "Excluir"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
  </form>;
}

/**
 * "Receber da conta" (024): escolhe o associado e quanto recebeu; reparte pelas linhas em aberto, da mais antiga para a
 * mais nova (`suggestAllocation`), editável. Cada linha que recebe vira um rateio ligado a ela.
 */
function ReceiveDialog({ openDebts, associateName, used, onClose, onAdd }: {
  openDebts: OpenDebt[]; associateName: (id: string) => string; used: string[]; onClose: () => void;
  onAdd: (rows: { debt: OpenDebt; amountCents: number }[]) => void;
}) {
  const available = openDebts.filter((debt) => !used.includes(debt.id));
  const associateOptions = [...new Set(available.map((debt) => debt.associate_id))]
    .map((id) => ({ value: id, label: associateName(id) })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const [associateId, setAssociateId] = useState(associateOptions.length === 1 ? associateOptions[0].value : "");
  const lines = available.filter((debt) => debt.associate_id === associateId);
  const openTotal = lines.reduce((sum, debt) => sum + debt.open_cents, 0);
  const [received, setReceived] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const distribute = (cents: number, list = lines) => setAmounts(Object.fromEntries(
    suggestAllocation(cents, list.map((d) => ({ id: d.id, date: d.debt_date, openCents: d.open_cents }))).map((a) => [a.id, centsToInput(a.amountCents)])));
  const chooseAssociate = (id: string) => {
    setAssociateId(id);
    const list = available.filter((debt) => debt.associate_id === id);
    const total = list.reduce((sum, debt) => sum + debt.open_cents, 0);
    setReceived(centsToInput(total));
    distribute(total, list);
  };
  const rows = lines.map((debt) => ({ debt, amountCents: Math.abs(parseMoneyToCents(amounts[debt.id] ?? "") ?? 0) })).filter((row) => row.amountCents > 0);
  const sum = rows.reduce((total, row) => total + row.amountCents, 0);
  const over = rows.some((row) => row.amountCents > row.debt.open_cents);

  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="w-[min(40rem,calc(100%-2rem))]">
      <DialogHeader>
        <DialogTitle>Receber da conta</DialogTitle>
        <DialogDescription>Quanto o associado pagou: a tela reparte pelas dívidas em aberto, da mais antiga para a mais nova. Ajuste se precisar; cada parte vira um rateio na rubrica daquela dívida.</DialogDescription>
      </DialogHeader>
      <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="grid gap-1.5"><Label htmlFor="receive-associate">Associado</Label>
          <OptionCombobox id="receive-associate" value={associateId} onValueChange={chooseAssociate} options={associateOptions} placeholder="Quem pagou…" emptyText="Ninguém com dívida em aberto." /></div>
        <div className="grid gap-1.5"><Label htmlFor="receive-amount">Valor recebido (R$)</Label>
          <Input id="receive-amount" inputMode="decimal" value={received} disabled={!associateId} className="text-right num"
            onChange={(e) => { setReceived(e.target.value); distribute(Math.abs(parseMoneyToCents(e.target.value) ?? 0)); }} /></div>
      </div>
      {associateId && <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted text-muted-foreground"><tr>
            <th scope="col" className="px-2 py-1 text-left font-medium">Dívida</th>
            <th scope="col" className="px-2 py-1 text-right font-medium">Falta</th>
            <th scope="col" className="w-32 px-2 py-1 text-right font-medium">Recebe (R$)</th>
          </tr></thead>
          <tbody>{lines.map((debt) => <tr key={debt.id} className="border-t">
            <td className="px-2 py-1"><span className="num">{dateBR(debt.debt_date)}</span> {debt.description}</td>
            <td className="px-2 py-1 text-right num">{money(debt.open_cents / 100)}</td>
            <td className="px-2 py-1">
              <Label htmlFor={`receive-${debt.id}`} className="sr-only">Quanto vai para {debt.description}</Label>
              <Input id={`receive-${debt.id}`} inputMode="decimal" placeholder="0,00" value={amounts[debt.id] ?? ""} className="h-7 text-right num"
                onChange={(e) => setAmounts((current) => ({ ...current, [debt.id]: e.target.value }))} />
            </td>
          </tr>)}</tbody>
        </table>
      </div>}
      {associateId && <p className={cn("m-0 text-xs", over && "text-destructive")}>
        Repartido: <strong className="num">{money(sum / 100)}</strong> de <span className="num">{money(openTotal / 100)}</span> em aberto{over && " — uma linha recebe mais do que falta"}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
        <Button type="button" disabled={!rows.length || over} onClick={() => onAdd(rows)}><IconCash data-icon="inline-start" /> Adicionar ao lançamento</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}

function DirectionButton({ value, current, onSelect, disabled }: { value: Direction; current: Direction | null; onSelect: (value: Direction) => void; disabled: boolean }) {
  const selected = current === value;
  const entrada = value === "entrada";
  return <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={() => onSelect(value)}
    className={cn("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:cursor-default",
      selected ? (entrada ? "border-success bg-success-soft text-success" : "border-destructive bg-destructive/10 text-destructive") : "border-border bg-card text-muted-foreground hover:text-foreground",
      disabled && !selected && "opacity-50")}>
    {entrada ? <IconArrowDownLeft className="size-4" aria-hidden /> : <IconArrowUpRight className="size-4" aria-hidden />}
    {entrada ? "Entrada (receita)" : "Saída (despesa)"}
  </button>;
}

function stripKeys(draft: Draft) {
  return { ...draft,
    splits: draft.splits.map((split) => [split.categoryId, split.amount, split.description, split.associateId, split.debtId,
      split.items.map((item) => [item.lotId, item.quantity, item.price])]),
    debtLines: draft.debtLines.map((line) => [line.debtId, line.categoryId, line.description, line.associateId, line.amount]) };
}
