"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconArrowDownLeft, IconArrowUpRight, IconPlus, IconTrash } from "@tabler/icons-react";
import { createEntry, deleteEntry, updateEntry } from "@/app/actions";
import { OptionCombobox, OptionSelect, type Option } from "@/components/option-controls";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { accountAfterPaymentChange } from "@/lib/accounts";
import type { EditableEntry } from "@/lib/entries";
import { centsToInput, money } from "@/lib/format";
import { parseMoneyToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { CategoryItem } from "@/lib/categories";
import { CategoryPicker } from "./category-picker";

export type CatalogItem = { id: string; name: string; active: boolean };
export type PaymentMethodItem = CatalogItem & { default_account_id?: string | null };
export type Catalogs = { categories: CategoryItem[]; paymentMethods: PaymentMethodItem[]; associates: CatalogItem[]; accounts: CatalogItem[] };
type Direction = "entrada" | "saida";

type SplitDraft = { key: number; categoryId: string; amount: string; description: string; associateId: string };
type Draft = { direction: Direction | null; date: string; name: string; total: string; paymentMethodId: string; accountId: string; document: string; documentFiled: boolean; splits: SplitDraft[] };

let splitKey = 0;
const emptySplit = (): SplitDraft => ({ key: ++splitKey, categoryId: "", amount: "", description: "", associateId: "" });

function toDraft(entry: EditableEntry | null): Draft {
  if (!entry) return { direction: null, date: new Date().toISOString().slice(0, 10), name: "", total: "", paymentMethodId: "", accountId: "", document: "", documentFiled: false, splits: [emptySplit()] };
  return {
    direction: entry.totalCents < 0 ? "saida" : "entrada",
    date: entry.date,
    name: entry.name,
    total: centsToInput(Math.abs(entry.totalCents)),
    paymentMethodId: entry.paymentMethodId,
    accountId: entry.accountId,
    document: entry.document,
    documentFiled: entry.documentFiled,
    splits: entry.splits.map((s) => ({ key: ++splitKey, categoryId: s.categoryId, amount: centsToInput(Math.abs(s.amountCents)), description: s.description, associateId: s.associateId ?? "" })),
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

export function EntryForm({ entry, catalogs, canEdit, backHref }: { entry: EditableEntry | null; catalogs: Catalogs; canEdit: boolean; backHref: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => toDraft(entry));
  const [saved, setSaved] = useState<Draft>(() => toDraft(entry));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const readOnly = !canEdit;
  const dirty = JSON.stringify(stripKeys(draft)) !== JSON.stringify(stripKeys(saved));

  const update = (patch: Partial<Draft>) => { setDraft((current) => ({ ...current, ...patch })); };
  const updateSplit = (key: number, patch: Partial<SplitDraft>) => update({ splits: draft.splits.map((s) => s.key === key ? { ...s, ...patch } : s) });

  const options = useMemo(() => ({
    paymentMethods: visibleOptions(catalogs.paymentMethods, [draft.paymentMethodId]),
    accounts: visibleOptions(catalogs.accounts, [saved.accountId]),
    associates: visibleOptions(catalogs.associates, draft.splits.map((s) => s.associateId)),
  }), [catalogs, draft.splits, draft.paymentMethodId, saved.accountId]);

  /** A conta acompanha a conta padrão da forma de pagamento, salvo se escolhida à mão. */
  function choosePaymentMethod(paymentMethodId: string) {
    update({ paymentMethodId, accountId: accountAfterPaymentChange(draft, paymentMethodId, catalogs.paymentMethods, catalogs.accounts) });
  }
  // rubricas do lançamento salvo: continuam selecionáveis mesmo se inativadas depois
  const usedCategoryIds = useMemo(() => saved.splits.map((s) => s.categoryId).filter(Boolean), [saved]);

  const categoryKinds = useMemo(() => new Map(catalogs.categories.map((c) => [c.id, c.kind])), [catalogs.categories]);
  /** Receita soma, despesa subtrai; rubrica sem tipo (antiga) ou ainda não escolhida segue entrada/saída. */
  const splitSign = (split: SplitDraft) => {
    const kind = categoryKinds.get(split.categoryId);
    return kind === "receita" ? 1 : kind === "despesa" ? -1 : directionSign(draft.direction);
  };
  const signedSplit = (split: SplitDraft) => splitSign(split) * magnitude(split.amount);
  const totalCents = draft.direction ? directionSign(draft.direction) * magnitude(draft.total) : 0;
  const splitCents = draft.splits.reduce((sum, s) => sum + signedSplit(s), 0);
  const incomeCents = draft.splits.reduce((sum, s) => sum + Math.max(0, signedSplit(s)), 0);
  const expenseCents = draft.splits.reduce((sum, s) => sum + Math.min(0, signedSplit(s)), 0);
  const mixed = incomeCents !== 0 && expenseCents !== 0;
  const balanced = totalCents !== 0 && splitCents === totalCents;
  const remaining = totalCents - splitCents;

  function chooseDirection(direction: Direction) {
    if (direction !== draft.direction) update({ direction });
  }

  function fillRemaining() {
    const last = draft.splits[draft.splits.length - 1];
    if (!last || remaining === 0) return;
    const sign = splitSign(last);
    updateSplit(last.key, { amount: centsToInput(Math.max(0, sign * (signedSplit(last) + remaining))) });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly) return;
    const payload = {
      date: draft.date,
      name: draft.name,
      paymentMethodId: draft.paymentMethodId,
      accountId: draft.accountId,
      document: draft.document,
      documentFiled: draft.documentFiled,
      totalCents,
      splits: draft.splits.map((s) => ({ categoryId: s.categoryId, amountCents: signedSplit(s), description: s.description, associateId: s.associateId || null })),
    };
    startTransition(async () => {
      const result = entry ? await updateEntry(entry.id, payload) : await createEntry(payload);
      if (result.error) { toast.error(result.error); return; }
      if (!entry) { toast.success("Lançamento salvo."); router.push(backHref); return; }
      setSaved(draft);
      toast.success("Alterações salvas.");
      router.refresh();
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

  return <form onSubmit={submit} className="grid gap-5">

    <fieldset disabled={readOnly} className="grid gap-3">
      <legend className="mb-2 text-sm font-semibold">Linha do extrato</legend>
      <div role="radiogroup" aria-label="Tipo do lançamento" className="flex flex-wrap items-center gap-2">
        <DirectionButton value="entrada" current={draft.direction} onSelect={chooseDirection} disabled={readOnly} />
        <DirectionButton value="saida" current={draft.direction} onSelect={chooseDirection} disabled={readOnly} />
        {!draft.direction && <span className="text-muted-foreground">Comece escolhendo se o dinheiro entrou ou saiu da conta.</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_10rem]">
        <div className="grid gap-1.5"><Label htmlFor="entry-date">Data</Label><Input id="entry-date" type="date" value={draft.date} onChange={(e) => update({ date: e.target.value })} required /></div>
        <div className="grid gap-1.5"><Label htmlFor="entry-name">Nome do lançamento</Label><Input id="entry-name" maxLength={200} placeholder="Quem pagou ou recebeu, emitente da nota…" value={draft.name} onChange={(e) => update({ name: e.target.value })} required /></div>
        <div className="grid gap-1.5"><Label htmlFor="entry-total">Valor total (R$){draft.direction && <span className={cn("ml-1", draft.direction === "saida" ? "text-destructive" : "text-success")}>· {draft.direction === "saida" ? "saída" : "entrada"}</span>}</Label><Input id="entry-total" inputMode="decimal" placeholder="0,00" value={draft.total} onChange={(e) => update({ total: e.target.value })} className="text-right num" required /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-1.5"><Label htmlFor="entry-payment">Forma de pagamento</Label><OptionSelect id="entry-payment" value={draft.paymentMethodId} onValueChange={choosePaymentMethod} options={options.paymentMethods} disabled={readOnly} /></div>
        <div className="grid gap-1.5"><Label htmlFor="entry-account">Conta</Label><OptionSelect id="entry-account" value={draft.accountId} onValueChange={(accountId) => update({ accountId })} options={options.accounts} placeholder="Escolha a conta…" disabled={readOnly} /></div>
        <div className="grid gap-1.5"><Label htmlFor="entry-document">Documento (opcional)</Label><Input id="entry-document" maxLength={60} placeholder="NF 1234, recibo…" value={draft.document} onChange={(e) => update({ document: e.target.value })} /></div>
        <Label className="h-7 w-fit cursor-pointer gap-2 font-medium">
          <Checkbox checked={draft.documentFiled} onCheckedChange={(checked) => update({ documentFiled: checked === true })} disabled={readOnly} />
          Documento arquivado
        </Label>
      </div>
    </fieldset>

    <fieldset disabled={readOnly} className="grid gap-2">
      <div className="flex items-center justify-between">
        <legend className="text-sm font-semibold">Rateio por rubricas</legend>
        {!readOnly && <Button type="button" variant="ghost" size="sm" onClick={() => update({ splits: [...draft.splits, emptySplit()] })}><IconPlus /> Adicionar rubrica</Button>}
      </div>
      {draft.splits.map((split, index) => <div key={split.key} role="group" aria-label={`Rubrica ${index + 1}`} className="grid gap-2 rounded-lg bg-muted p-2.5 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_8rem_auto] sm:items-end">
        <div className="grid gap-1.5"><Label htmlFor={`split-category-${split.key}`}>Rubrica</Label><CategoryPicker id={`split-category-${split.key}`} value={split.categoryId} onChange={(categoryId) => updateSplit(split.key, { categoryId })} categories={catalogs.categories} preferredKind={kindFor(draft.direction)} usedIds={usedCategoryIds} placeholder="Buscar receita ou despesa…" disabled={readOnly} /></div>
        <div className="grid gap-1.5"><Label htmlFor={`split-description-${split.key}`}>Descrição</Label><Input id={`split-description-${split.key}`} maxLength={200} placeholder="Ex.: Lanche do acampamento" value={split.description} onChange={(e) => updateSplit(split.key, { description: e.target.value })} required /></div>
        <div className="grid gap-1.5"><Label htmlFor={`split-associate-${split.key}`}>Associado (opcional)</Label><OptionCombobox id={`split-associate-${split.key}`} value={split.associateId} onValueChange={(associateId) => updateSplit(split.key, { associateId })} options={options.associates} placeholder={readOnly ? "—" : "Buscar associado…"} emptyText="Nenhum associado encontrado." disabled={readOnly} /></div>
        <div className="grid gap-1.5"><Label htmlFor={`split-amount-${split.key}`}>Valor (R$){split.categoryId && <span className={cn("ml-1", splitSign(split) < 0 ? "text-destructive" : "text-success")}>{splitSign(split) < 0 ? "−" : "+"}</span>}</Label><Input id={`split-amount-${split.key}`} inputMode="decimal" placeholder="0,00" value={split.amount} onChange={(e) => updateSplit(split.key, { amount: e.target.value })} className="text-right num" required /></div>
        {!readOnly && <Button type="button" variant="ghost" size="icon" aria-label={`Remover rubrica ${index + 1}`} disabled={draft.splits.length === 1} onClick={() => update({ splits: draft.splits.filter((s) => s.key !== split.key) })}><IconTrash /></Button>}
      </div>)}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <span>Soma do rateio: <strong className="num">{money(splitCents / 100)}</strong>
          {mixed && <span className="ml-2 text-muted-foreground">(receitas <span className="num text-success">{money(incomeCents / 100)}</span>, despesas <span className="num text-destructive">{money(expenseCents / 100)}</span>)</span>}
        </span>
        <span role="status" aria-live="polite" className={cn("font-semibold", balanced ? "text-success" : "text-destructive")}>
          {balanced ? "✓ Valores conferem" : `Diferença: ${money(remaining / 100)}`}
        </span>
      </div>
      {!readOnly && !balanced && remaining !== 0 && totalCents !== 0 && <Button type="button" variant="outline" size="sm" className="w-fit" onClick={fillRemaining}>Lançar diferença na última rubrica</Button>}
    </fieldset>

    {!readOnly && <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
      <div>{entry && <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)}><IconTrash /> Excluir lançamento</Button>}</div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" onClick={() => entry && dirty ? setDraft(saved) : router.push(backHref)}>{entry && dirty ? "Descartar alterações" : "Voltar"}</Button>
        <Button type="submit" size="lg" disabled={!draft.direction || !balanced || pending || (Boolean(entry) && !dirty)}>{pending ? "Salvando…" : entry ? "Salvar alterações" : "Salvar lançamento"}</Button>
      </div>
    </div>}

    {entry && <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir lançamento?</DialogTitle>
          <DialogDescription>“{entry.name}” e todos os seus rateios serão excluídos. A exclusão fica registrada na auditoria.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={remove} disabled={pending}>{pending ? "Excluindo…" : "Excluir"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>}
  </form>;
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
  return { ...draft, splits: draft.splits.map((split) => [split.categoryId, split.amount, split.description, split.associateId]) };
}
