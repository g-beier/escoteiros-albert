"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { managerOrError } from "@/lib/session";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

/** Cria (sem `id`) ou edita uma família: nome e código de etiqueta (3 dígitos, opcional). */
export async function saveFamily(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const member = await managerOrError("Apenas o gestor do inventário altera famílias.");
  if ("error" in member) return member;
  const id = text(formData, "id") || null;
  const { error } = await member.supabase.rpc("inventory_save_family", {
    p_group_id: member.groupId, p_id: id, p_name: text(formData, "name"), p_code: text(formData, "code") || null, p_active: true,
  });
  if (error) return { error: error.message };
  revalidatePath("/configuracoes/familias");
  return { success: id ? "Família salva." : "Família cadastrada." };
}

export async function setFamilyActive(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const member = await managerOrError("Apenas o gestor do inventário altera famílias.");
  if ("error" in member) return member;
  const id = text(formData, "id");
  const active = text(formData, "active") === "true";
  const { data: family } = await member.supabase.from("inventory_families").select("name, code").eq("id", id).eq("group_id", member.groupId).maybeSingle();
  if (!family) return { error: "Família não encontrada." };
  const { error } = await member.supabase.rpc("inventory_save_family", { p_group_id: member.groupId, p_id: id, p_name: family.name, p_code: family.code, p_active: active });
  if (error) return { error: error.message };
  revalidatePath("/configuracoes/familias");
  return active ? { success: `${family.name} reativada.` } : { success: `${family.name} inativada.`, tone: "neutral" };
}
