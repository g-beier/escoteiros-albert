"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@geas/ui/components/badge";
import { Button } from "@geas/ui/components/button";
import { Input } from "@geas/ui/components/input";
import { Label } from "@geas/ui/components/label";
import { OptionCombobox, OptionSelect } from "@geas/ui/components/option-controls";
import { SectionCard, SectionCount, SectionHeader } from "@geas/ui/components/section-card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@geas/ui/components/table";
import {
  MODULE_ROLES,
  MODULE_ROLE_HELP,
  MODULE_ROLE_LABELS,
  ROLE_MODULES,
  ROLE_MODULE_LABELS,
  type GroupUser,
  type ModuleRole,
  type ModuleRoles,
  type RoleModule,
} from "@geas/ui/lib/roles";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { cn } from "@geas/ui/lib/utils";
import { ActionForm } from "@geas/ui/components/action-form";

type Action = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
export type UsersActions = { invite: Action; save: Action; remove: Action };
/** Associado adulto que pode ser ligado a um acesso. */
export type LinkableAssociate = { value: string; label: string };

const roleOptions = MODULE_ROLES.map((value) => ({ value, label: MODULE_ROLE_LABELS[value] }));
const HEAD = "h-8 px-3 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase";
const CELL = "px-3 py-1.5";
const ASSOCIATE_NOTE =
  "Cadastro da pessoa como associado adulto: o chefe vê no Início os avisos dos jovens das seções em que é escotista. Só o administrador do Associados muda.";

/** Mostra o resultado como toast antes de a tela recarregar (a linha removida some antes de um efeito rodar). */
function withToast(action: Action): Action {
  return async (previous, formData) => {
    const result = await action(previous, formData);
    if (result.error) toast.error(result.error);
    else if (result.success) (result.tone === "neutral" ? toast.info : toast.success)(result.success);
    return result;
  };
}

