"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconAlertTriangle, IconCash, IconChevronRight, IconDots, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { debtPaymentOptions, deleteDebt, payDebts, saveDebt } from "@/app/(financeiro)/financeiro/mensalidades/actions";
import { centsToInput, dateBR, money } from "@/lib/format";
import { todayInSaoPaulo } from "@/lib/finance/fees";
import { parseMoneyToCents } from "@/lib/money";
import { debtOpenCents, debtStatus, debtTotals, distributePayment, groupDebts, oldestFirst, optionFreeCents, DEBT_STATUS_LABELS, type Debt, type DebtorGroup, type DebtStatus, type PaymentOption } from "@/lib/finance/debts";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geas/ui/components/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@geas/ui/components/dropdown-menu";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionCombobox, OptionSelect } from "@geas/ui/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { StatCard } from "@geas/ui/components/stat-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { Textarea } from "@geas/ui/components/textarea";
import { cn } from "@geas/ui/lib/utils";

type AssociateOption = { value: string; label: string; active: boolean };

const STATUS_CLASS: Record<DebtStatus, string> = {
  aberta: "bg-destructive/10 text-destructive",
  parcial: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  quitada: "bg-success-soft text-success",
};

/**
 * Dívidas agrupadas por devedor, quem deve mais primeiro. Tesouraria/administração vê o associado e os lançamentos
 * que pagaram; a consulta vê "Devedor N" e nada que leve ao associado (o banco não entrega, ver `debt_rows`).
 */
