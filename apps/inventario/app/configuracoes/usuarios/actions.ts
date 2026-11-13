"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { inviteGroupUser, removeGroupUser, saveGroupUserRoles } from "@geas/ui/lib/users";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { memberOrError, type Member } from "@/lib/session";

// Usuários do grupo: a regra é comum aos apps (@geas/ui/lib/users); aqui só o administrador e o revalidate.
async function asAdmin(run: (member: Member) => Promise<ActionResult>): Promise<ActionResult> {
  const member = await memberOrError();
  if ("error" in member) return member;
  if (!member.isAdmin) return { error: "Apenas administradores do grupo gerenciam usuários." };
  try {
    const result = await run(member);
    revalidatePath("/configuracoes/usuarios");
    return result;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível concluir." };
  }
}

export async function inviteUser(_previous: ActionResult, formData: FormData) {
  const origin = (await headers()).get("origin") ?? "http://localhost:3002";
  return asAdmin((member) => inviteGroupUser(member.supabase, member.groupId, formData, `${origin}/auth/confirm`));
}

export async function saveUserRoles(_previous: ActionResult, formData: FormData) {
  return asAdmin((member) => saveGroupUserRoles(member.supabase, member.groupId, member.user.id, formData));
}

export async function removeUser(_previous: ActionResult, formData: FormData) {
  return asAdmin((member) => removeGroupUser(member.supabase, member.groupId, member.user.id, formData));
}
