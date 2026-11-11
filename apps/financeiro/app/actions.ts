"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const nonZeroCents = z.number().int().safe().refine((value) => value !== 0, {
  message: "O valor não pode ser zero.",
});

const entrySchema = z.object({
  date: z.iso.date(),
  description: z.string().trim().min(2).max(200),
  document: z.string().trim().max(60).optional(),
  totalCents: nonZeroCents,
  splits: z.array(z.object({ categoryId: z.uuid(), amountCents: nonZeroCents })).min(1),
}).refine((value) => value.splits.reduce((sum, split) => sum + split.amountCents, 0) === value.totalCents, {
  message: "A soma das rubricas deve ser igual ao total do lançamento.",
});

export async function createEntry(payload: unknown) {
  const parsed = entrySchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sessão expirada." };

  const { data: membership } = await supabase.from("memberships").select("group_id").eq("user_id", user.id).single();
  if (!membership) return { error: "Sua conta ainda não pertence a um grupo." };

  const { error } = await supabase.rpc("create_ledger_entry", {
    p_group_id: membership.group_id,
    p_entry_date: parsed.data.date,
    p_description: parsed.data.description,
    p_document: parsed.data.document || null,
    p_total_cents: parsed.data.totalCents,
    p_splits: parsed.data.splits.map((s) => ({ category_id: s.categoryId, amount_cents: s.amountCents })),
  });
  if (error) return { error: error.message };
  revalidatePath("/");
  return { success: true };
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
