"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Link } from "@geas/ui/components/link";
import { toast } from "sonner";
import { IconChevronRight, IconDots, IconPackage, IconPencil, IconPlus, IconReceipt, IconTrash } from "@tabler/icons-react";
import { deleteDebt, saveDebt } from "@/app/(financeiro)/financeiro/mensalidades/actions";
import { centsToInput, dateBR, money } from "@/lib/format";
import { todayInSaoPaulo } from "@/lib/finance/fees";
import { debtOpenCents, debtOriginLabel, debtStatus, debtTotals, groupDebts, DEBT_STATUS_LABELS, type Debt, type DebtorGroup, type DebtStatus } from "@/lib/finance/debts";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geas/ui/components/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@geas/ui/components/dropdown-menu";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionCombobox, type Option } from "@geas/ui/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { StatCard } from "@geas/ui/components/stat-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { Textarea } from "@geas/ui/components/textarea";
import { Badge } from "@geas/ui/components/badge";
import { cn } from "@geas/ui/lib/utils";

type AssociateOption = { value: string; label: string; active: boolean };

const STATUS_VARIANT: Record<DebtStatus, "destructive" | "warning" | "success"> = {
  aberta: "destructive",
  parcial: "warning",
  quitada: "success",
};

/** Abre o lançamento já ligado à dívida (rubrica, associado e o que falta). */
const receiveHref = (debt: Pick<Debt, "id">) => `/financeiro/lancamentos/novo?receber=${debt.id}`;

/**
 * Dívidas agrupadas por devedor, quem deve mais primeiro (023: cada dívida numa rubrica; paga só por rateios ligados a
 * ela). Tesouraria/administração vê o associado e os lançamentos que pagaram; a consulta vê "Devedor N" e nada que leve
 * ao associado (o banco não entrega, ver `debt_rows`).
 */