export function DebtsManager({ debts, canEdit, associates }: { debts: Debt[]; canEdit: boolean; associates: AssociateOption[] }) {
  const [showPaid, setShowPaid] = useState(false);
  // dívida a editar, ou nova (com o associado já escolhido quando vem do grupo)
  const [editing, setEditing] = useState<Debt | { associateId: string } | null>(null);
  const [removing, setRemoving] = useState<Debt | null>(null);
  // devedor (associado) cujo pagamento está sendo registrado
  const [paying, setPaying] = useState<DebtorGroup | null>(null);
  const totals = useMemo(() => debtTotals(debts), [debts]);
  const paidCount = debts.length - totals.openCount;
  const groups = useMemo(() => groupDebts(debts)
    .map((group) => (showPaid ? group : { ...group, debts: group.debts.filter((debt) => debtStatus(debt) !== "quitada") }))
    .filter((group) => group.debts.length > 0), [debts, showPaid]);
  // devedores abertos (accordion): começa tudo recolhido, só o resumo de cada um
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setExpanded((set) => { const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const allOpen = groups.length > 0 && groups.every((group) => expanded.has(group.key));
  const debtors = new Set(debts.filter((debt) => debtStatus(debt) !== "quitada").map((debt) => debt.debtorNumber)).size;

  return <>
    <div className="grid items-start gap-3 sm:grid-cols-3">
      <StatCard label="Em aberto" value={money(totals.openCents / 100)} tone={totals.openCents > 0 ? "destructive" : "neutral"} />
      <StatCard label="Devedores" value={`${debtors} (${totals.openCount} ${totals.openCount === 1 ? "dívida" : "dívidas"})`} />
      <StatCard label="Já pago" value={money(totals.paidCents / 100)} tone="success" />
    </div>

    <SectionCard aria-labelledby="debts-title">
      <SectionHeader title="Devedores" titleId="debts-title"
        description={canEdit ? "A consulta vê data, descrição, acordo e valores, sem o associado: não escreva o nome na descrição nem no acordo." : undefined}>
        {paidCount > 0 && <Label className="font-normal text-xs">
          <Checkbox checked={showPaid} onCheckedChange={(checked) => setShowPaid(checked === true)} />
          Mostrar quitadas ({paidCount})
        </Label>}
        <SectionCount>{totals.openCount} em aberto de {debts.length}</SectionCount>
        {groups.length > 1 && <Button variant="outline" onClick={() => setExpanded(allOpen ? new Set() : new Set(groups.map((group) => group.key)))}>
          {allOpen ? "Recolher todos" : "Expandir todos"}</Button>}
        {canEdit && <Button onClick={() => setEditing({ associateId: "" })}><IconPlus /> Nova dívida</Button>}
      </SectionHeader>
      {groups.length === 0
        ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">{debts.length ? "Nenhuma dívida em aberto." : "Nenhuma dívida anotada."}</p>
        : <div className="overflow-x-auto"><Table className="min-w-[720px]">
          <TableCaption className="sr-only">Dívidas anotadas</TableCaption>
          <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
            <TableHead className="h-8 w-56 px-3">Devedor / data</TableHead>
            <TableHead className="h-8 px-3">Descrição</TableHead>
            <TableHead className="h-8 w-28 px-3 text-right">Valor</TableHead>
            <TableHead className="h-8 w-28 px-3 text-right">Pago</TableHead>
            <TableHead className="h-8 w-28 px-3">Situação</TableHead>
            {canEdit && <TableHead className="h-8 w-12 px-3"><span className="sr-only">Ações</span></TableHead>}
          </TableRow></TableHeader>
          <TableBody>{groups.map((group) => <Fragment key={group.key}>
            <DebtorRow group={group} canEdit={canEdit} open={expanded.has(group.key)} onToggle={() => toggle(group.key)}
              onAdd={() => setEditing({ associateId: group.associateId ?? "" })} onPay={() => setPaying(group)} />
            {expanded.has(group.key) && group.debts.map((debt) => <DebtRow key={debt.id} debt={debt} canEdit={canEdit}
              onEdit={() => setEditing(debt)} onRemove={() => setRemoving(debt)} />)}
          </Fragment>)}</TableBody>
        </Table></div>}
    </SectionCard>

    {canEdit && <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent className="w-[min(40rem,calc(100%-2rem))]">
        {editing !== null && <DebtForm key={"id" in editing ? editing.id : `new-${editing.associateId}`} debt={"id" in editing ? editing : null}
          initialAssociateId={editing.associateId ?? ""} associates={associates} onDone={() => setEditing(null)} />}
      </DialogContent>
    </Dialog>}

    {canEdit && <Dialog open={paying !== null} onOpenChange={(open) => { if (!open) setPaying(null); }}>
      <DialogContent className="w-[min(44rem,calc(100%-2rem))]">
        {paying?.associateId && <PayDebtsForm key={paying.key} label={paying.label} associateId={paying.associateId}
          debts={debts.filter((debt) => debt.associateId === paying.associateId)} onDone={() => setPaying(null)} />}
      </DialogContent>
    </Dialog>}

    {canEdit && <Dialog open={removing !== null} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
      <DialogContent className="w-[min(30rem,calc(100%-2rem))]">
        {removing && <RemoveDebt debt={removing} onDone={() => setRemoving(null)} />}
      </DialogContent>
    </Dialog>}
  </>;
}

/**
 * Linha do devedor (accordion): nome ou "Devedor N" e quantas dívidas, com os totais nas colunas de valor;
 * clicar abre as dívidas dele. Para a tesouraria, atalho para nova dívida do associado.
 */
function DebtorRow({ group, canEdit, open, onToggle, onAdd, onPay }: { group: DebtorGroup; canEdit: boolean; open: boolean; onToggle: () => void; onAdd: () => void; onPay: () => void }) {
  const status: DebtStatus = group.openCents === 0 ? "quitada" : group.paidCents > 0 ? "parcial" : "aberta";
  return <TableRow className={cn("bg-muted/40 hover:bg-muted", open && "bg-muted")}>
    <TableHead scope="rowgroup" colSpan={2} className="h-auto p-0 font-normal">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-center gap-1.5 px-3 py-2 text-left">
        <IconChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} aria-hidden />
        <span className="font-semibold text-foreground">{group.label}</span>
        <span className="text-xs text-muted-foreground">({group.debts.length} {group.debts.length === 1 ? "dívida" : "dívidas"}{group.openCount > 0 && group.openCount < group.debts.length ? `, ${group.openCount} em aberto` : ""})</span>
      </button>
    </TableHead>
    <TableCell className="px-3 py-2 text-right num font-semibold">{money(group.amountCents / 100)}</TableCell>
    <TableCell className="px-3 py-2 text-right num">{group.paidCents ? money(group.paidCents / 100) : <span className="text-muted-foreground">—</span>}</TableCell>
    <TableCell className="px-3 py-2">
      {status === "quitada"
        ? <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CLASS.quitada)}>Quitado</span>
        : <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold num", STATUS_CLASS[status])}>falta {money(group.openCents / 100)}</span>}
      {group.creditCents > 0 && <div className="text-xs text-muted-foreground" title="Receita dos lançamentos vinculados ainda não usada em dívidas">crédito {money(group.creditCents / 100)}</div>}
    </TableCell>
    {canEdit && <TableCell className="px-3 py-1">
      {group.associateId && <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${group.label}`} />}><IconDots /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={onPay}><IconCash /> Registrar pagamento</DropdownMenuItem>
          <DropdownMenuItem onClick={onAdd}><IconPlus /> Nova dívida</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>}
    </TableCell>}
  </TableRow>;
}

function DebtRow({ debt, canEdit, onEdit, onRemove }: { debt: Debt; canEdit: boolean; onEdit: () => void; onRemove: () => void }) {
  const status = debtStatus(debt);
  return <TableRow className="align-top">
    <TableCell className="px-3 py-1.5 pl-9 num">{dateBR(debt.date)}</TableCell>
    <TableCell className="px-3 py-1.5">
      <div>{debt.description}</div>
      {debt.agreement && <div className="text-xs text-muted-foreground"><span className="font-semibold">Acordo:</span> {debt.agreement}</div>}
      {debt.payments && debt.payments.length > 0 && <div className="text-xs text-muted-foreground">
        Pago em {debt.payments.map((payment, index) => <span key={payment.entryId}>{index > 0 && ", "}
          <Link href={`/financeiro/lancamentos/${payment.entryId}`} className="text-primary hover:underline"
            title={`${payment.entryName}: ${money(payment.amountCents / 100)} desta dívida, de ${money(payment.entryAvailableCents / 100)} do associado no lançamento`}>
            {dateBR(payment.entryDate)} ({money(payment.amountCents / 100)}{payment.entryAvailableCents !== payment.amountCents && ` de ${money(payment.entryAvailableCents / 100)}`})</Link>
        </span>)}
      </div>}
      {debt.paymentMismatch && <div className="flex items-center gap-1 text-xs text-destructive">
        <IconAlertTriangle className="size-3.5 shrink-0" aria-hidden />
        Um lançamento foi alterado e não cobre mais o valor vinculado: ajuste os pagamentos.
      </div>}
    </TableCell>
    <TableCell className="px-3 py-1.5 text-right num">{money(debt.amountCents / 100)}</TableCell>
    <TableCell className="px-3 py-1.5 text-right num">
      {debt.paidCents ? money(debt.paidCents / 100) : <span className="text-muted-foreground">—</span>}
      {status === "parcial" && <div className="text-xs text-muted-foreground">falta {money(debtOpenCents(debt) / 100)}</div>}
    </TableCell>
    <TableCell className="px-3 py-1.5">
      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_CLASS[status])}>{DEBT_STATUS_LABELS[status]}</span>
    </TableCell>
    {canEdit && <TableCell className="px-3 py-1">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações da dívida de ${dateBR(debt.date)}: ${debt.description}`} />}><IconDots /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}><IconPencil /> Editar</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onRemove}><IconTrash /> Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </TableCell>}
  </TableRow>;
}

