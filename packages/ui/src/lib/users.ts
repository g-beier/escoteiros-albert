// Gestão de usuários do grupo, comum aos apps (só no servidor: usa a chave de serviço do Supabase).
// Cada app expõe Server Actions que conferem o administrador e chamam estas funções; a tela é
// components/users-manager.tsx. Alterações de papel e remoção passam pelas funções SQL auditadas.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ALLOWED_EMAIL_DOMAIN, GROUP_ROLES, INVENTORY_ROLES, isAllowedEmail, type GroupRole, type GroupUser, type InventoryRole } from "./roles";
import type { ActionResult } from "./use-action-toast";

function env(name: "NEXT_PUBLIC_SUPABASE_URL" | "SUPABASE_SECRET_KEY") {
  const value = process.env[name];
  if (!value) throw new Error(`Configure ${name} no .env.local do app.`);
  return value;
}

/** Cliente com a chave de serviço (convites, lista de e-mails, bloqueio). Nunca usar no navegador. */
export function createAdminClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export async function listGroupUsers(groupId: string): Promise<GroupUser[]> {
  const admin = createAdminClient();
  const [{ data: memberships }, { data: auth }] = await Promise.all([
    admin.from("memberships").select("user_id, role, inventory_role").eq("group_id", groupId).order("created_at"),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);
  const users = new Map((auth?.users ?? []).map((user) => [user.id, user]));
  return (memberships ?? []).map((m) => {
    const user = users.get(m.user_id as string);
    return {
      userId: m.user_id as string, email: user?.email ?? "Usuário indisponível", confirmed: Boolean(user?.email_confirmed_at),
      role: m.role as GroupRole, inventoryRole: m.inventory_role as InventoryRole,
    };
  });
}

const parseRole = (value: FormDataEntryValue | null) => GROUP_ROLES.find((role) => role === value);
const parseInventoryRole = (value: FormDataEntryValue | null) => INVENTORY_ROLES.find((role) => role === value);

/** Convida por e-mail com os papéis dos dois apps. `acting` é o cliente da sessão do administrador (auditoria). */
export async function inviteGroupUser(acting: SupabaseClient, groupId: string, formData: FormData, redirectTo: string): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = parseRole(formData.get("role"));
  const inventoryRole = parseInventoryRole(formData.get("inventoryRole")) ?? "viewer";
  if (!isAllowedEmail(email)) return { error: `Somente e-mails @${ALLOWED_EMAIL_DOMAIN} são permitidos.` };
  if (!role) return { error: "Papel inválido." };
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { invited_group_id: groupId } });
  if (error) return { error: error.message };
  if (!data.user) return { error: "O convite não retornou um usuário." };
  const { error: membershipError } = await admin.from("memberships").insert({ group_id: groupId, user_id: data.user.id, role });
  if (membershipError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: membershipError.message };
  }
  const { error: auditError } = await acting.rpc("record_user_invite", { p_group_id: groupId, p_target_user_id: data.user.id, p_role: role });
  if (auditError) return { error: `Convite enviado, mas a auditoria falhou: ${auditError.message}` };
  if (role !== "admin" && inventoryRole !== "viewer") {
    const { error: inventoryError } = await acting.rpc("admin_change_inventory_role", { p_group_id: groupId, p_user_id: data.user.id, p_role: inventoryRole });
    if (inventoryError) return { error: `Convite enviado, mas o papel no Inventário falhou: ${inventoryError.message}` };
  }
  return { success: `Convite enviado para ${email}.` };
}

/** Salva os papéis de uma pessoa nos dois apps (só o que mudou). */
export async function saveGroupUserRoles(acting: SupabaseClient, groupId: string, currentUserId: string, formData: FormData): Promise<ActionResult> {
  const userId = String(formData.get("userId") ?? "");
  const email = String(formData.get("email") ?? "");
  const role = parseRole(formData.get("role"));
  const inventoryRole = parseInventoryRole(formData.get("inventoryRole"));
  if (!role || !inventoryRole) return { error: "Papel inválido." };
  if (userId === currentUserId && role !== "admin") return { error: "Você não pode remover sua própria função de administrador." };
  let changed = false;
  if (role !== formData.get("previousRole")) {
    const { error } = await acting.rpc("admin_change_member_role", { p_group_id: groupId, p_user_id: userId, p_role: role });
    if (error) return { error: error.message };
    changed = true;
  }
  if (role !== "admin" && inventoryRole !== formData.get("previousInventoryRole")) {
    const { error } = await acting.rpc("admin_change_inventory_role", { p_group_id: groupId, p_user_id: userId, p_role: inventoryRole });
    if (error) return { error: error.message };
    changed = true;
  }
  return changed ? { success: `Papéis de ${email} salvos.` } : { success: "Nada mudou.", tone: "neutral" };
}

/** Remove o vínculo com o grupo e bloqueia a conta no Auth (desfaz o bloqueio se a remoção falhar). */
export async function removeGroupUser(acting: SupabaseClient, groupId: string, currentUserId: string, formData: FormData): Promise<ActionResult> {
  const userId = String(formData.get("userId") ?? "");
  const email = String(formData.get("email") ?? "");
  if (userId === currentUserId) return { error: "Você não pode remover seu próprio acesso." };
  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (banError) return { error: banError.message };
  const { error } = await acting.rpc("admin_remove_member", { p_group_id: groupId, p_user_id: userId });
  if (error) {
    await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
    return { error: error.message };
  }
  return { success: `Acesso de ${email} removido.`, tone: "neutral" };
}