export function DebtsManager({ debts, canEdit, associates, categories }: { debts: Debt[]; canEdit: boolean; associates: AssociateOption[]; categories: Option[] }) {
  const [showPaid, setShowPaid] = useState(false);
  // dívida a editar, ou nova (com o associado já escolhido quando vem do grupo)
  const [editing, setEditing] = useState<Debt | { associateId: string } | null>(null);
  const [removing, setRemoving] = useState<Debt | null>(null);
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
        description={canEdit ? "A consulta vê data, rubrica, descrição, acordo e valores, sem o associado: não escreva o nome na descrição nem no acordo." : undefined}>
        {paidCount > 0 && <Label className="font-normal text-xs">
          <Checkbox checked={showPaid} onCheckedChange={(checked) => setShowPaid(checked === true)} />
          Mostrar quitadas ({paidCount})
        </Label>}
        <SectionCount>{totals.openCount} em aberto de {debts.length}</SectionCount>
        {groups.length > 1 && <Button variant="outline" onClick={() => setExpanded(allOpen ? new Set() : new Set(groups.map((group) => group.key)))}>
          {allOpen ? "Recolher todos" : "Expandir todos"}</Button>}
        {canEdit && <Button onClick={() => setEditing({ associateId: "" })}><IconPlus data-icon="inline-start" /> Nova dívida</Button>}
      </SectionHeader>
      {groups.length === 0
        ? <p className="px-4 py-8 text-center text-xs text-muted-foreground">{debts.length ? "Nenhuma dívida em aberto." : "Nenhuma dívida anotada."}</p>
        : <div className="overflow-x-auto"><Table className="min-w-[760px]">
          <TableCaption className="sr-only">Dívidas anotadas</TableCaption>
          <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
            <TableHead className="h-8 w-56 px-3">Devedor / data</TableHead>
            <TableHead className="h-8 px-3">Rubrica e descrição</TableHead>
            <TableHead className="h-8 w-28 px-3 text-right">Valor</TableHead>
            <TableHead className="h-8 w-28 px-3 text-right">Pago</TableHead>
            <TableHead className="h-8 w-28 px-3">Situação</TableHead>
            {canEdit && <TableHead className="h-8 w-12 px-3"><span className="sr-only">Ações</span></TableHead>}
          </TableRow></TableHeader>
          <TableBody>{groups.map((group) => <Fragment key={group.key}>
            <DebtorRow group={group} canEdit={canEdit} open={expanded.has(group.key)} onToggle={() => toggle(group.key)}
              onAdd={() => setEditing({ associateId: group.associateId ?? "" })} />
            {expanded.has(group.key) && group.debts.map((debt) => <DebtRow key={debt.id} debt={debt} canEdit={canEdit}
              onEdit={() => setEditing(debt)} onRemove={() => setRemoving(debt)} />)}
          </Fragment>)}</TableBody>
        </Table></div>}
    </SectionCard>

    {canEdit && <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent className="w-[min(40rem,calc(100%-2rem))]">
        {editing !== null && <DebtForm key={"id" in editing ? editing.id : `new-${editing.associateId}`} debt={"id" in editing ? editing : null}
          initialAssociateId={editing.associateId ?? ""} associates={associates} categories={categories} onDone={() => setEditing(null)} />}
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
function DebtorRow({ group, canEdit, open, onToggle, onAdd }: { group: DebtorGroup; canEdit: boolean; open: boolean; onToggle: () => void; onAdd: () => void }) {
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
        ? <Badge size="md" variant="success">Quitado</Badge>
        : <Badge size="md" variant={STATUS_VARIANT[status]} className="num">falta {money(group.openCents / 100)}</Badge>}
    </TableCell>
    {canEdit && <TableCell className="px-3 py-1">
      {group.associateId && <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${group.label}`} />}><IconDots /></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={onAdd}><IconPlus /> Nova dívida</DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>}
    </TableCell>}
  </TableRow>;
}

function DebtRow({ debt, canEdit, onEdit, onRemove }: { debt: Debt; canEdit: boolean; onEdit: () => void; onRemove: () => void }) {
  const status = debtStatus(debt);
  const fixed = debt.origin === "mensalidade";
  return <TableRow className="align-top">
    <TableCell className="px-3 py-1.5 pl-9 num">{dateBR(debt.date)}</TableCell>
    <TableCell className="px-3 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="font-normal">{debt.categoryLabel}</Badge>
        <span>{debt.description}</span>
      </div>
      <div className="text-xs text-muted-foreground">
        {debtOriginLabel(debt)}
        {debt.originEntryId && <> · <Link href={`/financeiro/lancamentos/${debt.originEntryId}`} className="text-primary hover:underline">lançamento de origem</Link></>}
      </div>
      {debt.items && debt.items.length > 0 && <div className="flex items-start gap-1 text-xs text-muted-foreground">
        <IconPackage className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
        <span><span className="font-semibold">Venda:</span> {debt.items.map((item) => `${item.quantity}× ${item.name} (${money(item.unitPriceCents / 100)})`).join(", ")}</span>
      </div>}
      {debt.agreement && <div className="text-xs text-muted-foreground"><span className="font-semibold">Acordo:</span> {debt.agreement}</div>}
      {debt.payments && debt.payments.length > 0 && <div className="text-xs text-muted-foreground">
        Pago em {debt.payments.map((payment, index) => <span key={payment.splitId}>{index > 0 && ", "}
          <Link href={`/financeiro/lancamentos/${payment.entryId}`} className="text-primary hover:underline" title={payment.entryName}>
            {dateBR(payment.entryDate)} ({money(payment.amountCents / 100)})</Link>
        </span>)}
      </div>}
    </TableCell>
    <TableCell className="px-3 py-1.5 text-right num">{money(debt.amountCents / 100)}</TableCell>
    <TableCell className="px-3 py-1.5 text-right num">
      {debt.paidCents ? money(debt.paidCents / 100) : <span className="text-muted-foreground">—</span>}
      {status === "parcial" && <div className="text-xs text-muted-foreground">falta {money(debtOpenCents(debt) / 100)}</div>}
    </TableCell>
    <TableCell className="px-3 py-1.5">
      <Badge size="md" variant={STATUS_VARIANT[status]}>{DEBT_STATUS_LABELS[status]}</Badge>
    </TableCell>
    {canEdit && <TableCell className="px-3 py-1">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Ações da dívida de ${dateBR(debt.date)}: ${debt.description}`} />}><IconDots /></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {status !== "quitada" && <DropdownMenuItem render={<Link href={receiveHref(debt)} />}><IconReceipt /> Receber…</DropdownMenuItem>}
            <DropdownMenuItem onClick={onEdit}><IconPencil /> Editar</DropdownMenuItem>
            {!fixed && <DropdownMenuItem variant="destructive" onClick={onRemove}><IconTrash /> Excluir</DropdownMenuItem>}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </TableCell>}
  </TableRow>;
}

/**
 * Anotar ou editar: associado, rubrica, data, valor, descrição e acordo. Dívida de venda ou de mensalidade tem valor,
 * associado e rubrica fixos (vêm da origem); com pagamento, associado e rubrica não mudam.
 */
