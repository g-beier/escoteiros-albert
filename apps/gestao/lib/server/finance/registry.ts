import type { AccountItem } from "@/components/finance/accounts-manager";
import type { Catalogs } from "@/components/finance/entries/entry-form";
import type { AccountInput } from "@/lib/finance/accounts";
import { toAccountRpc } from "@/lib/finance/accounts";
import type { CategoryItem } from "@/lib/finance/categories";
import type { ProfileImport } from "@/lib/finance/import-flow";
import type { Db } from "@/lib/server/db";
import { rowsOf, rpc, untyped } from "@/lib/server/supabase/db";

// Cadastros do Financeiro: contas, formas de pagamento, rubricas e perfis de leitura. Escritas pelas funções
// SQL auditadas (014, 026, 036); leituras com o número de usos de cada item.

/** Cadastros usados pelo formulário de lançamento e pelos filtros (inclui os inativos, para os lançamentos antigos). */
export async function entryCatalogs(db: Db, groupId: string): Promise<Catalogs> {
  const supabase = untyped(db);
  const [categories, paymentMethods, associates, accounts] = await Promise.all([
    supabase.from("categories").select("id, name, active, code, kind, parent_id").eq("group_id", groupId).then(rowsOf),
    supabase.from("payment_methods").select("id, name, active, default_account_id").eq("group_id", groupId).order("name").then(rowsOf),
    supabase.from("associates").select("id, name, active").eq("group_id", groupId).order("name").then(rowsOf),
    supabase.from("accounts").select("id, name, active").eq("group_id", groupId).order("name").then(rowsOf),
  ]);
  return { categories: categories as Catalogs["categories"], paymentMethods, associates, accounts } as Catalogs;
}

export type CategoryWithUsage = CategoryItem & { ledger_code: string | null; usage: number };
export type PaymentMethodItem = { id: string; name: string; active: boolean; usage: number; defaultAccountId: string | null };

type Usage = { usage: { count: number }[] | null };
const usageOf = (row: Usage) => row.usage?.[0]?.count ?? 0;

/** Configurações: rubricas, formas de pagamento e contas, cada uma com quantos lançamentos ou rateios a usam. */
export async function settingsCatalogs(db: Db, groupId: string) {
  const supabase = untyped(db);
  const [categories, paymentMethods, accounts] = await Promise.all([
    supabase.from("categories").select("id, name, active, code, kind, parent_id, ledger_code, usage:entry_splits(count)").eq("group_id", groupId).then(rowsOf),
    supabase.from("payment_methods").select("id, name, active, default_account_id, usage:ledger_entries(count)").eq("group_id", groupId)
      .order("active", { ascending: false }).order("name").then(rowsOf),
    supabase.from("accounts").select("id, name, kind, bank, branch, number, opening_balance_cents, opening_date, active, ledger_code, usage:ledger_entries(count)")
      .eq("group_id", groupId).order("active", { ascending: false }).order("name").then(rowsOf),
  ]);
  return {
    categories: (categories as (Omit<CategoryWithUsage, "usage"> & Usage)[]).map((row) => ({ ...row, usage: usageOf(row) })) as CategoryWithUsage[],
    paymentMethods: (paymentMethods as ({ id: string; name: string; active: boolean; default_account_id: string | null } & Usage)[])
      .map((row): PaymentMethodItem => ({ id: row.id, name: row.name, active: row.active, usage: usageOf(row), defaultAccountId: row.default_account_id })),
    accounts: (accounts as (Omit<AccountItem, "usage"> & Usage)[]).map((row) => ({ ...row, usage: usageOf(row) })) as AccountItem[],
  };
}

/** Importações com perfil: em quais contas cada perfil de leitura foi usado. */
export async function profileImports(db: Db, groupId: string): Promise<ProfileImport[]> {
  return rowsOf(await untyped(db).from("statement_imports").select("profile_id, account_id, imported_at").eq("group_id", groupId).not("profile_id", "is", null)) as ProfileImport[];
}

// Formas de pagamento

export async function createPaymentMethod(db: Db, groupId: string, name: string) {
  await rpc(db, "create_payment_method", { p_group_id: groupId, p_name: name });
}
export async function renamePaymentMethod(db: Db, id: string, name: string) {
  await rpc(db, "update_payment_method", { p_payment_method_id: id, p_name: name });
}
export async function setPaymentMethodActive(db: Db, id: string, active: boolean) {
  await rpc(db, "set_payment_method_active", { p_payment_method_id: id, p_active: active });
}
/** Conta sugerida nos lançamentos da forma de pagamento (`null` remove). */
export async function setPaymentMethodDefaultAccount(db: Db, id: string, accountId: string | null) {
  await rpc(db, "set_payment_method_default_account", { p_payment_method_id: id, p_account_id: accountId });
}

// Contas

export async function createAccount(db: Db, groupId: string, input: AccountInput) {
  await rpc(db, "create_account", { p_group_id: groupId, ...toAccountRpc(input) });
}
export async function updateAccount(db: Db, id: string, input: AccountInput) {
  await rpc(db, "update_account", { p_account_id: id, ...toAccountRpc(input) });
}
export async function setAccountActive(db: Db, id: string, active: boolean) {
  await rpc(db, "set_account_active", { p_account_id: id, p_active: active });
}

// Rubricas: a árvore inteira (rascunho da tela) numa chamada.

export type CategoryTreeNode = { key: string; id: string | null; parent: string; position: number; name: string; ledgerCode: string | null; active: boolean };

/** Grava a árvore; devolve quantos rateios (e de quantos lançamentos) mudaram de rubrica por exclusões. */
export async function saveCategoryTree(db: Db, groupId: string, nodes: CategoryTreeNode[], deleted: { id: string; target: string | null }[]) {
  const data = await rpc(db, "save_category_tree", { p_group_id: groupId, p_nodes: nodes, p_deleted: deleted });
  const { splits = 0, entries = 0 } = (data ?? {}) as { splits?: number; entries?: number };
  return { splits, entries };
}

// Perfis de leitura do extrato

export async function renameImportProfile(db: Db, id: string, name: string) {
  await rpc(db, "rename_import_profile", { p_profile_id: id, p_name: name });
}
export async function deleteImportProfile(db: Db, id: string) {
  await rpc(db, "delete_import_profile", { p_profile_id: id });
}
