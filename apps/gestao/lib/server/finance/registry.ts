import type { AccountItem } from "@/components/finance/accounts-manager";
import type { Catalogs } from "@/components/finance/entries/entry-form";
import type { AccountInput } from "@/lib/finance/accounts";
import { toAccountRpc } from "@/lib/finance/accounts";
import type { CategoryItem } from "@/lib/finance/categories";
import type { ProfileImport } from "@/lib/finance/import-flow";
import type { Db } from "@/lib/server/db";
import { openDebts } from "@/lib/server/finance/debts";
import { rows, rpc, run } from "@/lib/server/pg/db";

// Cadastros do Financeiro: contas, formas de pagamento, rubricas e perfis de leitura. Escritas pelas funções
// SQL auditadas (014, 026, 036); leituras com o número de usos de cada item.

/** Cadastros usados pelo formulário de lançamento e pelos filtros (inclui os inativos, para os lançamentos antigos). */
export async function entryCatalogs(db: Db, groupId: string): Promise<Catalogs> {
  return run(db, async (sql) => {
    const [categories, paymentMethods, associates, accounts, saleLots] = await Promise.all([
      sql`select id, name, active, code, kind, parent_id, sells_items from public.categories where group_id = ${groupId}`,
      sql`select id, name, active, default_account_id from public.payment_methods where group_id = ${groupId} order by name`,
      sql`select id, name, active from public.associates where group_id = ${groupId} order by name`,
      sql`select id, name, active from public.accounts where group_id = ${groupId} order by name`,
      // Lojinha (021): lotes à venda, legíveis por quem lê o Financeiro mesmo sem acesso ao Inventário
      sql`select id, material_id, material_name, variant, location_path, for_sale, sale_price_cents::int as sale_price_cents, quantity
          from public.finance_sale_lots(${groupId})`,
    ]);
    return {
      categories: [...categories],
      paymentMethods: [...paymentMethods],
      associates: [...associates],
      accounts: [...accounts],
      saleLots: [...saleLots],
    } as unknown as Catalogs;
  }).then(async (catalogs) => ({ ...catalogs, openDebts: await openDebts(db, groupId) }));
}

export type CategoryWithUsage = CategoryItem & { ledger_code: string | null; usage: number };
export type PaymentMethodItem = {
  id: string;
  name: string;
  active: boolean;
  usage: number;
  defaultAccountId: string | null;
};

/** Configurações: rubricas, formas de pagamento e contas, cada uma com quantos lançamentos ou rateios a usam. */
export async function settingsCatalogs(db: Db, groupId: string) {
  return run(db, async (sql) => {
    const [categories, paymentMethods, accounts] = await Promise.all([
      sql`select c.id, c.name, c.active, c.code, c.kind, c.parent_id, c.ledger_code, c.sells_items, c.transfer,
            (select count(*) from public.entry_splits s where s.category_id = c.id) as usage
          from public.categories c where c.group_id = ${groupId}`,
      sql`select p.id, p.name, p.active, p.default_account_id,
            (select count(*) from public.ledger_entries e where e.payment_method_id = p.id) as usage
          from public.payment_methods p where p.group_id = ${groupId} order by p.active desc, p.name`,
      sql`select a.id, a.name, a.kind, a.bank, a.branch, a.number, a.opening_balance_cents, a.opening_date, a.active, a.ledger_code,
            (select count(*) from public.ledger_entries e where e.account_id = a.id) as usage
          from public.accounts a where a.group_id = ${groupId} order by a.active desc, a.name`,
    ]);
    return {
      categories: [...categories] as unknown as CategoryWithUsage[],
      paymentMethods: paymentMethods.map((row): PaymentMethodItem => ({
        id: row.id,
        name: row.name,
        active: row.active,
        usage: Number(row.usage),
        defaultAccountId: row.default_account_id,
      })),
      accounts: [...accounts] as unknown as AccountItem[],
    };
  });
}

/** Importações com perfil: em quais contas cada perfil de leitura foi usado. */
export async function profileImports(db: Db, groupId: string): Promise<ProfileImport[]> {
  return rows<ProfileImport>(
    db,
    (sql) => sql`
    select profile_id, account_id, imported_at from public.statement_imports where group_id = ${groupId} and profile_id is not null`,
  );
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

export type CategoryTreeNode = {
  key: string;
  id: string | null;
  parent: string;
  position: number;
  name: string;
  ledgerCode: string | null;
  active: boolean;
  /** Marcada "venda de itens" (Lojinha, 019). */
  sellsItems: boolean;
};

/** Grava a árvore; devolve quantos rateios (e de quantos lançamentos) mudaram de rubrica por exclusões. */
export async function saveCategoryTree(
  db: Db,
  groupId: string,
  nodes: CategoryTreeNode[],
  deleted: { id: string; target: string | null }[],
) {
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