function DebtForm({ debt, initialAssociateId, associates, categories, onDone }: {
  debt: Debt | null; initialAssociateId: string; associates: AssociateOption[]; categories: Option[]; onDone: () => void;
}) {
  const [saving, startSaving] = useTransition();
  const [associateId, setAssociateId] = useState(debt?.associateId ?? initialAssociateId);
  const [categoryId, setCategoryId] = useState(debt?.categoryId ?? "");
  const [date, setDate] = useState(debt?.date ?? todayInSaoPaulo());
  const [amount, setAmount] = useState(debt ? centsToInput(debt.amountCents) : "");
  const [description, setDescription] = useState(debt?.description ?? "");
  const [agreement, setAgreement] = useState(debt?.agreement ?? "");
  const associateOptions = associates.filter((a) => a.active || a.value === debt?.associateId);
  const fromOrigin = Boolean(debt && (debt.origin === "mensalidade" || (debt.items?.length ?? 0) > 0));
  const paid = (debt?.paidCents ?? 0) > 0;
  const categoryOptions = debt && !categories.some((c) => c.value === debt.categoryId)
    ? [{ value: debt.categoryId, label: debt.categoryLabel }, ...categories] : categories;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startSaving(async () => {
      const result = await saveDebt({ id: debt?.id ?? "", associateId, date, amount, categoryId, description, agreement });
      if (result.error) { toast.error(result.error); return; }
      toast.success(result.success);
      onDone();
    });
  };
  const field = (name: string) => `debt-${debt?.id ?? "new"}-${name}`;

  return <form className="grid gap-3" onSubmit={submit}>
    <DialogHeader>
      <DialogTitle>{debt ? "Editar dívida" : "Nova dívida"}</DialogTitle>
      <DialogDescription>Toda dívida é numa rubrica de receita: quando ela for paga, o valor entra nessa rubrica. A consulta vê a data, a rubrica, a descrição, o acordo e os valores, mas não o associado. Não escreva o nome na descrição nem no acordo.</DialogDescription>
    </DialogHeader>
    <div className="grid gap-1.5"><Label htmlFor={field("associate")}>Associado</Label>
      <OptionCombobox id={field("associate")} value={associateId} onValueChange={setAssociateId} disabled={fromOrigin || paid}
        options={associateOptions} placeholder="Buscar associado…" emptyText="Nenhum associado encontrado." /></div>
    <div className="grid gap-1.5"><Label htmlFor={field("category")}>Rubrica</Label>
      <OptionCombobox id={field("category")} value={categoryId} onValueChange={setCategoryId} disabled={fromOrigin || paid}
        options={categoryOptions} placeholder="Mensalidade, lojinha, atividade…" emptyText="Nenhuma rubrica de receita encontrada." />
      {(fromOrigin || paid) && <span className="text-[11px] text-muted-foreground">{fromOrigin ? "Vem da origem da dívida (venda ou mensalidade)." : "Já tem pagamento: associado e rubrica não mudam."}</span>}</div>
    <div className="grid items-start gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5"><Label htmlFor={field("date")}>Data</Label>
        <Input id={field("date")} type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></div>
      <div className="grid gap-1.5"><Label htmlFor={field("amount")}>Valor (R$)</Label>
        <Input id={field("amount")} inputMode="decimal" placeholder="Ex.: 150,00" value={amount} onChange={(event) => setAmount(event.target.value)}
          readOnly={fromOrigin} className="text-right num" required /></div>
    </div>
    <div className="grid gap-1.5"><Label htmlFor={field("description")}>Descrição</Label>
      <Input id={field("description")} value={description} maxLength={200} placeholder="Ex.: Acampamento de março" onChange={(event) => setDescription(event.target.value)} required /></div>
    <div className="grid gap-1.5"><Label htmlFor={field("agreement")}>Acordo de pagamento (opcional)</Label>
      <Textarea id={field("agreement")} value={agreement} maxLength={300} rows={2} placeholder="Ex.: 3 parcelas de R$ 50,00 a partir de abril" onChange={(event) => setAgreement(event.target.value)} /></div>
    {debt && debt.paidCents < debt.amountCents && <p className="m-0 text-xs text-muted-foreground">
      Para registrar um pagamento, use <Link href={receiveHref(debt)} className="font-semibold text-primary hover:underline">Receber…</Link>: o lançamento já vem ligado a esta dívida.</p>}
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
      <Button type="submit" disabled={saving}>{saving ? "Salvando…" : debt ? "Salvar dívida" : "Anotar dívida"}</Button>
    </DialogFooter>
  </form>;
}

function RemoveDebt({ debt, onDone }: { debt: Debt; onDone: () => void }) {
  const [pending, start] = useTransition();
  return <>
    <DialogHeader>
      <DialogTitle>Excluir dívida</DialogTitle>
      <DialogDescription>{debt.associateName}: {debt.description} ({money(debt.amountCents / 100)}, {dateBR(debt.date)}).{debt.items?.length ? " Os itens vendidos voltam ao estoque." : ""} Com pagamento, não exclui: tire o pagamento do lançamento antes.</DialogDescription>
    </DialogHeader>
    <DialogFooter>
      <Button variant="outline" onClick={onDone}>Cancelar</Button>
      <Button variant="destructive" disabled={pending} onClick={() => start(async () => {
        const result = await deleteDebt(debt.id);
        if (result.error) { toast.error(result.error); return; }
        toast.success(result.success);
        onDone();
      })}><IconTrash data-icon="inline-start" /> {pending ? "Excluindo…" : "Excluir"}</Button>
    </DialogFooter>
  </>;
}