/**
 * Lançamentos com receita do associado e o que já pagam de dívidas dele. `linked` entra mesmo se for mais antigo
 * que os últimos 200 rateios (pagamentos já gravados da dívida em edição). null = carregando.
 */
function usePaymentOptions(associateId: string, linked: PaymentOption[] = []) {
  const [loaded, setLoaded] = useState<{ associateId: string; options: PaymentOption[] } | null>(null);
  useEffect(() => {
    if (!associateId) return;
    let current = true;
    debtPaymentOptions(associateId).then((result) => {
      if (!current) return;
      if (result.error) toast.error(result.error);
      const list = result.options ?? [];
      setLoaded({ associateId, options: [...list, ...linked.filter((p) => !list.some((o) => o.entryId === p.entryId))] });
    });
    return () => { current = false; };
    // linked vem da dívida em edição: muda junto com o associado
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [associateId]);
  return !associateId ? [] : loaded?.associateId === associateId ? loaded.options : null;
}

/** Pagamentos gravados de uma dívida como opções (com o que o lançamento já paga de outras dívidas). */
function linkedOptions(debt: Debt | null): PaymentOption[] {
  return (debt?.payments ?? []).map((p) => ({
    entryId: p.entryId, entryDate: p.entryDate, entryName: p.entryName, availableCents: p.entryAvailableCents,
    allocations: [{ debtId: debt!.id, amountCents: p.amountCents },
      { debtId: "outras", amountCents: Math.max(p.entryAvailableCents - p.entryUnallocatedCents - p.amountCents, 0) }],
  }));
}

const cents = (value: string) => parseMoneyToCents(value) ?? 0;

function DebtForm({ debt, initialAssociateId, associates, onDone }: { debt: Debt | null; initialAssociateId: string; associates: AssociateOption[]; onDone: () => void }) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const [associateId, setAssociateId] = useState(debt?.associateId ?? initialAssociateId);
  const [date, setDate] = useState(debt?.date ?? todayInSaoPaulo());
  const [amount, setAmount] = useState(debt ? centsToInput(debt.amountCents) : "");
  const [description, setDescription] = useState(debt?.description ?? "");
  const [agreement, setAgreement] = useState(debt?.agreement ?? "");
  // lançamento → valor desta dívida ("50,00"); presente = marcado
  const [payments, setPayments] = useState<Record<string, string>>(
    Object.fromEntries((debt?.payments ?? []).map((p) => [p.entryId, centsToInput(p.amountCents)])));
  const options = usePaymentOptions(associateId, associateId === debt?.associateId ? linkedOptions(debt) : []);

  const paid = Object.values(payments).reduce((sum, value) => sum + cents(value), 0);
  const debtCents = parseMoneyToCents(amount);
  const associateOptions = associates.filter((a) => a.active || a.value === debt?.associateId);

  const toggle = (option: PaymentOption, checked: boolean) => setPayments((current) => {
    const next = { ...current };
    if (!checked) { delete next[option.entryId]; return next; }
    // sugere o que falta da dívida, até a sobra do lançamento
    const others = Object.entries(current).reduce((sum, [, value]) => sum + cents(value), 0);
    const free = optionFreeCents(option, debt?.id);
    const owed = debtCents && debtCents > 0 ? debtCents - others : free;
    next[option.entryId] = centsToInput(Math.max(Math.min(free, owed), 0));
    return next;
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startSaving(async () => {
      const result = await saveDebt({
        id: debt?.id ?? "", associateId, date, amount, description, agreement,
        payments: Object.entries(payments).map(([entryId, value]) => ({ entryId, amount: value })),
      });
      if (result.error) { toast.error(result.error); return; }
      toast.success(result.success);
      onDone();
      router.refresh();
    });
  };
  const field = (name: string) => `debt-${debt?.id ?? "new"}-${name}`;

  return <form className="grid gap-3" onSubmit={submit}>
    <DialogHeader>
      <DialogTitle>{debt ? "Editar dívida" : "Nova dívida"}</DialogTitle>
      <DialogDescription>A consulta vê a data, a descrição, o acordo e os valores, mas não o associado nem os lançamentos. Não escreva o nome na descrição nem no acordo.</DialogDescription>
    </DialogHeader>
    <div className="grid gap-1.5"><Label htmlFor={field("associate")}>Associado</Label>
      <OptionCombobox id={field("associate")} value={associateId} onValueChange={(value) => { setAssociateId(value); setPayments({}); }}
        options={associateOptions} placeholder="Buscar associado…" emptyText="Nenhum associado encontrado." /></div>
    <div className="grid items-start gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5"><Label htmlFor={field("date")}>Data</Label>
        <Input id={field("date")} type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></div>
      <div className="grid gap-1.5"><Label htmlFor={field("amount")}>Valor (R$)</Label>
        <Input id={field("amount")} inputMode="decimal" placeholder="Ex.: 150,00" value={amount} onChange={(event) => setAmount(event.target.value)} className="text-right num" required /></div>
    </div>
    <div className="grid gap-1.5"><Label htmlFor={field("description")}>Descrição</Label>
      <Input id={field("description")} value={description} maxLength={200} placeholder="Ex.: Acampamento de março" onChange={(event) => setDescription(event.target.value)} required /></div>
    <div className="grid gap-1.5"><Label htmlFor={field("agreement")}>Acordo de pagamento (opcional)</Label>
      <Textarea id={field("agreement")} value={agreement} maxLength={300} rows={2} placeholder="Ex.: 3 parcelas de R$ 50,00 a partir de abril" onChange={(event) => setAgreement(event.target.value)} /></div>
    <fieldset className="m-0 grid gap-1.5 border-0 p-0">
      <legend className="mb-1.5 text-xs font-medium">Pagamentos (opcional)</legend>
      <p className="m-0 text-xs text-muted-foreground">Lançamentos com rateio de receita do associado. Informe quanto de cada um vai para esta dívida; a sobra pode pagar outras dívidas dele.</p>
      {!associateId ? <p className="m-0 text-xs text-muted-foreground">Escolha o associado para ver os lançamentos.</p>
        : options === null ? <p className="m-0 text-xs text-muted-foreground">Carregando…</p>
        : options.length === 0 ? <p className="m-0 text-xs text-muted-foreground">Nenhum lançamento de receita com este associado.</p>
        : <PaymentChoices options={options} debtId={debt?.id} payments={payments} field={field} onToggle={toggle}
          onAmount={(entryId, value) => setPayments((current) => ({ ...current, [entryId]: value }))} />}
      {Object.keys(payments).length > 0 && <p className={cn("m-0 text-xs", debtCents !== null && paid > debtCents && "text-destructive")}>
        Pago: <strong className="num">{money(paid / 100)}</strong>{debtCents !== null && debtCents > 0 && <> de <span className="num">{money(debtCents / 100)}</span>{paid > debtCents && " — passa do valor da dívida"}</>}
      </p>}
    </fieldset>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
      <Button type="submit" disabled={saving}>{saving ? "Salvando…" : debt ? "Salvar dívida" : "Anotar dívida"}</Button>
    </DialogFooter>
  </form>;
}

/** Lista de lançamentos do formulário da dívida: marcar e informar o valor desta dívida. */
function PaymentChoices({ options, debtId, payments, field, onToggle, onAmount }: {
  options: PaymentOption[]; debtId?: string; payments: Record<string, string>; field: (name: string) => string;
  onToggle: (option: PaymentOption, checked: boolean) => void; onAmount: (entryId: string, value: string) => void;
}) {
  return <div className="max-h-56 overflow-y-auto rounded-md border">
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-muted text-muted-foreground"><tr>
        <th scope="col" className="px-2 py-1 text-left font-medium">Lançamento</th>
        <th scope="col" className="px-2 py-1 text-right font-medium" title="Receita do associado no lançamento ainda não usada em outras dívidas">Sobra</th>
        <th scope="col" className="w-28 px-2 py-1 text-right font-medium">Valor (R$)</th>
      </tr></thead>
      <tbody>{options.map((option) => {
        const free = optionFreeCents(option, debtId);
        const checked = option.entryId in payments;
        const id = field(`entry-${option.entryId}`);
        const title = `${dateBR(option.entryDate)} ${option.entryName}`;
        return <tr key={option.entryId} className={cn("border-t", !checked && free <= 0 && "text-muted-foreground")}>
          <td className="px-2 py-1">
            <Label htmlFor={id} className="flex items-center gap-2 font-normal text-xs">
              <Checkbox id={id} checked={checked} disabled={!checked && free <= 0} onCheckedChange={(value) => onToggle(option, value === true)} />
              <span className="num">{dateBR(option.entryDate)}</span>
              <span className="min-w-0 flex-1 truncate">{option.entryName}</span>
            </Label>
          </td>
          <td className="px-2 py-1 text-right num whitespace-nowrap">{money(Math.max(free, 0) / 100)} <span className="text-muted-foreground">de {money(option.availableCents / 100)}</span></td>
          <td className="px-2 py-1">
            {checked && <>
              <Label htmlFor={`${id}-amount`} className="sr-only">Valor de {title} para esta dívida</Label>
              <Input id={`${id}-amount`} inputMode="decimal" value={payments[option.entryId]} onChange={(event) => onAmount(option.entryId, event.target.value)} className="h-7 text-right num" />
            </>}
          </td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

/**
 * Registrar pagamento pelo devedor: escolhe um lançamento e reparte a receita do associado nele entre as dívidas,
 * da mais antiga para a mais nova (editável). Grava só as alocações deste lançamento (`pay_debts`).
 */
function PayDebtsForm({ label, associateId, debts, onDone }: { label: string; associateId: string; debts: Debt[]; onDone: () => void }) {
  const router = useRouter();
  const [saving, startSaving] = useTransition();
  const options = usePaymentOptions(associateId);
  const [entryId, setEntryId] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const option = options?.find((o) => o.entryId === entryId) ?? null;

  // o que cada dívida deve sem contar o que este lançamento já paga dela
  const rows = oldestFirst(debts).map((debt) => {
    const current = option?.allocations.find((a) => a.debtId === debt.id)?.amountCents ?? 0;
    return { debt, current, owedCents: Math.max(debt.amountCents - (debt.paidCents - current), 0) };
  }).filter((row) => row.owedCents > 0 || row.current > 0);

  const choose = (id: string) => {
    setEntryId(id);
    const chosen = options?.find((o) => o.entryId === id);
    if (!chosen) { setAmounts({}); return; }
    const list = oldestFirst(debts).map((debt) => {
      const current = chosen.allocations.find((a) => a.debtId === debt.id)?.amountCents ?? 0;
      return { id: debt.id, current, owedCents: Math.max(debt.amountCents - (debt.paidCents - current), 0) };
    });
    // já usado neste devedor: mostra o gravado; senão, sugere repartir da mais antiga para a mais nova
    const suggestion = chosen.allocations.length
      ? list.filter((d) => d.current > 0).map((d) => ({ debtId: d.id, amountCents: d.current }))
      : distributePayment(chosen.availableCents, list);
    setAmounts(Object.fromEntries(suggestion.map((a) => [a.debtId, centsToInput(a.amountCents)])));
  };

  const total = Object.values(amounts).reduce((sum, value) => sum + cents(value), 0);
  const left = option ? option.availableCents - total : 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startSaving(async () => {
      const result = await payDebts({ associateId, entryId, allocations: rows.map((row) => ({ debtId: row.debt.id, amount: amounts[row.debt.id] ?? "" })) });
      if (result.error) { toast.error(result.error); return; }
      toast.success(result.success);
      onDone();
      router.refresh();
    });
  };

  return <form className="grid gap-3" onSubmit={submit}>
    <DialogHeader>
      <DialogTitle>Registrar pagamento de {label}</DialogTitle>
      <DialogDescription>Escolha o lançamento: a receita do associado nele é repartida entre as dívidas em aberto, da mais antiga para a mais nova. Ajuste os valores se precisar.</DialogDescription>
    </DialogHeader>
    <div className="grid gap-1.5"><Label htmlFor="pay-entry">Lançamento</Label>
      {options === null ? <p className="m-0 text-xs text-muted-foreground">Carregando…</p>
        : <OptionSelect id="pay-entry" value={entryId} onValueChange={choose} placeholder={options.length ? "Escolha o lançamento…" : "Nenhum lançamento de receita com este associado"}
          disabled={!options.length}
          options={options.map((o) => ({ value: o.entryId, label: `${dateBR(o.entryDate)} · ${o.entryName} · ${money(o.availableCents / 100)} (sobra ${money(Math.max(optionFreeCents(o), 0) / 100)})` }))} />}
    </div>
    {option && <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead className="bg-muted text-muted-foreground"><tr>
          <th scope="col" className="px-2 py-1 text-left font-medium">Dívida</th>
          <th scope="col" className="px-2 py-1 text-right font-medium">Falta</th>
          <th scope="col" className="w-32 px-2 py-1 text-right font-medium">Valor (R$)</th>
        </tr></thead>
        <tbody>{rows.length === 0
          ? <tr><td colSpan={3} className="px-2 py-3 text-center text-muted-foreground">Nenhuma dívida em aberto.</td></tr>
          : rows.map((row) => <tr key={row.debt.id} className="border-t">
            <td className="px-2 py-1"><span className="num">{dateBR(row.debt.date)}</span> {row.debt.description}</td>
            <td className="px-2 py-1 text-right num">{money(row.owedCents / 100)}</td>
            <td className="px-2 py-1">
              <Label htmlFor={`pay-${row.debt.id}`} className="sr-only">Valor para {row.debt.description}</Label>
              <Input id={`pay-${row.debt.id}`} inputMode="decimal" placeholder="0,00" value={amounts[row.debt.id] ?? ""}
                onChange={(event) => setAmounts((current) => ({ ...current, [row.debt.id]: event.target.value }))} className="h-7 text-right num" />
            </td>
          </tr>)}</tbody>
      </table>
    </div>}
    {option && <p className={cn("m-0 text-xs", left < 0 && "text-destructive")}>
      Usado: <strong className="num">{money(total / 100)}</strong> de <span className="num">{money(option.availableCents / 100)}</span>
      {left > 0 && <> · sobra <span className="num">{money(left / 100)}</span> como crédito</>}
      {left < 0 && " — passa do valor do lançamento"}
    </p>}
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
      <Button type="submit" disabled={saving || !option}><IconCash /> {saving ? "Salvando…" : "Registrar pagamento"}</Button>
    </DialogFooter>
  </form>;
}

function RemoveDebt({ debt, onDone }: { debt: Debt; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <>
    <DialogHeader>
      <DialogTitle>Excluir dívida</DialogTitle>
      <DialogDescription>{debt.associateName}: {debt.description} ({money(debt.amountCents / 100)}, {dateBR(debt.date)}). Os lançamentos vinculados continuam; só a anotação sai.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={onDone}>Cancelar</Button>
      <Button variant="destructive" disabled={pending} onClick={() => start(async () => {
        const result = await deleteDebt(debt.id);
        if (result.error) { toast.error(result.error); return; }
        toast.success(result.success);
        onDone();
        router.refresh();
      })}><IconTrash /> {pending ? "Excluindo…" : "Excluir"}</Button>
    </DialogFooter>
  </>;
}
