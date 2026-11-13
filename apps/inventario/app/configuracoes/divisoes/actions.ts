"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { managerOrError } from "@/lib/session";

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

/** Cria (sem `id`) ou edita uma divisão: nome, descrição e divisão superior (vazio = raiz). */
export async function saveLocation(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const member = await managerOrError("Apenas o gestor do inventário altera divisões.");
  if ("error" in member) return member;
  const id = text(formData, "id") || null;
  const { error } = await member.supabase.rpc("inventory_save_location", {
    p_group_id: member.groupId, p_id: id, p_parent_id: text(formData, "parentId") || null,
    p_name: text(formData, "name"), p_description: text(formData, "description") || null, p_active: true,
  });
  if (error) return { error: error.message };
  revalidatePath("/configuracoes/divisoes");
  return { success: id ? "Divisão salva." : "Divisão cadastrada." };
}

/** Inativa ou reativa a divisão, mantendo nome, descrição e posição na árvore. */
export async function setLocationActive(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const member = await managerOrError("Apenas o gestor do inventário altera divisões.");
  if ("error" in member) return member;
  const id = text(formData, "id");
  const active = text(formData, "active") === "true";
  const { data: location } = await member.supabase.from("inventory_locations").select("parent_id, name, description").eq("id", id).eq("group_id", member.groupId).maybeSingle();
  if (!location) return { error: "Divisão não encontrada." };
  const { error } = await member.supabase.rpc("inventory_save_location", {
    p_group_id: member.groupId, p_id: id, p_parent_id: location.parent_id, p_name: location.name, p_description: location.description, p_active: active,
  });
  if (error) return { error: error.message };
  revalidatePath("/configuracoes/divisoes");
  return active ? { success: `${location.name} reativada.` } : { success: `${location.name} inativada.`, tone: "neutral" };
}

/** Sobe ou desce a divisão entre as irmãs (ordem dos locais em Materiais e nos seletores). */
export async function moveLocation(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const member = await managerOrError("Apenas o gestor do inventário altera divisões.");
  if ("error" in member) return member;
  const { error } = await member.supabase.rpc("inventory_move_location", { p_id: text(formData, "id"), p_offset: text(formData, "offset") === "-1" ? -1 : 1 });
  if (error) return { error: error.message };
  revalidatePath("/configuracoes/divisoes"); revalidatePath("/materiais");
  return {};
}
