"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireEditor } from "@/lib/session";
import { CATALOG_KINDS, isCatalogKind, type CatalogKind } from "@/lib/catalogs";
import { parseLedgerCode } from "@/lib/ledger-code";
import { readAccountForm, toAccountRpc } from "@/lib/accounts";

export type CatalogFormState = { error?: string; success?: string; tone?: "success" | "neutral" };

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

// Rubricas e formas de pagamento ---------------------------------------------------
// Escritas pelas funções SQL de 014_accounting.sql (validadas e auditadas), como as contas.

export async function createCatalogItem(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  try {
    const kind = readKind(formData);
    const name = readName(formData, kind);
    if (!name.success) return { error: name.error.issues[0]?.message };
    const { supabase, groupId } = await requireEditor("Sem permissão para alterar cadastros.");
    if (kind === "payment_methods") {
      const { error } = await supabase.rpc("create_payment_method", { p_group_id: groupId, p_name: name.data });
      if (error) return { error: error.message };
      revalidate();
      return { success: `“${name.data}” cadastrada.` };
    }
    const code = z.string().trim().regex(/^[12](\.[0-9]{1,3}){1,4}$/, "Informe o código da rubrica, ex.: 2.5.6 (comece com 1 para receita ou 2 para despesa).").safeParse(formData.get("code") ?? "");
    if (!code.success) return { error: code.error.issues[0]?.message };
    const ledgerCode = parseLedgerCode(formData.get("ledgerCode"));
    if (!ledgerCode.ok) return { error: ledgerCode.error };
    const { error } = await supabase.rpc("create_category", { p_group_id: groupId, p_code: code.data, p_name: name.data, p_ledger_code: ledgerCode.value });
    if (error) return { error: error.message };
    revalidate();
    return { success: `“${code.data} ${name.data}” cadastrada.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível cadastrar." };
  }
}

/** Ativa/inativa (campo `active`) ou salva nome e, nas rubricas, a conta contábil. */
export async function updateCatalogItem(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  try {
    const kind = readKind(formData);
    const id = z.uuid().parse(formData.get("id"));
    const { supabase } = await requireEditor("Sem permissão para alterar cadastros.");
    const { singular } = CATALOG_KINDS[kind];
    const label = singular.charAt(0).toUpperCase() + singular.slice(1);
    if (formData.has("active")) {
      const active = formData.get("active") === "true";
      const { error } = kind === "categories"
        ? await supabase.rpc("set_category_active", { p_category_id: id, p_active: active })
        : await supabase.rpc("set_payment_method_active", { p_payment_method_id: id, p_active: active });
      if (error) return { error: error.message };
      revalidate();
      return active ? { success: `${label} reativada.` } : { success: `${label} inativada.`, tone: "neutral" };
    }
    const name = readName(formData, kind);
    if (!name.success) return { error: name.error.issues[0]?.message };
    if (kind === "payment_methods") {
      const { error } = await supabase.rpc("update_payment_method", { p_payment_method_id: id, p_name: name.data });
      if (error) return { error: error.message };
    } else {
      const ledgerCode = parseLedgerCode(formData.get("ledgerCode"));
      if (!ledgerCode.ok) return { error: ledgerCode.error };
      const { error } = await supabase.rpc("update_category", { p_category_id: id, p_name: name.data, p_ledger_code: ledgerCode.value });
      if (error) return { error: error.message };
    }
    revalidate();
    return { success: `“${name.data}” salva.` };
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
    const { supabase, groupId } = await requireEditor("Sem permissão para alterar cadastros.");
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
    const { supabase } = await requireEditor("Sem permissão para alterar cadastros.");
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
    const { supabase } = await requireEditor("Sem permissão para alterar cadastros.");
    const { error } = await supabase.rpc("set_account_active", { p_account_id: id.data, p_active: active });
    if (error) return { error: error.message };
    revalidate();
    return active ? { success: "Conta reativada." } : { success: "Conta inativada.", tone: "neutral" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível alterar a conta." };
  }
}

// Perfis de leitura do extrato -------------------------------------------------------
// Escritos por rename_import_profile/delete_import_profile (026, validadas e auditadas).

export async function renameImportProfile(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  try {
    const id = z.uuid().safeParse(formData.get("id"));
    if (!id.success) return { error: "Perfil inválido." };
    const name = z.string().trim().min(2, "Informe um nome de perfil com ao menos 2 caracteres.").max(80, "Use até 80 caracteres.").safeParse(formData.get("name") ?? "");
    if (!name.success) return { error: name.error.issues[0]?.message };
    const { supabase } = await requireEditor("Sem permissão para alterar perfis de leitura.");
    const { error } = await supabase.rpc("rename_import_profile", { p_profile_id: id.data, p_name: name.data });
    if (error) return { error: error.message };
    revalidate();
    return { success: `Perfil “${name.data}” salvo.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível renomear o perfil." };
  }
}

export async function deleteImportProfile(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  try {
    const id = z.uuid().safeParse(formData.get("id"));
    if (!id.success) return { error: "Perfil inválido." };
    const { supabase } = await requireEditor("Sem permissão para alterar perfis de leitura.");
    const { error } = await supabase.rpc("delete_import_profile", { p_profile_id: id.data });
    if (error) return { error: error.message };
    revalidate();
    return { success: "Perfil excluído. As importações feitas com ele continuam.", tone: "neutral" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível excluir o perfil." };
  }
}

/** Conta padrão da forma de pagamento; `accountId` vazio remove o padrão. */
export async function setPaymentMethodDefaultAccount(paymentMethodId: unknown, accountId: unknown): Promise<CatalogFormState> {
  try {
    const method = z.uuid().safeParse(paymentMethodId);
    const account = z.union([z.uuid(), z.literal("")]).safeParse(accountId);
    if (!method.success || !account.success) return { error: "Dados inválidos." };
    const { supabase } = await requireEditor("Sem permissão para alterar cadastros.");
    const { error } = await supabase.rpc("set_payment_method_default_account", { p_payment_method_id: method.data, p_account_id: account.data || null });
    if (error) return { error: error.message };
    revalidate();
    return account.data ? { success: "Conta padrão salva." } : { success: "Conta padrão removida.", tone: "neutral" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar a conta padrão." };
  }
}
