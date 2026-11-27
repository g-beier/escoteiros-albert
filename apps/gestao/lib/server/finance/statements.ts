import type { Db } from "@/lib/server/db";
import { one, rows, rpc } from "@/lib/server/pg/db";
import type { ImportProfile } from "@/app/(financeiro)/financeiro/extrato/importar/actions";

export type RecentImport = {
  id: string;
  file_name: string;
  imported_at: string;
  period_from: string;
  period_to: string;
  line_count: number;
  duplicate_count: number;
  profile_name: string | null;
};

/** Importações mais recentes de uma conta, para a lista em `/financeiro/extrato/importar`. */
export async function fetchRecentImports(db: Db, groupId: string, accountId: string, limit = 10) {
  try {
    return {
      rows: await rows<RecentImport>(
        db,
        (sql) => sql`
      select i.id, i.file_name, i.imported_at, i.period_from, i.period_to, i.line_count, i.duplicate_count, p.name as profile_name
      from public.statement_imports i left join public.import_profiles p on p.id = i.profile_id
      where i.group_id = ${groupId} and i.account_id = ${accountId}
      order by i.imported_at desc limit ${limit}`,
      ),
    };
  } catch (error) {
    return { rows: [] as RecentImport[], error: (error as Error).message };
  }
}

/** Perfil usado na última importação de cada conta: a leitura fica lembrada por banco/conta. */
export async function fetchLastProfileByAccount(db: Db, groupId: string) {
  const data = await rows<{ account_id: string; profile_id: string }>(
    db,
    (sql) => sql`
    select account_id, profile_id from public.statement_imports
    where group_id = ${groupId} and profile_id is not null order by imported_at desc limit 500`,
  );
  const last: Record<string, string> = {};
  for (const row of data) last[row.account_id] ??= row.profile_id;
  return last;
}

/** Perfis de importação do grupo, mais recentes primeiro. */
export async function fetchImportProfiles(db: Db, groupId: string) {
  try {
    return {
      profiles: await rows<ImportProfile>(
        db,
        (sql) => sql`
      select id, name, format, header_signature, settings, updated_at from public.import_profiles
      where group_id = ${groupId} order by updated_at desc`,
      ),
    };
  } catch (error) {
    return { profiles: [] as ImportProfile[], error: (error as Error).message };
  }
}

export type StatementLine = {
  id: string;
  account_id: string;
  line_date: string;
  description: string;
  kind: string | null;
  counterparty: string | null;
  amount_cents: number;
  status: string;
  trn_type: string | null;
};

/** Uma linha do extrato ("Criar lançamento" na conciliação preenche o formulário com ela). */
export async function statementLine(db: Db, id: string): Promise<StatementLine | null> {
  return one<StatementLine>(
    db,
    (sql) => sql`
    select id, account_id, line_date, description, kind, counterparty, amount_cents, status, trn_type from public.statement_lines where id = ${id}`,
  );
}

/** Contas que recebem extrato (ativas, menos caixa). */
export async function importAccounts(db: Db, groupId: string) {
  return rows<{ id: string; name: string; bank: string | null }>(
    db,
    (sql) => sql`
    select id, name, bank from public.accounts where group_id = ${groupId} and active and kind <> 'caixa' order by name`,
  );
}

export type ProfileInput = {
  id?: string | null;
  name: string;
  format: string;
  headerSignature?: string | null;
  settings: Record<string, unknown>;
};

/** Cria (sem `id`) ou atualiza um perfil de leitura; devolve o id. */
export async function saveProfile(db: Db, groupId: string, input: ProfileInput): Promise<string> {
  return (await rpc(db, "save_import_profile", {
    p_group_id: groupId,
    p_profile_id: input.id ?? null,
    p_name: input.name,
    p_format: input.format,
    p_header_signature: input.headerSignature || null,
    p_settings: input.settings as never,
  })) as string;
}

export type ImportInput = {
  accountId: string;
  profileId?: string | null;
  profileSettings?: Record<string, unknown> | null;
  fileName: string;
  periodFrom?: string | null;
  periodTo?: string | null;
  openingBalanceCents?: number | null;
  closingBalanceCents?: number | null;
  lines: unknown[];
};

/** Grava as linhas como abertas (duplicatas puladas pelo banco); devolve a resposta crua de import_statement_lines. */
export async function importLines(db: Db, input: ImportInput): Promise<unknown> {
  return rpc(db, "import_statement_lines", {
    p_account_id: input.accountId,
    p_profile_id: input.profileId ?? null,
    p_profile_settings: (input.profileSettings ?? null) as never,
    p_file_name: input.fileName,
    p_period_from: input.periodFrom ?? null,
    p_period_to: input.periodTo ?? null,
    p_opening_balance_cents: input.openingBalanceCents ?? null,
    p_closing_balance_cents: input.closingBalanceCents ?? null,
    p_lines: input.lines as never,
  });
}

/** Conferência antes de importar (nada é gravado): resposta crua de preview_statement_lines. */
export async function previewLines(
  db: Db,
  accountId: string,
  periodFrom: string | null,
  periodTo: string | null,
  lines: unknown[],
): Promise<unknown> {
  return rpc(db, "preview_statement_lines", {
    p_account_id: accountId,
    p_period_from: periodFrom,
    p_period_to: periodTo,
    p_lines: lines as never,
  });
}

/** Desfaz uma importação: apaga as linhas e os vínculos de conciliação delas. */
export async function deleteImport(db: Db, importId: string): Promise<{ lines: number; unlinked: number }> {
  const data = ((await rpc(db, "delete_statement_import", { p_import_id: importId })) ?? {}) as {
    lines?: number;
    unlinked?: number;
  };
  return { lines: Number(data.lines ?? 0), unlinked: Number(data.unlinked ?? 0) };
}

/** Saldo da conta no sistema no começo de `date` (resposta crua de account_balance_before). */
export async function balanceBefore(db: Db, accountId: string, date: string): Promise<unknown> {
  return rpc(db, "account_balance_before", { p_account_id: accountId, p_date: date });
}
