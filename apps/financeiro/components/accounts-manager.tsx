"use client";

import { useActionState, useEffect, useState } from "react";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import { createAccount, setAccountActive, updateAccount, type CatalogFormState } from "@/app/configuracoes/actions";
import { OptionSelect } from "@/components/option-controls";
import { LedgerCodeInput } from "@/components/ledger-code-input";
import { SectionCard, SectionCount, SectionHeader } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ACCOUNT_KINDS, accountDetails, type Account, type AccountKind } from "@/lib/accounts";
import { centsToInput, dateBR, money } from "@/lib/format";
import { useActionToast } from "@/lib/use-action-toast";
import { cn } from "@/lib/utils";

export type AccountItem = Account & { usage: number };

const initial: CatalogFormState = {};
const kindOptions = Object.entries(ACCOUNT_KINDS).map(([value, label]) => ({ value, label }));

export function AccountsManager({ accounts, canEdit }: { accounts: AccountItem[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<AccountItem | "new" | null>(null);
  return <SectionCard aria-labelledby="accounts-title">
    <SectionHeader title="Contas" titleId="accounts-title" description="Onde o dinheiro está: conta corrente, poupança, caixa. Cada lançamento pertence a uma conta.">
      <SectionCount>{accounts.filter((a) => a.active).length} ativas de {accounts.length}</SectionCount>
      {canEdit && <Button onClick={() => setEditing("new")}><IconPlus /> Nova conta</Button>}
    </SectionHeader>
    <Table>
      <TableCaption className="sr-only">Contas do grupo</TableCaption>
      <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
        <TableHead className="h-8 px-3">Nome</TableHead>
        <TableHead className="h-8 px-3">Tipo</TableHead>
        <TableHead className="h-8 px-3">Conta contábil</TableHead>
        <TableHead className="h-8 px-3 text-right">Saldo inicial</TableHead>
        <TableHead className="h-8 px-3 text-right">Uso</TableHead>
        <TableHead className="h-8 px-3">Status</TableHead>
      </TableRow></TableHeader>
      <TableBody>{accounts.map((account) => <AccountRow key={account.id} account={account} canEdit={canEdit} onEdit={() => setEditing(account)} />)}</TableBody>
    </Table>
    {canEdit && <Dialog open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
      <DialogContent className="w-[min(36rem,calc(100%-2rem))]">
        {editing !== null && <AccountForm key={editing === "new" ? "new" : editing.id} account={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </DialogContent>
    </Dialog>}
  </SectionCard>;
}

function AccountRow({ account, canEdit, onEdit }: { account: AccountItem; canEdit: boolean; onEdit: () => void }) {
  const [toggleState, toggle, toggling] = useActionState(setAccountActive, initial);
  useActionToast(toggleState);
  const details = accountDetails(account);
  return <TableRow className={cn(!account.active && "text-muted-foreground")}>
    <TableCell className="px-3 py-1">
      <div className="font-medium">{account.name}</div>
      {details && <div className="text-xs text-muted-foreground">{details}</div>}
    </TableCell>
    <TableCell className="px-3 py-1">{ACCOUNT_KINDS[account.kind]}</TableCell>
    <TableCell className="px-3 py-1 num">{account.ledger_code ?? <span className="text-muted-foreground">—</span>}
    </TableCell>
    <TableCell className="px-3 py-1 text-right num">
      {money(account.opening_balance_cents / 100)}
      {account.opening_date && <div className="text-xs text-muted-foreground">em {dateBR(account.opening_date)}</div>}
    </TableCell>
    <TableCell className="px-3 py-1 text-right num" title="Lançamentos nesta conta">{account.usage}</TableCell>
    <TableCell className="px-3 py-1">
      <div className="flex items-center gap-2">
        <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", account.active ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>{account.active ? "Ativa" : "Inativa"}</span>
        {canEdit && <>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Editar ${account.name}`} onClick={onEdit}><IconPencil /></Button>
          <form action={toggle}>
            <input type="hidden" name="id" value={account.id} /><input type="hidden" name="active" value={String(!account.active)} />
            <Button type="submit" variant="outline" size="sm" disabled={toggling}>{account.active ? "Inativar" : "Reativar"}</Button>
          </form>
        </>}
      </div>
    </TableCell>
  </TableRow>;
}

function AccountForm({ account, onDone }: { account: AccountItem | null; onDone: () => void }) {
  const [state, action, pending] = useActionState(account ? updateAccount : createAccount, initial);
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? "corrente");
  useActionToast(state);
  useEffect(() => { if (state.success) onDone(); }, [state, onDone]);
  const field = (id: string) => `account-${account?.id ?? "new"}-${id}`;
  return <form action={action} className="grid gap-3">
    <DialogHeader>
      <DialogTitle>{account ? `Editar ${account.name}` : "Nova conta"}</DialogTitle>
      <DialogDescription>Banco, agência e número ajudam a reconhecer o extrato. O saldo inicial é o saldo da conta na data de início.</DialogDescription>
    </DialogHeader>
    {account && <input type="hidden" name="id" value={account.id} />}
    <input type="hidden" name="kind" value={kind} />
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
      <div className="grid gap-1.5"><Label htmlFor={field("name")}>Nome</Label><Input id={field("name")} name="name" defaultValue={account?.name} maxLength={60} placeholder="Ex.: Conta corrente Sicredi" required /></div>
      <div className="grid gap-1.5"><Label htmlFor={field("kind")}>Tipo</Label><OptionSelect id={field("kind")} value={kind} onValueChange={(value) => setKind(value as AccountKind)} options={kindOptions} /></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_9rem]">
      <div className="grid gap-1.5"><Label htmlFor={field("bank")}>Banco (opcional)</Label><Input id={field("bank")} name="bank" defaultValue={account?.bank ?? ""} maxLength={60} /></div>
      <div className="grid gap-1.5"><Label htmlFor={field("branch")}>Agência</Label><Input id={field("branch")} name="branch" defaultValue={account?.branch ?? ""} maxLength={20} className="num" /></div>
      <div className="grid gap-1.5"><Label htmlFor={field("number")}>Número</Label><Input id={field("number")} name="number" defaultValue={account?.number ?? ""} maxLength={30} className="num" /></div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1.5"><Label htmlFor={field("opening-balance")}>Saldo inicial (R$)</Label><Input id={field("opening-balance")} name="openingBalance" inputMode="decimal" placeholder="0,00" defaultValue={account ? centsToInput(account.opening_balance_cents) : ""} className="text-right num" /></div>
      <div className="grid gap-1.5"><Label htmlFor={field("opening-date")}>Data de início</Label><Input id={field("opening-date")} name="openingDate" type="date" defaultValue={account?.opening_date ?? ""} /></div>
    </div>
    <div className="grid gap-1.5">
      <Label htmlFor={field("ledger-code")}>Conta contábil (opcional)</Label>
      <LedgerCodeInput id={field("ledger-code")} defaultValue={account?.ledger_code} className="w-44" />
      <p className="m-0 text-xs text-muted-foreground">Contrapartida na exportação para a contabilidade (ex.: a conta “Bancos” do plano de contas).</p>
    </div>
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onDone}>Cancelar</Button>
      <Button type="submit" disabled={pending}>{pending ? "Salvando…" : account ? "Salvar conta" : "Cadastrar conta"}</Button>
    </DialogFooter>
  </form>;
}
