"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { Link } from "@geas/ui/components/link";
import { toast } from "sonner";
import {
  IconChevronRight,
  IconDots,
  IconNote,
  IconPackage,
  IconPencil,
  IconPlus,
  IconReceipt,
  IconTrash,
} from "@tabler/icons-react";
import { createDebtLines } from "@/app/actions";
import { deleteDebt, setDebtAgreement, updateDebtLine } from "@/app/(financeiro)/financeiro/mensalidades/actions";
import { SaleItemsEditor, itemDraftsTotal, type SaleItemDraft } from "@/components/finance/entries/sale-items";
import { centsToInput, dateBR, money } from "@/lib/format";
import { todayInSaoPaulo } from "@/lib/finance/fees";
import { parseMoneyToCents } from "@/lib/money";
import {
  debtOpenCents,
  debtOriginLabel,
  debtStatus,
  debtTotals,
  groupDebts,
  DEBT_STATUS_LABELS,
  type Debt,
  type DebtorGroup,
  type DebtStatus,
} from "@/lib/finance/debts";
import type { SaleLot } from "@/lib/finance/sales";
import { Button } from "@geas/ui/components/button";
import { Checkbox } from "@geas/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geas/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@geas/ui/components/dropdown-menu";
import { Input } from "@geas/ui/components/input";
import { MoneyInput } from "@geas/ui/components/money-input";
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

/** Abre o lançamento com um rateio ligado a cada linha em aberto da conta (ou só a `debtId`). */
const receiveHref = (associateId: string, debtId?: string) =>
  `/financeiro/lancamentos/novo?receber=${associateId}${debtId ? `&divida=${debtId}` : ""}`;

/**
 * Conta a receber por associado (024): uma linha por conta, com o acordo, que abre as linhas da conta (cada uma numa
 * rubrica, paga só pelos rateios ligados a ela). A tesouraria vê o associado e os lançamentos; a consulta vê
 * "Devedor N" e nada que leve ao associado (o banco não entrega, ver `debt_rows`).
 */
