"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@geas/ui/components/badge";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionSelect } from "@geas/ui/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import { ALLOWED_EMAIL_DOMAIN, GROUP_ROLE_LABELS, INVENTORY_ROLE_LABELS, type GroupRole, type GroupUser, type InventoryRole } from "@geas/ui/lib/roles";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { cn } from "@geas/ui/lib/utils";

type Action = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
export type UsersActions = { invite: Action; save: Action; remove: Action };

const roleOptions = Object.entries(GROUP_ROLE_LABELS).map(([value, label]) => ({ value, label }));
const inventoryOptions = Object.entries(INVENTORY_ROLE_LABELS).map(([value, label]) => ({ value, label }));
const HEAD = "h-8 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
const CELL = "px-3 py-1.5";
const ADMIN_NOTE = "O administrador do grupo administra o Financeiro, o Inventário e os usuários.";

/** Mostra o resultado como toast antes de a tela recarregar (a linha removida some antes de um efeito rodar). */
function withToast(action: Action): Action {
  return async (previous, formData) => {
    const result = await action(previous, formData);
    if (result.error) toast.error(result.error);
    else if (result.success) (result.tone === "neutral" ? toast.info : toast.success)(result.success);
    return result;
  };
}

/** Usuários do grupo, com o papel em cada app (Financeiro e Inventário). Só o administrador do grupo vê esta tela. */
export function UsersManager({ users, currentUserId, actions }: { users: GroupUser[]; currentUserId: string; actions: UsersActions }) {
  return <>
    <SectionCard>
      <SectionHeader title="Convidar usuário"><Badge variant="outline">@{ALLOWED_EMAIL_DOMAIN}</Badge></SectionHeader>
      <div className="p-4"><InviteForm invite={actions.invite} /></div>
    </SectionCard>
    <SectionCard>
      <SectionHeader title="Pessoas com acesso" description={ADMIN_NOTE}><SectionCount>{users.length} {users.length === 1 ? "usuário" : "usuários"}</SectionCount></SectionHeader>
      <div className="overflow-x-auto"><Table className="min-w-[880px]">
        <TableCaption className="sr-only">Usuários com acesso ao grupo</TableCaption>
        <TableHeader className="bg-muted"><TableRow className="hover:bg-transparent">
          <TableHead className={HEAD}>Usuário</TableHead>
          <TableHead className={cn(HEAD, "w-36")}>Status</TableHead>
          <TableHead className={cn(HEAD, "w-44")}>Financeiro</TableHead>
          <TableHead className={cn(HEAD, "w-40")}>Inventário</TableHead>
          <TableHead className={cn(HEAD, "w-44")}><span className="sr-only">Ações</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>{users.map((user) => <UserRow key={user.userId} user={user} self={user.userId === currentUserId} actions={actions} />)}</TableBody>
      </Table></div>
    </SectionCard>
  </>;
}

function InviteForm({ invite }: { invite: Action }) {
  // `sent` conta os convites: muda a key dos campos e os limpa depois de cada sucesso.
  const [state, action, pending] = useActionState(async (previous: ActionResult & { sent: number }, formData: FormData) => {
    const result = await withToast(invite)(previous, formData);
    return { ...result, sent: previous.sent + (result.success ? 1 : 0) };
  }, { sent: 0 });
  return <form action={action} className="grid gap-3 sm:grid-cols-[minmax(240px,1fr)_170px_170px_auto] sm:items-end">
    <InviteFields key={state.sent} />
    <Button type="submit" disabled={pending}>{pending ? "Enviando…" : "Enviar convite"}</Button>
  </form>;
}

