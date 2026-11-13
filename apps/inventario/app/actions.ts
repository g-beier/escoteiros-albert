"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@geas/ui/lib/use-action-toast";
import { createClient } from "@/lib/supabase/server";
import { pageSession } from "@/lib/session";

const itemSchema = z.object({
  name: z.string().trim().min(2, "O nome precisa de ao menos 2 caracteres.").max(120),
  category: z.string().trim().max(80),
  locationId: z.string().uuid().or(z.literal("")),
  quantity: z.coerce.number().int().min(0, "A quantidade não pode ser negativa.").max(1_000_000),
  minimum: z.coerce.number().int().min(0, "O mínimo não pode ser negativo.").max(1_000_000),
  condition: z.enum(["novo", "bom", "regular", "manutencao", "inservivel"]),
});

export async function createItem(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await pageSession();
  if (!session.membership?.canEdit) return { error: "Sem permissão para cadastrar itens." };
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const item = parsed.data;
  const { error } = await session.supabase.from("inventory_items").insert({
    group_id: session.membership.groupId, name: item.name, category: item.category || null,
    location_id: item.locationId || null, quantity: item.quantity, minimum_quantity: item.minimum,
    condition: item.condition, created_by: session.user.id,
  });
  if (error) return { error: error.message };
  revalidatePath("/"); revalidatePath("/itens"); revalidatePath("/locais");
  return { success: "Item cadastrado." };
}

export async function createLocation(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await pageSession();
  if (!session.membership?.canEdit) return { error: "Sem permissão para cadastrar locais." };
  const parsed = z.object({
    name: z.string().trim().min(2, "Informe um nome com ao menos 2 caracteres.").max(100),
    description: z.string().trim().max(300),
  }).safeParse({ name: formData.get("name") ?? "", description: formData.get("description") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { error } = await session.supabase.from("inventory_locations").insert({
    group_id: session.membership.groupId, name: parsed.data.name, description: parsed.data.description || null,
  });
  if (error) return { error: error.code === "23505" ? "Já existe um local com esse nome." : error.message };
  revalidatePath("/"); revalidatePath("/locais");
  return { success: "Local cadastrado." };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
