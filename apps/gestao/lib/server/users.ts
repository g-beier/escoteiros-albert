import {
  ASSOCIATES_ROLES, GROUP_ROLES, INVENTORY_ROLES, isValidEmail,
  type AssociatesRole, type GroupRole, type GroupUser, type InventoryRole,
} from "@geas/ui/lib/roles";
import { DataError, type Db } from "@/lib/server/db";
import { rpc } from "@/lib/server/pg/db";

// Usuários do grupo (tela comum /usuarios). Tudo pelas funções SQL auditadas (056), como o administrador da sessão:
// cadastro do e-mail, papéis e remoção. A pessoa entra com a conta Google desse e-mail (lib/server/auth.ts).

export async function listGroupUsers(db: Db, groupId: string): Promise<GroupUser[]> {
  const rows = await rpc(db, "group_users", { p_group_id: groupId });
  return rows.map((row) => ({
    userId: row.user_id, email: row.email, signedIn: row.last_sign_in_at !== null,
    role: row.role as GroupRole, inventoryRole: row.inventory_role as InventoryRole, associatesRole: row.associates_role as AssociatesRole,
  }));
}

const parseRole = (value: FormDataEntryValue | null) => GROUP_ROLES.find((role) => role === value);
const parseInventoryRole = (value: FormDataEntryValue | null) => INVENTORY_ROLES.find((role) => role === value);
const parseAssociatesRole = (value: FormDataEntryValue | null) => ASSOCIATES_ROLES.find((role) => role === value);

export type UserInvite = { email: string; role: GroupRole; inventoryRole: InventoryRole; associatesRole: AssociatesRole };
export type UserRoles = {
  userId: string; email: string; role: GroupRole; inventoryRole: InventoryRole; associatesRole: AssociatesRole;
  previousRole: string; previousInventoryRole: string; previousAssociatesRole: string;
};

/** Lê o formulário de cadastro da tela de Usuários; `string` = mensagem de erro. */
export function readInvite(formData: FormData): UserInvite | string {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = parseRole(formData.get("role"));
  const inventoryRole = parseInventoryRole(formData.get("inventoryRole")) ?? "viewer";
  const associatesRole = parseAssociatesRole(formData.get("associatesRole")) ?? "viewer";
  if (!isValidEmail(email)) return "Informe um e-mail válido.";
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

/** Cadastra o e-mail com os papéis de cada módulo (auditado); a pessoa já pode entrar com o Google. */
export async function inviteUser(db: Db, groupId: string, invite: UserInvite): Promise<string> {
  await rpc(db, "admin_add_member", {
    p_group_id: groupId, p_email: invite.email, p_role: invite.role, p_inventory_role: invite.inventoryRole, p_associates_role: invite.associatesRole,
  });
  return `${invite.email} cadastrado. Já pode entrar com a conta Google desse e-mail.`;
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

/** Remove o vínculo com o grupo; sem outro grupo, a conta fica bloqueada e as sessões abertas caem (056). */
export async function removeUser(db: Db, groupId: string, currentUserId: string, userId: string): Promise<void> {
  if (userId === currentUserId) throw new DataError("Você não pode remover seu próprio acesso.");
  await rpc(db, "admin_remove_member", { p_group_id: groupId, p_user_id: userId });
}
