import { execFileSync } from "node:child_process";
import { DB_COMPOSE, E2E_ACCOUNTS, E2E_ADMIN_EMAIL, E2E_GROUP_NAME, E2E_PREFIX } from "./env";

/** SQL como postgres no banco local (psql dentro do container `db`). Só para preparar e limpar o grupo E2E. */
export function psql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "compose",
      "-f",
      DB_COMPOSE,
      "exec",
      "-T",
      "db",
      "psql",
      "-U",
      "postgres",
      "-d",
      "geas",
      "-tAq",
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: sql,
      encoding: "utf8",
    },
  ).trim();
}

export const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Cadastro em auth.users (id, bloqueio), ou nulo. */
export function findUser(email: string): { id: string; banned: boolean } | null {
  const row = psql(
    `select id || '|' || (coalesce(banned_until > now(), false))::text from auth.users where email = ${literal(email)};`,
  );
  if (!row) return null;
  const [id, banned] = row.split("|");
  return { id, banned: banned === "true" };
}

/** Cadastra (ou desbloqueia) o e-mail em auth.users, como o administrador faria em Usuários. */
export function ensureUser(email: string) {
  psql(
    `insert into auth.users(email) values (${literal(email)}) on conflict (email) do update set banned_until = null;`,
  );
}

/**
 * Garante o administrador E2E (auth.users), o grupo E2E (admin_bootstrap_group) e as contas usadas nos testes.
 * Idempotente: roda a cada execução e só cria o que falta.
 */
export async function ensureE2eGroup() {
  ensureUser(E2E_ADMIN_EMAIL);
  const email = literal(E2E_ADMIN_EMAIL);
  psql(`
    do $$ begin
      if not exists (select 1 from public.memberships m join auth.users u on u.id = m.user_id where u.email = ${email}) then
        perform public.admin_bootstrap_group(${email}, ${literal(E2E_GROUP_NAME)});
      end if;
    end $$;
    insert into public.accounts(group_id, name, kind)
    select m.group_id, a.name, 'corrente' from public.memberships m join auth.users u on u.id = m.user_id
      cross join unnest(array[${E2E_ACCOUNTS.map(literal).join(", ")}]) as a(name)
    where u.email = ${email}
    on conflict (group_id, name) do nothing;
  `);
}

/**
 * Rede de segurança: como o administrador E2E e pelas funções auditadas, desfaz o que algum teste interrompido
 * deixou para trás no grupo E2E: importações de extrato, perfis de leitura, dívidas e lançamentos com o prefixo E2E.
 * A RLS limita tudo ao grupo E2E (é o único grupo desse usuário).
 */
export function cleanupE2eGroup() {
  psql(`
    begin;
    select set_config('request.jwt.claims', json_build_object('sub', u.id, 'role', 'authenticated')::text, true)
      from auth.users u where u.email = ${literal(E2E_ADMIN_EMAIL)};
    set local role authenticated;
    select public.delete_statement_import(i.id) from public.statement_imports i;
    select public.delete_import_profile(p.id) from public.import_profiles p;
    -- primeiro os lançamentos que pagam dívidas (023), depois as dívidas sem pagamento, depois o resto
    select public.delete_ledger_entry(e.id) from public.ledger_entries e where e.name like ${literal(`${E2E_PREFIX} %`)}
      and exists (select 1 from public.entry_splits s where s.entry_id = e.id and s.debt_id is not null);
    select public.delete_debt(d.id) from public.debts d where d.description like ${literal(`${E2E_PREFIX} %`)} and d.fee_record_id is null and d.origin_entry_id is null;
    select public.delete_ledger_entry(e.id) from public.ledger_entries e where e.name like ${literal(`${E2E_PREFIX} %`)};
    commit;
    -- associados das medições (e2e/perf/mensalidades.perf.ts); não há função de exclusão de associado
    delete from public.associates a using public.memberships m join auth.users u on u.id = m.user_id
      where u.email = ${literal(E2E_ADMIN_EMAIL)} and a.group_id = m.group_id and a.name like ${literal(`${E2E_PREFIX} Perf %`)};
  `);
}

/** Remove de vez pessoas cadastradas pelos testes (os vínculos e sessões saem em cascata). */
export async function deleteUsers(emails: string[]) {
  if (emails.length) psql(`delete from auth.users where email in (${emails.map(literal).join(", ")});`);
}