const list = (names: string[]) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} e ${names.at(-1)}`;

/**
 * Usuários do grupo, com o papel em cada módulo (Financeiro, Inventário e Associados) e o associado ligado ao acesso.
 * Quem administra algum módulo vê todos e muda só as colunas de `adminOf`; o associado ligado, só com `linksAssociates`.
 */
export function UsersManager({
  users,
  associates,
  currentUserId,
  adminOf,
  linksAssociates,
  actions,
}: {
  users: GroupUser[];
  associates: LinkableAssociate[];
  currentUserId: string;
  adminOf: RoleModule[];
  linksAssociates: boolean;
  actions: UsersActions;
}) {
  return (
    <>
      <SectionCard>
        <SectionHeader
          title="Cadastrar usuário"
          description={`A pessoa entra com a conta Google deste e-mail. Você dá acesso a ${list(adminOf.map((m) => ROLE_MODULE_LABELS[m]))}.`}
        />
        <div className="p-4">
          <InviteForm invite={actions.invite} adminOf={adminOf} />
        </div>
      </SectionCard>
      <SectionCard>
        <SectionHeader title="Pessoas com acesso">
          <SectionCount>
            {users.length} {users.length === 1 ? "usuário" : "usuários"}
          </SectionCount>
        </SectionHeader>
        <dl className="m-0 grid gap-x-6 gap-y-1 border-b px-4 py-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
          {MODULE_ROLES.map((role) => (
            <div key={role}>
              <dt className="font-semibold">{MODULE_ROLE_LABELS[role]}</dt>
              <dd className="m-0 text-muted-foreground">{MODULE_ROLE_HELP[role]}</dd>
            </div>
          ))}
        </dl>
        <div className="overflow-x-auto">
          <Table className="min-w-[1180px]">
            <TableCaption className="sr-only">Usuários com acesso ao grupo</TableCaption>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead className={HEAD}>Usuário</TableHead>
                <TableHead className={cn(HEAD, "w-36")}>Status</TableHead>
                {ROLE_MODULES.map((module) => (
                  <TableHead key={module} className={cn(HEAD, "w-40")}>
                    {ROLE_MODULE_LABELS[module]}
                  </TableHead>
                ))}
                <TableHead className={cn(HEAD, "w-60")}>
                  <span title={ASSOCIATE_NOTE}>Associado</span>
                </TableHead>
                <TableHead className={cn(HEAD, "w-44")}>
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <UserRow
                  key={user.userId}
                  user={user}
                  associates={associates}
                  self={user.userId === currentUserId}
                  adminOf={adminOf}
                  linksAssociates={linksAssociates}
                  actions={actions}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </SectionCard>
    </>
  );
}

function InviteForm({ invite, adminOf }: { invite: Action; adminOf: RoleModule[] }) {
  // `sent` conta os cadastros: muda a key dos campos e os limpa depois de cada sucesso.
  const [state, action, pending] = useActionState(
    async (previous: ActionResult & { sent: number }, formData: FormData) => {
      const result = await withToast(invite)(previous, formData);
      return { ...result, sent: previous.sent + (result.success ? 1 : 0) };
    },
    { sent: 0 },
  );
  return (
    <ActionForm
      action={action}
      result={state}
      className="grid gap-3 sm:grid-cols-2 sm:items-end lg:grid-cols-[minmax(240px,1fr)_repeat(3,170px)_auto]"
    >
      <InviteFields key={state.sent} adminOf={adminOf} />
      <Button type="submit" disabled={pending}>
        {pending ? "Cadastrando…" : "Cadastrar"}
      </Button>
    </ActionForm>
  );
}

/** Só os módulos que quem cadastra administra; os outros ficam "Sem acesso". */
function InviteFields({ adminOf }: { adminOf: RoleModule[] }) {
  const [roles, setRoles] = useState<Partial<ModuleRoles>>(() =>
    Object.fromEntries(adminOf.map((module) => [module, "viewer"])),
  );
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="invite-email">E-mail da conta Google</Label>
        <Input id="invite-email" name="email" type="email" placeholder="nome@gmail.com" autoComplete="off" required />
      </div>
      {adminOf.map((module) => (
        <div key={module} className="grid gap-1.5">
          <Label htmlFor={`invite-role-${module}`}>Papel no {ROLE_MODULE_LABELS[module]}</Label>
          <OptionSelect
            id={`invite-role-${module}`}
            value={roles[module] ?? "none"}
            onValueChange={(value) => setRoles((current) => ({ ...current, [module]: value as ModuleRole }))}
            options={roleOptions}
          />
          <input type="hidden" name={`role-${module}`} value={roles[module] ?? "none"} />
        </div>
      ))}
    </>
  );
}

/**
 * Linha: os cabeçalhos dos módulos e "Associado" são os rótulos visíveis; cada seletor tem o seu rótulo sr-only.
 * Módulo que quem está logado não administra aparece só como texto. Ninguém tira o próprio papel de administrador.
 */
function UserRow({
  user,
  associates,
  self,
  adminOf,
  linksAssociates,
  actions,
}: {
  user: GroupUser;
  associates: LinkableAssociate[];
  self: boolean;
  adminOf: RoleModule[];
  linksAssociates: boolean;
  actions: UsersActions;
}) {
  const [roles, setRoles] = useState<ModuleRoles>(user.roles);
  const [associateId, setAssociateId] = useState(user.associateId ?? "");
  const [, save, saving] = useActionState(withToast(actions.save), {});
  const [, remove, removing] = useActionState(withToast(actions.remove), {});
  const id = (name: string) => `${name}-${user.userId}`;
  const editable = (module: RoleModule) => adminOf.includes(module) && !(self && user.roles[module] === "admin");
  const removable = adminOf.filter((module) => user.roles[module] !== "none");
  const unchanged =
    ROLE_MODULES.every((module) => roles[module] === user.roles[module]) && associateId === (user.associateId ?? "");
  const linkedLabel = associates.find((a) => a.value === user.associateId)?.label;
  return (
    <TableRow>
      <TableCell className={CELL}>
        <span className="font-semibold">{user.email}</span>
        {self && <span className="text-muted-foreground"> (você)</span>}
      </TableCell>
      <TableCell className={CELL}>
        <Badge variant={user.signedIn ? "success" : "caution"}>{user.signedIn ? "Ativo" : "Ainda não entrou"}</Badge>
      </TableCell>
      {ROLE_MODULES.map((module) => (
        <TableCell key={module} className={CELL}>
          {editable(module) ? (
            <>
              <Label className="sr-only" htmlFor={id(module)}>
                Papel no {ROLE_MODULE_LABELS[module]} de {user.email}
              </Label>
              <OptionSelect
                id={id(module)}
                value={roles[module]}
                onValueChange={(value) => setRoles((current) => ({ ...current, [module]: value as ModuleRole }))}
                options={roleOptions}
                className="w-36"
              />
            </>
          ) : (
            <span
              className={cn("text-xs", user.roles[module] === "none" && "text-muted-foreground")}
              title={
                self && user.roles[module] === "admin"
                  ? "Você não pode tirar o próprio papel de administrador"
                  : MODULE_ROLE_HELP[user.roles[module]]
              }
            >
              {MODULE_ROLE_LABELS[user.roles[module]]}
            </span>
          )}
        </TableCell>
      ))}
      <TableCell className={CELL}>
        {linksAssociates ? (
          <>
            <Label className="sr-only" htmlFor={id("associate")}>
              Associado ligado ao acesso de {user.email}
            </Label>
            <OptionCombobox
              id={id("associate")}
              value={associateId}
              onValueChange={setAssociateId}
              options={associates}
              placeholder="Nenhum"
              className="w-56"
            />
          </>
        ) : (
          <span className="text-xs text-muted-foreground" title={ASSOCIATE_NOTE}>
            {user.associateId ? (linkedLabel ?? "Ligado") : "Nenhum"}
          </span>
        )}
      </TableCell>
      <TableCell className={CELL}>
        <div className="flex items-center gap-2">
          <form action={save}>
            <input type="hidden" name="userId" value={user.userId} />
            <input type="hidden" name="email" value={user.email} />
            {ROLE_MODULES.map((module) => (
              <input key={`previous-${module}`} type="hidden" name={`previous-${module}`} value={user.roles[module]} />
            ))}
            {ROLE_MODULES.filter(editable).map((module) => (
              <input key={module} type="hidden" name={`role-${module}`} value={roles[module]} />
            ))}
            {linksAssociates && (
              <>
                <input type="hidden" name="associateId" value={associateId} />
                <input type="hidden" name="previousAssociateId" value={user.associateId ?? ""} />
              </>
            )}
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={saving || unchanged}
              aria-label={`Salvar acesso de ${user.email}`}
            >
              Salvar
            </Button>
          </form>
          {!self && removable.length > 0 && (
            <form action={remove}>
              <input type="hidden" name="userId" value={user.userId} />
              <input type="hidden" name="email" value={user.email} />
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={removing}
                aria-label={`Remover acesso de ${user.email}`}
                onClick={(event) => {
                  const keeps = ROLE_MODULES.some(
                    (module) => !adminOf.includes(module) && user.roles[module] !== "none",
                  );
                  const message =
                    `Tirar o acesso de ${user.email} a ${list(removable.map((m) => ROLE_MODULE_LABELS[m]))}?` +
                    (keeps
                      ? " Os outros módulos continuam como estão."
                      : " Sem acesso a nenhum módulo, a pessoa sai do grupo e a conta é bloqueada imediatamente.");
                  if (!window.confirm(message)) event.preventDefault();
                }}
              >
                Remover
              </Button>
            </form>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
