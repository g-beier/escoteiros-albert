"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireEditor } from "@/lib/session";
import { SCOUT_BRANCHES } from "@/lib/associates";

const associateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome (mínimo 2 caracteres).").max(120),
  branch: z.enum(SCOUT_BRANCHES, { message: "Escolha o ramo." }),
  section: z.string().trim().max(60).transform((value) => value || null),
});

export type AssociateFormState = { error?: string; success?: string; tone?: "success" | "neutral" };

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
    const { supabase, groupId } = await requireEditor("Sem permissão para gerir associados.");
    const { error } = await supabase.from("associates").insert({ group_id: groupId, ...parsed.data });
    if (error) return { error: error.message };
    revalidatePath("/associados");
    revalidatePath("/", "layout");
    return { success: `${parsed.data.name} cadastrado.` };
  } catch (error) {
    return fail(error, "Não foi possível cadastrar.");
  }
}

export async function updateAssociate(_previous: AssociateFormState, formData: FormData): Promise<AssociateFormState> {
  try {
    const id = z.uuid().parse(formData.get("id"));
    const { supabase, groupId } = await requireEditor("Sem permissão para gerir associados.");
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
    revalidatePath("/", "layout");
    return result;
  } catch (error) {
    return fail(error, "Não foi possível salvar.");
  }
}

const importRow = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(120),
  branch: z.enum(SCOUT_BRANCHES),
  section: z.string().trim().max(60).nullable().optional(),
  active: z.boolean(),
});

/** Importação em massa (CSV lido no navegador): cadastra novos e, com `id`, atualiza ramo, seção e status. Tudo ou nada. */
export async function importAssociates(rows: unknown): Promise<AssociateFormState> {
  try {
    const parsed = z.array(importRow).min(1, "Nenhum associado para importar.").max(5000, "Importe no máximo 5.000 associados por vez.").safeParse(rows);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    const { supabase, groupId } = await requireEditor("Sem permissão para gerir associados.");
    const { data, error } = await supabase.rpc("import_associates", { p_group_id: groupId, p_rows: parsed.data });
    if (error) return { error: error.message };
    const result = z.object({ created: z.number(), updated: z.number() }).catch({ created: 0, updated: 0 }).parse(data);
    revalidatePath("/associados");
    revalidatePath("/", "layout");
    const parts = [
      result.created && `${result.created} ${result.created === 1 ? "cadastrado" : "cadastrados"}`,
      result.updated && `${result.updated} ${result.updated === 1 ? "atualizado" : "atualizados"}`,
    ].filter(Boolean);
    return { success: `Associados importados: ${parts.join(", ")}.` };
  } catch (error) {
    return fail(error, "Não foi possível importar.");
  }
}
