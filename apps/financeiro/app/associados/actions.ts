"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canManageEntries } from "@/lib/auth";
import { SCOUT_BRANCHES } from "@/lib/associates";

const associateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome (mínimo 2 caracteres).").max(120),
  branch: z.enum(SCOUT_BRANCHES, { message: "Escolha o ramo." }),
  section: z.string().trim().max(60).transform((value) => value || null),
});

export type AssociateFormState = { error?: string; success?: string; tone?: "success" | "neutral" };

async function requireEditor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada.");
  const { data: membership } = await supabase.from("memberships").select("group_id, role").eq("user_id", user.id).single();
  if (!membership || !canManageEntries(membership.role)) throw new Error("Sem permissão para gerir associados.");
  return { supabase, groupId: membership.group_id as string };
}

function readAssociate(formData: FormData) {
  return associateSchema.safeParse({
    name: formData.get("name") ?? "",
    branch: formData.get("branch") ?? "",
    section: formData.get("section") ?? "",
  });
}

const fail = (error: unknown, fallback: string): AssociateFormState => ({ error: error instanceof Error ? error.message : fallback });

export async function createAssociate(_previous: AssociateFormState, formData: FormData): Promise<AssociateFormState> {
  try {
    const parsed = readAssociate(formData);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    const { supabase, groupId } = await requireEditor();
    const { error } = await supabase.from("associates").insert({ group_id: groupId, ...parsed.data });
    if (error) return { error: error.message };
    revalidatePath("/associados");
    revalidatePath("/");
    return { success: `${parsed.data.name} cadastrado.` };
  } catch (error) {
    return fail(error, "Não foi possível cadastrar.");
  }
}

export async function updateAssociate(_previous: AssociateFormState, formData: FormData): Promise<AssociateFormState> {
  try {
    const id = z.uuid().parse(formData.get("id"));
    const { supabase, groupId } = await requireEditor();
    let patch: Record<string, unknown>;
    let result: AssociateFormState;
    if (formData.has("active")) {
      const active = formData.get("active") === "true";
      patch = { active };
      result = active ? { success: "Associado reativado." } : { success: "Associado inativado.", tone: "neutral" };
    } else {
      const parsed = readAssociate(formData);
      if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
      patch = parsed.data;
      result = { success: `${parsed.data.name} salvo.` };
    }
    const { error } = await supabase.from("associates").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("group_id", groupId);
    if (error) return { error: error.message };
    revalidatePath("/associados");
    revalidatePath("/");
    return result;
  } catch (error) {
    return fail(error, "Não foi possível salvar.");
  }
}
