"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { canManageEntries } from "@/lib/auth";
import { CATALOG_KINDS, catalogErrorMessage, isCatalogKind, type CatalogKind } from "@/lib/catalogs";
import { readAccountForm, toAccountRpc } from "@/lib/accounts";

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

// Contas ------------------------------------------------------------------------
// Escritas pelas funções SQL create_account/update_account/set_account_active (validadas e auditadas).

export async function createAccount(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  try {
    const parsed = readAccountForm(formData);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    const { supabase, groupId } = await requireEditor();
    const { error } = await supabase.rpc("create_account", { p_group_id: groupId, ...toAccountRpc(parsed.data) });
    if (error) return { error: error.message };
    revalidate();
    return { success: `Conta “${parsed.data.name}” cadastrada.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível cadastrar a conta." };
  }
}

export async function updateAccount(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  try {
    const id = z.uuid().safeParse(formData.get("id"));
    if (!id.success) return { error: "Conta inválida." };
    const parsed = readAccountForm(formData);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    const { supabase } = await requireEditor();
    const { error } = await supabase.rpc("update_account", { p_account_id: id.data, ...toAccountRpc(parsed.data) });
    if (error) return { error: error.message };
    revalidate();
    return { success: `Conta “${parsed.data.name}” salva.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar a conta." };
  }
}

export async function setAccountActive(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  try {
    const id = z.uuid().safeParse(formData.get("id"));
    if (!id.success) return { error: "Conta inválida." };
    const active = formData.get("active") === "true";
    const { supabase } = await requireEditor();
    const { error } = await supabase.rpc("set_account_active", { p_account_id: id.data, p_active: active });
    if (error) return { error: error.message };
    revalidate();
    return active ? { success: "Conta reativada." } : { success: "Conta inativada.", tone: "neutral" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível alterar a conta." };
  }
}

/** Conta padrão da forma de pagamento; `accountId` vazio remove o padrão. */
export async function setPaymentMethodDefaultAccount(paymentMethodId: unknown, accountId: unknown): Promise<CatalogFormState> {
  try {
    const method = z.uuid().safeParse(paymentMethodId);
    const account = z.union([z.uuid(), z.literal("")]).safeParse(accountId);
    if (!method.success || !account.success) return { error: "Dados inválidos." };
    const { supabase } = await requireEditor();
    const { error } = await supabase.rpc("set_payment_method_default_account", { p_payment_method_id: method.data, p_account_id: account.data || null });
    if (error) return { error: error.message };
    revalidate();
    return account.data ? { success: "Conta padrão salva." } : { success: "Conta padrão removida.", tone: "neutral" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar a conta padrão." };
  }
}
