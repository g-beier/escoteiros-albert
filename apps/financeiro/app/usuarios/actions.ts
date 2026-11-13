"use server";

import { revalidatePath } from "next/cache";
import { inviteGroupUser, removeGroupUser, saveGroupUserRoles } from "@geas/ui/lib/users";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/session";

// Usuários do grupo: a regra é comum aos apps (@geas/ui/lib/users); aqui só o administrador e o revalidate.
async function asAdmin(run: (member: Awaited<ReturnType<typeof requireAdmin>>) => Promise<ActionResult>): Promise<ActionResult> {
  try {
    const result = await run(await requireAdmin());
    revalidatePath("/usuarios");
    return result;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível concluir." };
  }
}

export async function inviteUser(_previous: ActionResult, formData: FormData) {
  return asAdmin(async ({ groupId }) => inviteGroupUser(await createClient(), groupId, formData,
    `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`));
}

export async function saveUserRoles(_previous: ActionResult, formData: FormData) {
  return asAdmin(async ({ groupId, user }) => saveGroupUserRoles(await createClient(), groupId, user.id, formData));
}

export async function removeUser(_previous: ActionResult, formData: FormData) {
  return asAdmin(async ({ groupId, user }) => removeGroupUser(await createClient(), groupId, user.id, formData));
}
