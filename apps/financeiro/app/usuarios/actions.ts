"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail, MEMBER_ROLES, type MemberRole } from "@/lib/auth";

export async function inviteUser(_previous: { error?: string; success?: string }, formData: FormData) {
  try {
    const { groupId } = await requireAdmin();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const role = String(formData.get("role") ?? "viewer") as MemberRole;
    if (!isAllowedEmail(email)) return { error: `Somente e-mails @${ALLOWED_EMAIL_DOMAIN} são permitidos.` };
    if (!MEMBER_ROLES.includes(role)) return { error: "Papel inválido." };

    const admin = createAdminClient();
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { invited_group_id: groupId },
    });
    if (error) return { error: error.message };
    if (!data.user) return { error: "O convite não retornou um usuário." };
    const { error: membershipError } = await admin.from("memberships").insert({ group_id: groupId, user_id: data.user.id, role });
    if (membershipError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return { error: membershipError.message };
    }
    const actingClient = await createClient();
    const { error: auditError } = await actingClient.rpc("record_user_invite", { p_group_id: groupId, p_target_user_id: data.user.id, p_role: role });
    if (auditError) return { error: `Convite enviado, mas a auditoria falhou: ${auditError.message}` };
    revalidatePath("/usuarios");
    return { success: `Convite enviado para ${email}.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível enviar o convite." };
  }
}

export async function changeRole(formData: FormData) {
  const { groupId, user: { id: currentUserId } } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "viewer") as MemberRole;
  if (!MEMBER_ROLES.includes(role)) throw new Error("Papel inválido.");
  if (userId === currentUserId && role !== "admin") throw new Error("Você não pode remover sua própria função de administrador.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_change_member_role", { p_group_id: groupId, p_user_id: userId, p_role: role });
  if (error) throw new Error(error.message);
  revalidatePath("/usuarios");
}

export async function removeUser(formData: FormData) {
  const { groupId, user: { id: currentUserId } } = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  if (userId === currentUserId) throw new Error("Você não pode remover seu próprio acesso.");
  const admin = createAdminClient();
  const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (banError) throw new Error(banError.message);
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_remove_member", { p_group_id: groupId, p_user_id: userId });
  if (error) {
    await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
    throw new Error(error.message);
  }
  revalidatePath("/usuarios");
}
