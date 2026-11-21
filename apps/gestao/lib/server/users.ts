import {
  ALLOWED_EMAIL_DOMAIN, ASSOCIATES_ROLES, GROUP_ROLES, INVENTORY_ROLES, isAllowedEmail,
  type AssociatesRole, type GroupRole, type GroupUser, type InventoryRole,
} from "@geas/ui/lib/roles";
import { DataError, type Db } from "@/lib/server/db";
import { rowsOf, rpc } from "@/lib/server/supabase/db";
import { serviceClient } from "@/lib/server/supabase/service";

// Usuários do grupo (tela comum /usuarios). Lista de e-mails, convite e bloqueio usam a chave de serviço (Auth);
// papéis e remoção passam pelas funções SQL auditadas, como o administrador da sessão (`db`).

export async function listGroupUsers(groupId: string): Promise<GroupUser[]> {
  const admin = serviceClient();
  const [memberships, { data: auth, error }] = await Promise.all([
    admin.from("memberships").select("user_id, role, inventory_role, associates_role").eq("group_id", groupId).order("created_at").then(rowsOf),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  if (error) throw new DataError(error.message);
  const users = new Map(auth.users.map((user) => [user.id, user]));
  return memberships.map((m) => {
    const user = users.get(m.user_id);
    return {
      userId: m.user_id, email: user?.email ?? "Usuário indisponível", confirmed: Boolean(user?.email_confirmed_at),
      role: m.role as GroupRole, inventoryRole: m.inventory_role as InventoryRole, associatesRole: m.associates_role as AssociatesRole,
    };
  });
}

const parseRole = (value: FormDataEntryValue | null) => GROUP_ROLES.find((role) => role === value);
const parseInventoryRole = (value: FormDataEntryValue | null) => INVENTORY_ROLES.find((role) => role === value);
const parseAssociatesRole = (value: FormDataEntryValue | null) => ASSOCIATES_ROLES.find((role) => role === value);

export type UserInvite = { email: string; role: GroupRole; inventoryRole: InventoryRole; associatesRole: AssociatesRole };
export type UserRoles = {
  userId: string; email: string; role: GroupRole; inventoryRole: InventoryRole; associatesRole: AssociatesRole;
  previousRole: string; previousInventoryRole: string; previousAssociatesRole: string;
};

/** Lê o formulário de convite da tela de Usuários; `string` = mensagem de erro. */
export function readInvite(formData: FormData): UserInvite | string {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = parseRole(formData.get("role"));
  const inventoryRole = parseInventoryRole(formData.get("inventoryRole")) ?? "viewer";
  const associatesRole = parseAssociatesRole(formData.get("associatesRole")) ?? "viewer";
  if (!isAllowedEmail(email)) return `Somente e-mails @${ALLOWED_EMAIL_DOMAIN} são permitidos.`;
  if (!role) return "Papel inválido.";
  return { email, role, inventoryRole, associatesRole };
}

/** Lê o formulário de papéis de uma linha da tela de Usuários; `string` = mensagem de erro. */
export function readRoles(formData: FormData): UserRoles | string {
  const role = parseRole(formData.get("role"));
  const inventoryRole = parseInventoryRole(formData.get("inventoryRole"));
  const associatesRole = parseAssociatesRole(formData.get("associatesRole"));
  if (!role || !inventoryRole || !associatesRole) return "Papel inválido.";
  return {
    userId: String(formData.get("userId") ?? ""), email: String(formData.get("email") ?? ""), role, inventoryRole, associatesRole,
    previousRole: String(formData.get("previousRole") ?? ""), previousInventoryRole: String(formData.get("previousInventoryRole") ?? ""),
    previousAssociatesRole: String(formData.get("previousAssociatesRole") ?? ""),
  };
}

/** Convida por e-mail com os papéis de cada módulo. `db` é o do administrador da sessão (auditoria). */
export async function inviteUser(db: Db, groupId: string, invite: UserInvite, redirectTo: string): Promise<string> {
  const admin = serviceClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(invite.email, { redirectTo, data: { invited_group_id: groupId } });
  if (error) throw new DataError(error.message);
  if (!data.user) throw new DataError("O convite não retornou um usuário.");
  const { error: membershipError } = await admin.from("memberships").insert({ group_id: groupId, user_id: data.user.id, role: invite.role });
  if (membershipError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new DataError(membershipError.message);
  }
  try {
    await rpc(db, "record_user_invite", { p_group_id: groupId, p_target_user_id: data.user.id, p_role: invite.role });
  } catch (auditError) {
    throw new DataError(`Convite enviado, mas a auditoria falhou: ${(auditError as Error).message}`);
  }
  if (invite.role !== "admin" && invite.inventoryRole !== "viewer") {
    try {
      await rpc(db, "admin_change_inventory_role", { p_group_id: groupId, p_user_id: data.user.id, p_role: invite.inventoryRole });
    } catch (inventoryError) {
      throw new DataError(`Convite enviado, mas o papel no Inventário falhou: ${(inventoryError as Error).message}`);
    }
  }
  if (invite.role !== "admin" && invite.associatesRole !== "viewer") {
    try {
      await rpc(db, "admin_change_associates_role", { p_group_id: groupId, p_user_id: data.user.id, p_role: invite.associatesRole });
    } catch (associatesError) {
      throw new DataError(`Convite enviado, mas o papel no Associados falhou: ${(associatesError as Error).message}`);
    }
  }
  return `Convite enviado para ${invite.email}.`;
}

/** Salva os papéis de uma pessoa em cada módulo (só o que mudou); `false` = nada mudou. */
export async function saveUserRoles(db: Db, groupId: string, currentUserId: string, roles: UserRoles): Promise<boolean> {
  if (roles.userId === currentUserId && roles.role !== "admin") throw new DataError("Você não pode remover sua própria função de administrador.");
  let changed = false;
  if (roles.role !== roles.previousRole) {
    await rpc(db, "admin_change_member_role", { p_group_id: groupId, p_user_id: roles.userId, p_role: roles.role });
    changed = true;
  }
  if (roles.role !== "admin" && roles.inventoryRole !== roles.previousInventoryRole) {
    await rpc(db, "admin_change_inventory_role", { p_group_id: groupId, p_user_id: roles.userId, p_role: roles.inventoryRole });
    changed = true;
  }
  if (roles.role !== "admin" && roles.associatesRole !== roles.previousAssociatesRole) {
    await rpc(db, "admin_change_associates_role", { p_group_id: groupId, p_user_id: roles.userId, p_role: roles.associatesRole });
    changed = true;
  }
  return changed;
}

/** Remove o vínculo com o grupo e bloqueia a conta no Auth (desfaz o bloqueio se a remoção falhar). */
export async function removeUser(db: Db, groupId: string, currentUserId: string, userId: string): Promise<void> {
  if (userId === currentUserId) throw new DataError("Você não pode remover seu próprio acesso.");
  const admin = serviceClient();
  const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (banError) throw new DataError(banError.message);
  try {
    await rpc(db, "admin_remove_member", { p_group_id: groupId, p_user_id: userId });
  } catch (error) {
    await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
    throw error;
  }
}
