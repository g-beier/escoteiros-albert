"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { InputError, runAction } from "@/lib/action";
import { adminOrError } from "@/lib/server/session";
import * as users from "@/lib/server/users";

// Usuários do grupo (comum aos módulos): só o administrador; as regras ficam em lib/server/users.ts.

function read<T>(value: T | string): T {
  if (typeof value === "string") throw new InputError(value);
  return value;
}

export async function inviteUser(_previous: ActionResult, formData: FormData) {
  return runAction(adminOrError, async ({ db, groupId }) => {
    const message = await users.inviteUser(db, groupId, read(users.readInvite(formData)),
      `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm`);
    revalidatePath("/usuarios");
    return message;
  });
}

export async function saveUserRoles(_previous: ActionResult, formData: FormData) {
  return runAction(adminOrError, async ({ db, groupId, user }) => {
    const roles = read(users.readRoles(formData));
    const changed = await users.saveUserRoles(db, groupId, user.id, roles);
    revalidatePath("/usuarios");
    return changed ? { success: `Papéis de ${roles.email} salvos.` } : { success: "Nada mudou.", tone: "neutral" };
  });
}

export async function removeUser(_previous: ActionResult, formData: FormData) {
  return runAction(adminOrError, async ({ db, groupId, user }) => {
    await users.removeUser(db, groupId, user.id, String(formData.get("userId") ?? ""));
    revalidatePath("/usuarios");
    return { success: `Acesso de ${String(formData.get("email") ?? "")} removido.`, tone: "neutral" };
  });
}
