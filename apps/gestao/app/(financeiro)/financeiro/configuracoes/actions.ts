"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireFinanceEditor } from "@/lib/session";
import { CATALOG_KINDS, isCatalogKind, type CatalogKind } from "@/lib/finance/catalogs";
import { parseLedgerCode } from "@/lib/finance/ledger-code";
import { readAccountForm, toAccountRpc } from "@/lib/finance/accounts";

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
  revalidatePath("/financeiro/configuracoes", "layout");
  revalidatePath("/", "layout");
}

// Formas de pagamento -------------------------------------------------------------
// Escritas pelas funções SQL de 014_accounting.sql (validadas e auditadas), como as contas.

export async function createCatalogItem(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  try {
    const kind = readKind(formData);
    const name = readName(formData, kind);
    if (!name.success) return { error: name.error.issues[0]?.message };
    const { supabase, groupId } = await requireFinanceEditor("Sem permissão para alterar cadastros.");
    const { error } = await supabase.rpc("create_payment_method", { p_group_id: groupId, p_name: name.data });
    if (error) return { error: error.message };
    revalidate();
    return { success: `“${name.data}” cadastrada.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível cadastrar." };
  }
}

/** Ativa/inativa (campo `active`) ou renomeia. */
export async function updateCatalogItem(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  try {
    const kind = readKind(formData);
    const id = z.uuid().parse(formData.get("id"));
    const { supabase } = await requireFinanceEditor("Sem permissão para alterar cadastros.");
    if (formData.has("active")) {
      const active = formData.get("active") === "true";
      const { error } = await supabase.rpc("set_payment_method_active", { p_payment_method_id: id, p_active: active });
      if (error) return { error: error.message };
      revalidate();
      return active ? { success: "Forma de pagamento reativada." } : { success: "Forma de pagamento inativada.", tone: "neutral" };
    }
    const name = readName(formData, kind);
    if (!name.success) return { error: name.error.issues[0]?.message };
    const { error } = await supabase.rpc("update_payment_method", { p_payment_method_id: id, p_name: name.data });
    if (error) return { error: error.message };
    revalidate();
    return { success: `“${name.data}” salva.` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar." };
  }
}

// Rubricas ----------------------------------------------------------------------
// A tela edita a árvore como rascunho (lib/category-draft.ts) e grava tudo de uma vez: save_category_tree (036).

const treeSchema = z.object({
  nodes: z.array(z.object({
    key: z.string().min(1).max(64), id: z.uuid().nullable(), parent: z.string().min(1).max(64),
    position: z.number().int().min(0), name: z.string().trim().min(2, "Toda rubrica precisa de um nome com ao menos 2 caracteres.").max(100),
    ledgerCode: z.string().nullable(), active: z.boolean(),
  })).max(2000),
  deleted: z.array(z.object({ id: z.uuid(), target: z.string().max(64).nullable() })).max(2000),
});

export async function saveCategoryTree(payload: unknown): Promise<CatalogFormState> {
  try {
    const parsed = treeSchema.safeParse(payload);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
    for (const node of parsed.data.nodes) {
      const ledgerCode = parseLedgerCode(node.ledgerCode);
      if (!ledgerCode.ok) return { error: `“${node.name}”: ${ledgerCode.error}` };
    }
    const { supabase, groupId } = await requireFinanceEditor("Sem permissão para alterar cadastros.");
    const { data, error } = await supabase.rpc("save_category_tree", { p_group_id: groupId, p_nodes: parsed.data.nodes, p_deleted: parsed.data.deleted });
    if (error) return { error: error.message };
    revalidate();
    const { splits = 0, entries = 0 } = (data ?? {}) as { splits?: number; entries?: number };
    return { success: splits
      ? `Rubricas salvas. ${plural(splits, "rateio", "rateios")} de ${plural(entries, "lançamento", "lançamentos")} ${splits === 1 ? "mudou" : "mudaram"} de rubrica.`
      : "Rubricas salvas." };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar as rubricas." };
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

// Contas ------------------------------------------------------------------------
// Escritas pelas funções SQL create_account/update_account/set_account_active (validadas e auditadas).

export async function createAccount(_previous: CatalogFormState, formData: FormData): Promise<CatalogFormState> {
  try {
    const parsed = readAccountForm(formData);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message };
    const { supabase, groupId } = await requireFinanceEditor("Sem permissão para alterar cadastros.");
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
    const { supabase } = await requireFinanceEditor("Sem permissão para alterar cadastros.");
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
    const { supabase } = await requireFinanceEditor("Sem permissão para alterar cadastros.");
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
    const { supabase } = await requireFinanceEditor("Sem permissão para alterar perfis de leitura.");
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
    const { supabase } = await requireFinanceEditor("Sem permissão para alterar perfis de leitura.");
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
    const { supabase } = await requireFinanceEditor("Sem permissão para alterar cadastros.");
    const { error } = await supabase.rpc("set_payment_method_default_account", { p_payment_method_id: method.data, p_account_id: account.data || null });
    if (error) return { error: error.message };
    revalidate();
    return account.data ? { success: "Conta padrão salva." } : { success: "Conta padrão removida.", tone: "neutral" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Não foi possível salvar a conta padrão." };
  }
}