export function DebtsManager({
  debts,
  canEdit,
  associates,
  categories,
  sellIds,
  saleLots,
}: {
  debts: Debt[];
  canEdit: boolean;
  associates: AssociateOption[];
  categories: Option[];
  sellIds: string[];
  saleLots: SaleLot[];
}) {
  const [showPaid, setShowPaid] = useState(false);
  const [creating, setCreating] = useState<{ associateId: string } | null>(null);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [agreement, setAgreement] = useState<DebtorGroup | null>(null);
  const [removing, setRemoving] = useState<Debt | null>(null);
  const totals = useMemo(() => debtTotals(debts), [debts]);
  const paidCount = debts.length - totals.openCount;
  const groups = useMemo(
    () =>
      groupDebts(debts)
        .map((group) =>
          showPaid ? group : { ...group, debts: group.debts.filter((debt) => debtStatus(debt) !== "quitada") },
        )
        .filter((group) => group.debts.length > 0),
    [debts, showPaid],
  );
  // contas abertas (accordion): começa tudo recolhido, só o resumo de cada uma
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded((set) => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const allOpen = groups.length > 0 && groups.every((group) => expanded.has(group.key));
  const debtors = new Set(debts.filter((debt) => debtStatus(debt) !== "quitada").map((debt) => debt.debtorNumber)).size;

  return (
    <>
      <div className="grid items-start gap-3 sm:grid-cols-3">
        <StatCard
          label="Em aberto"
          value={money(totals.openCents / 100)}
          tone={totals.openCents > 0 ? "destructive" : "neutral"}
        />
        <StatCard
          label="Devedores"
          value={`${debtors} (${totals.openCount} ${totals.openCount === 1 ? "dívida" : "dívidas"})`}
        />
        <StatCard label="Já pago" value={money(totals.paidCents / 100)} tone="success" />
      </div>

      <SectionCard aria-labelledby="debts-title">
        <SectionHeader
          title="Devedores"
          titleId="debts-title"
          description={
            canEdit
              ? "A consulta vê data, rubrica, descrição, acordo e valores, sem o associado: não escreva o nome na descrição nem no acordo."
              : undefined
          }
        >
          {paidCount > 0 && (
            <Label className="text-xs font-normal">
              <Checkbox checked={showPaid} onCheckedChange={(checked) => setShowPaid(checked === true)} />
              Mostrar quitadas ({paidCount})
            </Label>
          )}
          <SectionCount>
            {totals.openCount} em aberto de {debts.length}
          </SectionCount>
          {groups.length > 1 && (
            <Button
              variant="outline"
              onClick={() => setExpanded(allOpen ? new Set() : new Set(groups.map((group) => group.key)))}
            >
              {allOpen ? "Recolher todos" : "Expandir todos"}
            </Button>
          )}
          {canEdit && (
            <Button onClick={() => setCreating({ associateId: "" })}>
              <IconPlus data-icon="inline-start" /> Nova dívida
            </Button>
          )}
        </SectionHeader>
        {groups.length === 0 ? (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            {debts.length ? "Nenhuma dívida em aberto." : "Nenhuma dívida anotada."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table className="min-w-190">
              <TableCaption className="sr-only">Contas a receber por associado</TableCaption>
              <TableHeader className="bg-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="h-8 w-56 px-3">Devedor / data</TableHead>
                  <TableHead className="h-8 px-3">Rubrica e descrição</TableHead>
                  <TableHead className="h-8 w-28 px-3 text-right">Valor</TableHead>
                  <TableHead className="h-8 w-28 px-3 text-right">Pago</TableHead>
                  <TableHead className="h-8 w-28 px-3">Situação</TableHead>
                  {canEdit && (
                    <TableHead className="h-8 w-12 px-3">
                      <span className="sr-only">Ações</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <Fragment key={group.key}>
                    <AccountRow
                      group={group}
                      canEdit={canEdit}
                      open={expanded.has(group.key)}
                      onToggle={() => toggle(group.key)}
                      onAdd={() => setCreating({ associateId: group.associateId ?? "" })}
                      onAgreement={() => setAgreement(group)}
                    />
                    {expanded.has(group.key) &&
                      group.debts.map((debt) => (
                        <LineRow
                          key={debt.id}
                          debt={debt}
                          canEdit={canEdit}
                          onEdit={() => setEditing(debt)}
                          onRemove={() => setRemoving(debt)}
                        />
                      ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      {canEdit && (
        <Dialog
          open={creating !== null}
          onOpenChange={(open) => {
            if (!open) setCreating(null);
          }}
        >
          <DialogContent className="w-[min(48rem,calc(100%-2rem))]">
            {creating && (
              <NewDebtForm
                initialAssociateId={creating.associateId}
                associates={associates}
                categories={categories}
                sellIds={sellIds}
                saleLots={saleLots}
                onDone={() => setCreating(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {canEdit && (
        <Dialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
        >
          <DialogContent className="w-[min(36rem,calc(100%-2rem))]">
            {editing && (
              <LineForm key={editing.id} debt={editing} categories={categories} onDone={() => setEditing(null)} />
            )}
          </DialogContent>
        </Dialog>
      )}

      {canEdit && (
        <Dialog
          open={agreement !== null}
          onOpenChange={(open) => {
            if (!open) setAgreement(null);
          }}
        >
          <DialogContent className="w-[min(32rem,calc(100%-2rem))]">
            {agreement?.associateId && (
              <AgreementForm
                key={agreement.key}
                associateId={agreement.associateId}
                label={agreement.label}
                initial={agreement.agreement ?? ""}
                onDone={() => setAgreement(null)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {canEdit && (
        <Dialog
          open={removing !== null}
          onOpenChange={(open) => {
            if (!open) setRemoving(null);
          }}
        >
          <DialogContent className="w-[min(30rem,calc(100%-2rem))]">
            {removing && <RemoveDebt debt={removing} onDone={() => setRemoving(null)} />}
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Linha da conta (accordion): associado ou "Devedor N", quantas dívidas, acordo e totais; clicar abre as linhas. */
function AccountRow({
  group,
  canEdit,
  open,
  onToggle,
  onAdd,
  onAgreement,
}: {
  group: DebtorGroup;
  canEdit: boolean;
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onAgreement: () => void;
}) {
  const status: DebtStatus = group.openCents === 0 ? "quitada" : group.paidCents > 0 ? "parcial" : "aberta";
  return (
    <TableRow className={cn("bg-muted/40 hover:bg-muted", open && "bg-muted")}>
      <TableHead scope="rowgroup" colSpan={2} className="h-auto p-0 font-normal">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex w-full flex-wrap items-center gap-x-1.5 px-3 py-2 text-left"
        >
          <IconChevronRight
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
            aria-hidden
          />
          <span className="font-semibold text-foreground">{group.label}</span>
          <span className="text-xs text-muted-foreground">
            ({group.debts.length} {group.debts.length === 1 ? "dívida" : "dívidas"}
            {group.openCount > 0 && group.openCount < group.debts.length ? `, ${group.openCount} em aberto` : ""})
          </span>
          {group.agreement && (
            <span className="basis-full pl-5.5 text-xs text-muted-foreground">
              <span className="font-semibold">Acordo:</span> {group.agreement}
            </span>
          )}
        </button>
      </TableHead>
      <TableCell className="px-3 py-2 text-right num font-semibold">{money(group.amountCents / 100)}</TableCell>
      <TableCell className="px-3 py-2 text-right num">
        {group.paidCents ? money(group.paidCents / 100) : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="px-3 py-2">
        {status === "quitada" ? (
          <Badge size="md" variant="success">
            Quitado
          </Badge>
        ) : (
          <Badge size="md" variant={STATUS_VARIANT[status]} className="num">
            faltam {money(group.openCents / 100)}
          </Badge>
        )}
      </TableCell>
      {canEdit && (
        <TableCell className="px-3 py-1">
          {group.associateId && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label={`Ações de ${group.label}`} />}
              >
                <IconDots />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  {group.openCents > 0 && (
                    <DropdownMenuItem render={<Link href={receiveHref(group.associateId)} />}>
                      <IconReceipt /> Receber…
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={onAdd}>
                    <IconPlus /> Nova dívida
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onAgreement}>
                    <IconNote /> Acordo de pagamento…
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </TableCell>
      )}
    </TableRow>
  );
}

function LineRow({
  debt,
  canEdit,
  onEdit,
  onRemove,
}: {
  debt: Debt;
  canEdit: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const status = debtStatus(debt);
  return (
    <TableRow className="align-top">
      <TableCell className="px-3 py-1.5 pl-9 num">{dateBR(debt.date)}</TableCell>
      <TableCell className="px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-normal">
            {debt.categoryLabel}
          </Badge>
          <span>{debt.description}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {debtOriginLabel(debt)}
          {debt.originEntryId && (
            <>
              {" "}
              ·{" "}
              <Link href={`/financeiro/lancamentos/${debt.originEntryId}`} className="text-primary hover:underline">
                lançamento de origem
              </Link>
            </>
          )}
        </div>
        {debt.items && debt.items.length > 0 && (
          <div className="flex items-start gap-1 text-xs text-muted-foreground">
            <IconPackage className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
            <span>
              <span className="font-semibold">Venda:</span>{" "}
              {debt.items
                .map((item) => `${item.quantity}× ${item.name} (${money(item.unitPriceCents / 100)})`)
                .join(", ")}
            </span>
          </div>
        )}
        {debt.payments && debt.payments.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Pago em{" "}
            {debt.payments.map((payment, index) => (
              <span key={payment.splitId}>
                {index > 0 && ", "}
                <Link
                  href={`/financeiro/lancamentos/${payment.entryId}`}
                  className="text-primary hover:underline"
                  title={payment.entryName}
                >
                  {dateBR(payment.entryDate)} ({money(payment.amountCents / 100)})
                </Link>
              </span>
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="px-3 py-1.5 text-right num">{money(debt.amountCents / 100)}</TableCell>
      <TableCell className="px-3 py-1.5 text-right num">
        {debt.paidCents ? money(debt.paidCents / 100) : <span className="text-muted-foreground">—</span>}
        {status === "parcial" && (
          <div className="text-xs text-muted-foreground">faltam {money(debtOpenCents(debt) / 100)}</div>
        )}
      </TableCell>
      <TableCell className="px-3 py-1.5">
        <Badge size="md" variant={STATUS_VARIANT[status]}>
          {DEBT_STATUS_LABELS[status]}
        </Badge>
      </TableCell>
      {canEdit && (
        <TableCell className="px-3 py-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Ações da dívida de ${dateBR(debt.date)}: ${debt.description}`}
                />
              }
            >
              <IconDots />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                {status !== "quitada" && debt.associateId && (
                  <DropdownMenuItem render={<Link href={receiveHref(debt.associateId, debt.id)} />}>
                    <IconReceipt /> Receber só esta…
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onEdit}>
                  <IconPencil /> Editar
                </DropdownMenuItem>
                {debt.origin !== "mensalidade" && (
                  <DropdownMenuItem variant="destructive" onClick={onRemove}>
                    <IconTrash /> Excluir
                  </DropdownMenuItem>
                )}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      )}
    </TableRow>
  );
}

type NewLine = { key: number; categoryId: string; description: string; amount: string; items: SaleItemDraft[] };
let lineKey = 0;
const newLine = (): NewLine => ({ key: ++lineKey, categoryId: "", description: "", amount: "", items: [] });
const cents = (value: string) => Math.abs(parseMoneyToCents(value) ?? 0);

/**
 * Nova dívida (024): associado, data e uma ou mais linhas (rubrica, descrição e valor; numa rubrica que vende itens, os
 * itens vendidos dão o valor e baixam o estoque na hora). Nada entra no caixa: só a conta do associado.
 */
function NewDebtForm({
  initialAssociateId,
  associates,
  categories,
  sellIds,
  saleLots,
  onDone,
}: {
  initialAssociateId: string;
  associates: AssociateOption[];
  categories: Option[];
  sellIds: string[];
  saleLots: SaleLot[];
  onDone: () => void;
}) {
  const [saving, startSaving] = useTransition();
  const [associateId, setAssociateId] = useState(initialAssociateId);
  const [date, setDate] = useState(todayInSaoPaulo());
  const [lines, setLines] = useState<NewLine[]>([newLine()]);
  const sells = new Set(sellIds);
  const set = (key: number, patch: Partial<NewLine>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const valueOf = (line: NewLine) =>
    sells.has(line.categoryId) && line.items.length ? itemDraftsTotal(line.items) : cents(line.amount);
  const total = lines.reduce((sum, line) => sum + valueOf(line), 0);
  const ready =
    Boolean(associateId) &&
    lines.every((line) => line.categoryId && line.description.trim().length >= 2 && valueOf(line) > 0);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startSaving(async () => {
      const result = await createDebtLines({
        date,
        lines: lines.map((line) => {
          const items = sells.has(line.categoryId)
            ? line.items.map((item) => ({
                lotId: item.lotId,
                quantity: Number(item.quantity),
                unitPriceCents: cents(item.price),
              }))
            : [];
          return {
            associateId,
            categoryId: line.categoryId,
            description: line.description,
            amountCents: items.length ? null : cents(line.amount),
            items,
          };
        }),
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Dívida anotada.");
      onDone();
    });
  };

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Nova dívida</DialogTitle>
        <DialogDescription>
          Entra na conta do associado; nada entra no caixa agora. Cada linha é numa rubrica de receita: quando for paga,
          o valor entra nela. A consulta vê as dívidas sem o associado: não escreva o nome na descrição.
        </DialogDescription>
      </DialogHeader>
      <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <div className="grid gap-1.5">
          <Label htmlFor="debt-new-associate">Associado</Label>
          <OptionCombobox
            id="debt-new-associate"
            value={associateId}
            onValueChange={setAssociateId}
            options={associates.filter((a) => a.active)}
            placeholder="Buscar associado…"
            emptyText="Nenhum associado encontrado."
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="debt-new-date">Data</Label>
          <Input
            id="debt-new-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </div>
      </div>
      {lines.map((line, index) => (
        <div
          key={line.key}
          role="group"
          aria-label={`Linha ${index + 1}`}
          className="grid gap-2 rounded-lg bg-muted p-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_8rem_auto] sm:items-end"
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`debt-new-category-${index}`}>Rubrica</Label>
            <OptionCombobox
              id={`debt-new-category-${index}`}
              value={line.categoryId}
              onValueChange={(categoryId) => set(line.key, { categoryId })}
              options={categories}
              placeholder="Mensalidade, lojinha, atividade…"
              emptyText="Nenhuma rubrica de receita encontrada."
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`debt-new-description-${index}`}>Descrição</Label>
            <Input
              id={`debt-new-description-${index}`}
              value={line.description}
              maxLength={200}
              placeholder="Ex.: Acampamento de março"
              onChange={(event) => set(line.key, { description: event.target.value })}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`debt-new-amount-${index}`}>Valor</Label>
            <MoneyInput
              id={`debt-new-amount-${index}`}
              value={sells.has(line.categoryId) && line.items.length ? centsToInput(valueOf(line)) : line.amount}
              readOnly={sells.has(line.categoryId) && line.items.length > 0}
              onValueChange={(amount) => set(line.key, { amount })}
              required
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remover linha ${index + 1}`}
            disabled={lines.length === 1}
            onClick={() => setLines((current) => current.filter((other) => other.key !== line.key))}
          >
            <IconTrash />
          </Button>
          {sells.has(line.categoryId) && (
            <SaleItemsEditor
              className="sm:col-span-full"
              index={index}
              items={line.items}
              lots={saleLots}
              savedItems={[]}
              readOnly={false}
              onChange={(items) => set(line.key, { items })}
            />
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setLines((current) => [...current, newLine()])}>
          <IconPlus data-icon="inline-start" /> Adicionar linha
        </Button>
        <span className="text-sm">
          Total: <strong className="num">{money(total / 100)}</strong>
        </span>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving || !ready}>
          {saving ? "Salvando…" : "Anotar dívida"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Edita uma linha: data, valor, rubrica e descrição. Venda ou mensalidade: valor e rubrica vêm da origem. */
function LineForm({ debt, categories, onDone }: { debt: Debt; categories: Option[]; onDone: () => void }) {
  const [saving, startSaving] = useTransition();
  const [categoryId, setCategoryId] = useState(debt.categoryId);
  const [date, setDate] = useState(debt.date);
  const [amount, setAmount] = useState(centsToInput(debt.amountCents));
  const [description, setDescription] = useState(debt.description);
  const fromOrigin = debt.origin === "mensalidade" || debt.origin === "venda";
  const paid = debt.paidCents > 0;
  const categoryOptions = categories.some((c) => c.value === debt.categoryId)
    ? categories
    : [{ value: debt.categoryId, label: debt.categoryLabel }, ...categories];

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startSaving(async () => {
      const result = await updateDebtLine({ id: debt.id, date, amount, categoryId, description });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success);
      onDone();
    });
  };
  const field = (name: string) => `debt-${debt.id}-${name}`;

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Editar dívida</DialogTitle>
        <DialogDescription>
          {debt.associateName}: {debtOriginLabel(debt)}.
          {fromOrigin
            ? " Valor e rubrica vêm da origem."
            : paid
              ? " Já tem pagamento: a rubrica não muda e o valor não fica abaixo do pago."
              : ""}
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor={field("category")}>Rubrica</Label>
        <OptionCombobox
          id={field("category")}
          value={categoryId}
          onValueChange={setCategoryId}
          disabled={fromOrigin || paid}
          options={categoryOptions}
          placeholder="Mensalidade, lojinha, atividade…"
          emptyText="Nenhuma rubrica de receita encontrada."
        />
      </div>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={field("date")}>Data</Label>
          <Input
            id={field("date")}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={field("amount")}>Valor</Label>
          <MoneyInput id={field("amount")} value={amount} onValueChange={setAmount} readOnly={fromOrigin} required />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={field("description")}>Descrição</Label>
        <Input
          id={field("description")}
          value={description}
          maxLength={200}
          onChange={(event) => setDescription(event.target.value)}
          required
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Salvar dívida"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Acordo de pagamento da conta (ex.: "3x de R$ 50,00 a partir de abril"). */
function AgreementForm({
  associateId,
  label,
  initial,
  onDone,
}: {
  associateId: string;
  label: string;
  initial: string;
  onDone: () => void;
}) {
  const [saving, startSaving] = useTransition();
  const [agreement, setAgreementText] = useState(initial);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    startSaving(async () => {
      const result = await setDebtAgreement(associateId, agreement);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.success);
      onDone();
    });
  };
  return (
    <form className="grid gap-3" onSubmit={submit}>
      <DialogHeader>
        <DialogTitle>Acordo de pagamento</DialogTitle>
        <DialogDescription>Da conta de {label}. A consulta vê o acordo: não escreva o nome.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-1.5">
        <Label htmlFor="debt-agreement">Acordo (opcional)</Label>
        <Textarea
          id="debt-agreement"
          value={agreement}
          maxLength={300}
          rows={3}
          placeholder="Ex.: 3 parcelas de R$ 50,00 a partir de abril"
          onChange={(event) => setAgreementText(event.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Salvando…" : "Salvar acordo"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function RemoveDebt({ debt, onDone }: { debt: Debt; onDone: () => void }) {
  const [pending, start] = useTransition();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Excluir dívida</DialogTitle>
        <DialogDescription>
          {debt.associateName}: {debt.description} ({money(debt.amountCents / 100)}, {dateBR(debt.date)}).
          {debt.items?.length ? " Os itens vendidos voltam ao estoque." : ""} Com pagamento, não exclui: tire o
          pagamento do lançamento antes.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await deleteDebt(debt.id);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success(result.success);
              onDone();
            })
          }
        >
          <IconTrash data-icon="inline-start" /> {pending ? "Excluindo…" : "Excluir"}
        </Button>
      </DialogFooter>
    </>
  );
}
