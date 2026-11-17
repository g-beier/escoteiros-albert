import type { Db } from "@/lib/server/db";
import { rpc, untyped, unwrap } from "@/lib/server/supabase/db";
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

type RecentImportRow = Omit<RecentImport, "profile_name"> & { profile: { name: string } | { name: string }[] | null };

/** Importações mais recentes de uma conta, para a lista em `/financeiro/extrato/importar`. */
export async function fetchRecentImports(db: Db, groupId: string, accountId: string, limit = 10) {
  const supabase = untyped(db);
  const { data, error } = await supabase.from("statement_imports")
    .select("id, file_name, imported_at, period_from, period_to, line_count, duplicate_count, profile:import_profiles(name)")
    .eq("group_id", groupId).eq("account_id", accountId)
    .order("imported_at", { ascending: false }).limit(limit);
  const rows = ((data ?? []) as unknown as RecentImportRow[]).map(({ profile, ...row }) => ({
    ...row,
    profile_name: (Array.isArray(profile) ? profile[0]?.name : profile?.name) ?? null,
  }));
  return { rows, error: error?.message };
}

/** Perfil usado na última importação de cada conta: a leitura fica lembrada por banco/conta. */
export async function fetchLastProfileByAccount(db: Db, groupId: string) {
  const supabase = untyped(db);
  const { data } = await supabase.from("statement_imports").select("account_id, profile_id")
    .eq("group_id", groupId).not("profile_id", "is", null).order("imported_at", { ascending: false }).limit(500);
  const last: Record<string, string> = {};
  for (const row of (data ?? []) as { account_id: string; profile_id: string }[]) last[row.account_id] ??= row.profile_id;
  return last;
}

/** Perfis de importação do grupo, mais recentes primeiro. */
export async function fetchImportProfiles(db: Db, groupId: string) {
  const supabase = untyped(db);
  const { data, error } = await supabase.from("import_profiles")
    .select("id, name, format, header_signature, settings, updated_at")
    .eq("group_id", groupId).order("updated_at", { ascending: false });
  return { profiles: (data ?? []) as ImportProfile[], error: error?.message };
}

export type StatementLine = { id: string; account_id: string; line_date: string; description: string; kind: string | null; counterparty: string | null; amount_cents: number; status: string; trn_type: string | null };

/** Uma linha do extrato ("Criar lançamento" na conciliação preenche o formulário com ela). */
export async function statementLine(db: Db, id: string): Promise<StatementLine | null> {
  return unwrap(await untyped(db).from("statement_lines")
    .select("id, account_id, line_date, description, kind, counterparty, amount_cents, status, trn_type").eq("id", id).maybeSingle()) as StatementLine | null;
}

/** Contas que recebem extrato (ativas, menos caixa). */
export async function importAccounts(db: Db, groupId: string) {
  return (unwrap(await untyped(db).from("accounts").select("id, name, bank").eq("group_id", groupId).eq("active", true).neq("kind", "caixa").order("name")) ?? []) as
    { id: string; name: string; bank: string | null }[];
}

export type ProfileInput = { id?: string | null; name: string; format: string; headerSignature?: string | null; settings: Record<string, unknown> };

/** Cria (sem `id`) ou atualiza um perfil de leitura; devolve o id. */
export async function saveProfile(db: Db, groupId: string, input: ProfileInput): Promise<string> {
  return await rpc(db, "save_import_profile", {
    p_group_id: groupId, p_profile_id: input.id ?? null, p_name: input.name, p_format: input.format,
    p_header_signature: input.headerSignature || null, p_settings: input.settings as never,
  }) as string;
}

export type ImportInput = {
  accountId: string; profileId?: string | null; profileSettings?: Record<string, unknown> | null; fileName: string;
  periodFrom?: string | null; periodTo?: string | null; openingBalanceCents?: number | null; closingBalanceCents?: number | null; lines: unknown[];
};

/** Grava as linhas como abertas (duplicatas puladas pelo banco); devolve a resposta crua de import_statement_lines. */
export async function importLines(db: Db, input: ImportInput): Promise<unknown> {
  return rpc(db, "import_statement_lines", {
    p_account_id: input.accountId, p_profile_id: input.profileId ?? null, p_profile_settings: (input.profileSettings ?? null) as never,
    p_file_name: input.fileName, p_period_from: input.periodFrom ?? null, p_period_to: input.periodTo ?? null,
    p_opening_balance_cents: input.openingBalanceCents ?? null, p_closing_balance_cents: input.closingBalanceCents ?? null, p_lines: input.lines as never,
  });
}

/** Conferência antes de importar (nada é gravado): resposta crua de preview_statement_lines. */
export async function previewLines(db: Db, accountId: string, periodFrom: string | null, periodTo: string | null, lines: unknown[]): Promise<unknown> {
  return rpc(db, "preview_statement_lines", { p_account_id: accountId, p_period_from: periodFrom, p_period_to: periodTo, p_lines: lines as never });
}

/** Desfaz uma importação: apaga as linhas e os vínculos de conciliação delas. */
export async function deleteImport(db: Db, importId: string): Promise<{ lines: number; unlinked: number }> {
  const data = (await rpc(db, "delete_statement_import", { p_import_id: importId }) ?? {}) as { lines?: number; unlinked?: number };
  return { lines: Number(data.lines ?? 0), unlinked: Number(data.unlinked ?? 0) };
}

/** Saldo da conta no sistema no começo de `date` (resposta crua de account_balance_before). */
export async function balanceBefore(db: Db, accountId: string, date: string): Promise<unknown> {
  return rpc(db, "account_balance_before", { p_account_id: accountId, p_date: date });
}
