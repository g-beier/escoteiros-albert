"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireEditor } from "@/lib/session";
import { hasSections, SCOUT_BRANCHES } from "@/lib/associates";

/** Id opcional vindo de um select ("" = nenhum). */
const optionalId = z.string().trim().transform((value) => value || null).pipe(z.uuid().nullable());

const associateSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome (mínimo 2 caracteres).").max(120),
  branch: z.enum(SCOUT_BRANCHES, { message: "Escolha o ramo." }),
  section_id: optionalId,
  patrol_id: optionalId,
}).refine((data) => !data.patrol_id || data.section_id, { message: "Escolha a seção antes da equipe." });

export type AssociateFormState = { error?: string; success?: string; tone?: "success" | "neutral" };

function readAssociate(formData: FormData) {
  return associateSchema.safeParse({
    name: formData.get("name") ?? "",
    branch: formData.get("branch") ?? "",
    section_id: formData.get("sectionId") ?? "",
    patrol_id: formData.get("patrolId") ?? "",
  });
}

/** Chaves compostas de 028_sections.sql: seção de outro ramo ou patrulha de outra seção. */
function writeError(error: { code?: string; message: string }) {
  if (error.code === "23503" || error.code === "23514") return "A seção precisa ser do ramo do associado, e a equipe, da seção escolhida.";
  return error.message;
}

const fail = (error: unknown, fallback: string): AssociateFormState => ({ error: error instanceof Error ? error.message : fallback });

export async function createAssociate(_previous: AssociateFormState, formData: FormData): Promise<AssociateFormState> {
  try {
    const parsed = readAssociate(formData);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    const { supabase, groupId } = await requireEditor("Sem permissão para gerir associados.");
    const { error } = await supabase.from("associates").insert({ group_id: groupId, ...parsed.data });
    if (error) return { error: writeError(error) };
    revalidatePath("/configuracoes/associados");
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
    if (error) return { error: writeError(error) };
    revalidatePath("/configuracoes/associados");
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
  patrol: z.string().trim().max(60).nullable().optional(),
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
    revalidatePath("/configuracoes/associados");
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

// Seções e patrulhas ------------------------------------------------------------------
// Escritas pelas funções auditadas de 028_sections.sql.

const sectionName = z.string().trim().min(2, "Informe um nome com 2 a 60 caracteres.").max(60, "Informe um nome com 2 a 60 caracteres.");

type RpcArgs = Record<string, unknown> | ((groupId: string) => Record<string, unknown>);

async function runSectionRpc(fn: string, args: RpcArgs, success: string, tone?: "neutral"): Promise<AssociateFormState> {
  try {
    const { supabase, groupId } = await requireEditor("Sem permissão para gerir seções.");
    const { error } = await supabase.rpc(fn, typeof args === "function" ? args(groupId) : args);
    if (error) return { error: error.message };
    revalidatePath("/configuracoes/associados");
    revalidatePath("/", "layout");
    return { success, ...(tone ? { tone } : {}) };
  } catch (error) {
    return fail(error, "Não foi possível salvar.");
  }
}

export async function createSection(_previous: AssociateFormState, formData: FormData): Promise<AssociateFormState> {
  const branch = z.enum(SCOUT_BRANCHES, { message: "Escolha o ramo da seção." }).safeParse(formData.get("branch"));
  if (!branch.success) return { error: branch.error.issues[0]?.message };
  if (!hasSections(branch.data)) return { error: "Adultos não têm seção: são só o ramo." };
  const name = sectionName.safeParse(formData.get("name") ?? "");
  if (!name.success) return { error: name.error.issues[0]?.message };
  return runSectionRpc("create_section", (groupId) => ({ p_group_id: groupId, p_branch: branch.data, p_name: name.data }), `Seção “${name.data}” cadastrada.`);
}

/** Renomeia (campo `name`) ou ativa/inativa (campo `active`) uma seção ou patrulha. */
export async function updateSectionOrPatrol(_previous: AssociateFormState, formData: FormData): Promise<AssociateFormState> {
  const kind = formData.get("kind") === "patrol" ? "patrol" : "section";
  const id = z.uuid().safeParse(formData.get("id"));
  const name = sectionName.safeParse(formData.get("name") ?? "");
  if (!id.success || !name.success) return { error: name.success ? "Cadastro inválido." : name.error.issues[0]?.message };
  const active = formData.has("active") ? formData.get("active") === "true" : null;
  const label = kind === "patrol" ? "Equipe" : "Seção";
  const message = active === null ? `${label} “${name.data}” salva.` : `${label} “${name.data}” ${active ? "reativada" : "inativada"}.`;
  return runSectionRpc(kind === "patrol" ? "update_patrol" : "update_section",
    { [kind === "patrol" ? "p_patrol_id" : "p_section_id"]: id.data, p_name: name.data, p_active: active }, message, active === false ? "neutral" : undefined);
}

export async function createPatrol(_previous: AssociateFormState, formData: FormData): Promise<AssociateFormState> {
  const sectionId = z.uuid().safeParse(formData.get("sectionId"));
  if (!sectionId.success) return { error: "Seção inválida." };
  const name = sectionName.safeParse(formData.get("name") ?? "");
  if (!name.success) return { error: name.error.issues[0]?.message };
  // a regra de quem se divide em equipes fica em create_patrol (030_section_branch_rules.sql)
  return runSectionRpc("create_patrol", { p_section_id: sectionId.data, p_name: name.data }, `Equipe “${name.data}” cadastrada.`);
}
