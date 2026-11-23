"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import { usersAdminOrError } from "@/lib/server/session";
import * as users from "@/lib/server/users";

// Usuários do grupo (comum aos módulos): quem administra algum módulo; as regras ficam em lib/server/users.ts e no banco.

function read<T>(value: T | string): T {
  if (typeof value === "string") throw new InputError(value);
  return value;
}

export async function inviteUser(_previous: ActionResult, formData: FormData) {
  return runAction(usersAdminOrError, async ({ db, groupId }) => {
    const message = await users.inviteUser(db, groupId, read(users.readInvite(formData)));
    revalidatePath("/usuarios");
    return message;
  });
}

export async function saveUserRoles(_previous: ActionResult, formData: FormData) {
  return runAction(usersAdminOrError, async ({ db, groupId, user }) => {
    const roles = read(users.readRoles(formData));
    const changed = await users.saveUserRoles(db, groupId, user.id, roles);
    revalidatePath("/usuarios");
    return changed ? { success: `Acesso de ${roles.email} salvo.` } : { success: "Nada mudou.", tone: "neutral" };
  });
}

export async function removeUser(_previous: ActionResult, formData: FormData) {
  return runAction(usersAdminOrError, async ({ db, groupId, user }) => {
    const left = await users.removeUser(db, groupId, user.id, String(formData.get("userId") ?? ""));
    revalidatePath("/usuarios");
    const email = String(formData.get("email") ?? "");
    return { success: left ? `${email} saiu do grupo.` : `Acesso de ${email} aos seus módulos removido.`, tone: "neutral" };
  });
}
