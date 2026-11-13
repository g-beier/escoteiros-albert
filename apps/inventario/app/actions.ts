"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { pageSession } from "@/lib/session";

const itemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().max(80),
  locationId: z.string().uuid().or(z.literal("")),
  quantity: z.coerce.number().int().min(0).max(1_000_000),
  minimum: z.coerce.number().int().min(0).max(1_000_000),
  condition: z.enum(["novo", "bom", "regular", "manutencao", "inservivel"]),
});

export async function createItem(formData: FormData) {
  const session = await pageSession();
  if (!session.membership?.canEdit) redirect("/itens?erro=Sem+permissão");
  const parsed = itemSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/itens?erro=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dados inválidos")}`);
  const item = parsed.data;
  const { error } = await session.supabase.from("inventory_items").insert({
    group_id: session.membership.groupId, name: item.name, category: item.category || null,
    location_id: item.locationId || null, quantity: item.quantity, minimum_quantity: item.minimum,
    condition: item.condition, created_by: session.user.id,
  });
  if (error) redirect(`/itens?erro=${encodeURIComponent(error.message)}`);
  revalidatePath("/"); revalidatePath("/itens");
  redirect("/itens?sucesso=Item+cadastrado");
}

export async function createLocation(formData: FormData) {
  const session = await pageSession();
  if (!session.membership?.canEdit) redirect("/locais?erro=Sem+permissão");
  const name = z.string().trim().min(2).max(100).safeParse(formData.get("name"));
  if (!name.success) redirect("/locais?erro=Informe+um+nome+válido");
  const { error } = await session.supabase.from("inventory_locations").insert({ group_id: session.membership.groupId, name: name.data });
  if (error) redirect(`/locais?erro=${encodeURIComponent(error.message)}`);
  revalidatePath("/locais"); redirect("/locais?sucesso=Local+cadastrado");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