function InviteFields() {
  const [role, setRole] = useState<string>("viewer");
  const [inventoryRole, setInventoryRole] = useState<string>("viewer");
  return <>
    <div className="grid gap-1.5"><Label htmlFor="invite-email">E-mail institucional</Label>
      <Input id="invite-email" name="email" type="email" pattern=".+@escoteirosalbert\.com\.br" placeholder={`nome@${ALLOWED_EMAIL_DOMAIN}`} required /></div>
    <div className="grid gap-1.5"><Label htmlFor="invite-role">Papel no Financeiro</Label>
      <OptionSelect id="invite-role" value={role} onValueChange={setRole} options={roleOptions} /><input type="hidden" name="role" value={role} /></div>
    <div className="grid gap-1.5"><Label htmlFor="invite-inventory-role">Papel no Inventário</Label>
      {role === "admin"
        ? <p className="m-0 flex h-8 items-center text-xs text-muted-foreground" title={ADMIN_NOTE}>Administrador</p>
        : <OptionSelect id="invite-inventory-role" value={inventoryRole} onValueChange={setInventoryRole} options={inventoryOptions} />}
      <input type="hidden" name="inventoryRole" value={inventoryRole} /></div>
  </>;
}

/** Linha: os cabeçalhos "Financeiro" e "Inventário" são os rótulos visíveis; cada seletor tem o seu rótulo sr-only. */
function UserRow({ user, self, actions }: { user: GroupUser; self: boolean; actions: UsersActions }) {
  const [role, setRole] = useState<GroupRole>(user.role);
  const [inventoryRole, setInventoryRole] = useState<InventoryRole>(user.inventoryRole);
  const [, save, saving] = useActionState(withToast(actions.save), {});
  const [, remove, removing] = useActionState(withToast(actions.remove), {});
  const id = (name: string) => `${name}-${user.userId}`;
  return <TableRow>
    <TableCell className={CELL}><span className="font-semibold">{user.email}</span>{self && <span className="text-muted-foreground"> (você)</span>}</TableCell>
    <TableCell className={CELL}><Badge className={user.confirmed ? "bg-success-soft text-success" : "bg-[#f5eed1] text-[#725d0d]"}>{user.confirmed ? "Ativo" : "Convite pendente"}</Badge></TableCell>
    <TableCell className={CELL}>
      {self
        ? <span className="text-xs text-muted-foreground" title="Você não pode mudar o próprio papel de administrador">{GROUP_ROLE_LABELS[role]}</span>
        : <><Label className="sr-only" htmlFor={id("role")}>Papel no Financeiro de {user.email}</Label>
          <OptionSelect id={id("role")} value={role} onValueChange={(value) => setRole(value as GroupRole)} options={roleOptions} className="w-36" /></>}
    </TableCell>
    <TableCell className={CELL}>
      {role === "admin"
        ? <span className="text-xs text-muted-foreground" title={ADMIN_NOTE}>Administrador</span>
        : <><Label className="sr-only" htmlFor={id("inventory")}>Papel no Inventário de {user.email}</Label>
          <OptionSelect id={id("inventory")} value={inventoryRole} onValueChange={(value) => setInventoryRole(value as InventoryRole)} options={inventoryOptions} className="w-32" /></>}
    </TableCell>
    <TableCell className={CELL}>
      <div className="flex items-center gap-2">
        {!self && <form action={save}>
          <input type="hidden" name="userId" value={user.userId} /><input type="hidden" name="email" value={user.email} />
          <input type="hidden" name="role" value={role} /><input type="hidden" name="inventoryRole" value={inventoryRole} />
          <input type="hidden" name="previousRole" value={user.role} /><input type="hidden" name="previousInventoryRole" value={user.inventoryRole} />
          <Button type="submit" variant="outline" size="sm" disabled={saving || (role === user.role && inventoryRole === user.inventoryRole)}
            aria-label={`Salvar papéis de ${user.email}`}>Salvar</Button>
        </form>}
        {!self && <form action={remove}>
          <input type="hidden" name="userId" value={user.userId} /><input type="hidden" name="email" value={user.email} />
          <Button type="submit" variant="destructive" size="sm" disabled={removing} aria-label={`Remover acesso de ${user.email}`} onClick={(event) => {
            if (!window.confirm(`Remover o acesso de ${user.email}? A conta será bloqueada imediatamente.`)) event.preventDefault();
          }}>Remover</Button>
        </form>}
      </div>
    </TableCell>
  </TableRow>;
}
