import {
  ROLE_MODULES,
  isModuleRole,
  isValidEmail,
  type GroupUser,
  type ModuleRole,
  type ModuleRoles,
} from "@geas/ui/lib/roles";
import { DataError, type Db } from "@/lib/server/db";
import { rows, rpc } from "@/lib/server/pg/db";

// Usuários do grupo (tela comum /usuarios). Tudo pelas funções SQL auditadas (003), como quem está logado: cada
// administrador de módulo cadastra e muda só o papel nos módulos que administra; quem fica sem acesso em todos sai do
// grupo. A pessoa entra com a conta Google desse e-mail (lib/server/auth.ts).

export async function listGroupUsers(db: Db, groupId: string): Promise<GroupUser[]> {
  const rows = await rpc(db, "group_users", { p_group_id: groupId });
  return rows.map((row) => ({
    userId: row.user_id,
    email: row.email,
    signedIn: row.last_sign_in_at !== null,
    roles: {
      finance: row.finance_role as ModuleRole,
      inventory: row.inventory_role as ModuleRole,
      associates: row.associates_role as ModuleRole,
    },
    associateId: row.associate_id ?? null,
  }));
}

/** Adultos que podem ser ligados a um acesso (o administrador do Associados lê o módulo), por nome; desligados no fim. */
export async function linkableAssociates(db: Db, groupId: string): Promise<{ value: string; label: string }[]> {
  const adults = await rows<{ id: string; name: string; active: boolean }>(
    db,
    (sql) => sql`
    select id, name, active from public.associates where group_id = ${groupId} and branch = 'adulto' order by active desc, name`,
  );
  return adults.map((a) => ({ value: a.id, label: a.active ? a.name : `${a.name} (desligado)` }));
}

/** Papel de cada módulo no formulário (`role-<módulo>`); ausente = "Sem acesso" (módulo que quem cadastra não administra). */
function readModuleRoles(formData: FormData, prefix: string): ModuleRoles | string {
  const roles = {} as ModuleRoles;
  for (const mod of ROLE_MODULES) {
    const value = formData.get(`${prefix}-${mod}`) ?? "none";
    if (!isModuleRole(value)) return "Papel inválido.";
    roles[mod] = value;
  }
  return roles;
}

export type UserInvite = { email: string; roles: ModuleRoles };
export type UserRoles = {
  userId: string;
  email: string;
  roles: ModuleRoles;
  previousRoles: ModuleRoles;
  /** Associado ligado ao acesso ("" = nenhum); nulo quando quem salva não pode mudá-lo. */
  associateId: string | null;
  previousAssociateId: string;
};

/** Lê o formulário de cadastro da tela de Usuários; `string` = mensagem de erro. */
export function readInvite(formData: FormData): UserInvite | string {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!isValidEmail(email)) return "Informe um e-mail válido.";
  const roles = readModuleRoles(formData, "role");
  if (typeof roles === "string") return roles;
  if (ROLE_MODULES.every((mod) => roles[mod] === "none")) return "Dê acesso a pelo menos um módulo.";
  return { email, roles };
}

/** Lê o formulário de papéis de uma linha da tela de Usuários; `string` = mensagem de erro. Os módulos que quem salva
 * não administra vêm com o papel anterior. */
export function readRoles(formData: FormData): UserRoles | string {
  const previousRoles = readModuleRoles(formData, "previous");
  if (typeof previousRoles === "string") return previousRoles;
  const roles = { ...previousRoles };
  for (const mod of ROLE_MODULES) {
    const value = formData.get(`role-${mod}`);
    if (value === null) continue;
    if (!isModuleRole(value)) return "Papel inválido.";
    roles[mod] = value;
  }
  const associateId = formData.get("associateId");
  return {
    userId: String(formData.get("userId") ?? ""),
    email: String(formData.get("email") ?? ""),
    roles,
    previousRoles,
    associateId: associateId === null ? null : String(associateId),
    previousAssociateId: String(formData.get("previousAssociateId") ?? ""),
  };
}

/** Cadastra o e-mail com o papel de cada módulo (auditado); a pessoa já pode entrar com o Google. */
export async function inviteUser(db: Db, groupId: string, invite: UserInvite): Promise<string> {
  await rpc(db, "admin_add_member", {
    p_group_id: groupId,
    p_email: invite.email,
    p_finance_role: invite.roles.finance,
    p_inventory_role: invite.roles.inventory,
    p_associates_role: invite.roles.associates,
  });
  return `${invite.email} cadastrado. Já pode entrar com a conta Google desse e-mail.`;
}

/** Salva o papel em cada módulo e o associado ligado (só o que mudou); `false` = nada mudou. O associado é ligado antes
 * dos papéis: se a pessoa ficar sem acesso a todos os módulos, ela sai do grupo. */
export async function saveUserRoles(
  db: Db,
  groupId: string,
  currentUserId: string,
  roles: UserRoles,
): Promise<boolean> {
  let changed = false;
  if (roles.associateId !== null && roles.associateId !== roles.previousAssociateId) {
    await rpc(db, "admin_link_member_associate", {
      p_group_id: groupId,
      p_user_id: roles.userId,
      p_associate_id: roles.associateId || null,
    });
    changed = true;
  }
  for (const mod of ROLE_MODULES) {
    if (roles.roles[mod] === roles.previousRoles[mod]) continue;
    if (roles.userId === currentUserId && roles.previousRoles[mod] === "admin") {
      throw new DataError("Você não pode tirar sua própria função de administrador.");
    }
    await rpc(db, "admin_set_module_role", {
      p_group_id: groupId,
      p_user_id: roles.userId,
      p_module: mod,
      p_role: roles.roles[mod],
    });
    changed = true;
  }
  return changed;
}

/** Tira o acesso aos módulos que quem está logado administra; `true` = a pessoa ficou sem nenhum e saiu do grupo (sem
 * outro grupo, a conta fica bloqueada e as sessões abertas caem). */
export async function removeUser(db: Db, groupId: string, currentUserId: string, userId: string): Promise<boolean> {
  if (userId === currentUserId) throw new DataError("Você não pode remover seu próprio acesso.");
  return (await rpc(db, "admin_remove_member", { p_group_id: groupId, p_user_id: userId })) === true;
}
