"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canManageEntries } from "@/lib/auth";
import { CATALOG_KINDS, catalogErrorMessage, isCatalogKind, type CatalogKind } from "@/lib/catalogs";

export type CatalogFormState = { error?: string; success?: string; tone?: "success" | "neutral" };

async function requireEditor() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada.");
  const { data: membership } = await supabase.from("memberships").select("group_id, role").eq("user_id", user.id).single();
  if (!membership || !canManageEntries(membership.role)) throw new Error("Sem permissão para alterar cadastros.");
  return { supabase, groupId: membership.group_id as string };
}

function readKind(formData: FormData): CatalogKind {
  const kind = formData.get("kind");
  if (!isCatalogKind(kind)) throw new Error("Cadastro inválido.");
  return kind;
}

function readName(formData: FormData, kind: CatalogKind) {
  return z.string().trim().min(2, "Informe um nome com ao menos 2 caracteres.").max(CATALOG_KINDS[kind].maxLength).safeParse(formData.get("name") ?? "");
}

function revalidate() {
  revalidatePath("/cadastros");
  revalidatePath("/", "layout");
}

export async function createCatalogItem(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  try {
    const kind = readKind(formData);
    const name = readName(formData, kind);
    if (!name.success) return { error: name.error.issues[0]?.message };
    let code: string | undefined;
    if (kind === "categories") {
      const parsed = z.string().trim().regex(/^[12](\.[0-9]{1,3}){1,4}$/, "Informe o código da rubrica, ex.: 2.5.6 (comece com 1 para receita ou 2 para despesa).").safeParse(formData.get("code") ?? "");
      if (!parsed.success) return { error: parsed.error.issues[0]?.message };
      code = parsed.data;
    }
    const { supabase, groupId } = await requireEditor();
    const { error } = await supabase.from(CATALOG_KINDS[kind].table).insert({ group_id: groupId, name: name.data, ...(code ? { code } : {}) });
    if (error) return { error: error.code === "23505" && code ? `Já existe uma rubrica com o código ${code}.` : catalogErrorMessage(error, CATALOG_KINDS[kind].singular) };
    revalidate();
    return { success: `“${code ? `${code} ` : ""}${name.data}” cadastrada.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível cadastrar." };
  }
}

export async function updateCatalogItem(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  try {
    const kind = readKind(formData);
    const id = z.uuid().parse(formData.get("id"));
    const { supabase, groupId } = await requireEditor();
    const patch: { name?: string; active?: boolean } = {};
    const { singular } = CATALOG_KINDS[kind];
    const label = singular.charAt(0).toUpperCase() + singular.slice(1);
    let result: CatalogFormState = { success: `${label} salva.` };
    if (formData.has("active")) {
      patch.active = formData.get("active") === "true";
      result = patch.active ? { success: `${label} reativada.` } : { success: `${label} inativada.`, tone: "neutral" };
    }
    if (formData.has("name")) {
      const name = readName(formData, kind);
      if (!name.success) return { error: name.error.issues[0]?.message };
      patch.name = name.data;
      result = { success: `“${name.data}” salva.` };
    }
    const { error } = await supabase.from(CATALOG_KINDS[kind].table).update(patch).eq("id", id).eq("group_id", groupId);
    if (error) return { error: catalogErrorMessage(error, CATALOG_KINDS[kind].singular) };
    revalidate();
    return result;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar." };
  }
}
