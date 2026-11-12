import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { DB_CONTAINER, E2E_ACCOUNTS, E2E_ADMIN_EMAIL, E2E_GROUP_NAME, E2E_PREFIX, SUPABASE_SECRET_KEY, SUPABASE_URL } from "./env";

/** SQL como postgres no banco local (docker exec + psql). Só para preparar e limpar o grupo E2E. */
export function psql(sql: string): string {
  return execFileSync("docker", ["exec", "-i", DB_CONTAINER, "psql", "-U", "postgres", "-tAq", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    encoding: "utf8",
  }).trim();
}

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

export function adminClient() {
  if (!SUPABASE_SECRET_KEY) throw new Error("SUPABASE_SECRET_KEY ausente: rode `npm run infra:env` (gera apps/financeiro/.env.local).");
  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function findUser(email: string) {
  const { data, error } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email === email) ?? null;
}

/**
 * Garante o administrador E2E (Auth), o grupo E2E (admin_bootstrap_group) e as contas usadas nos testes.
 * Idempotente: roda a cada execução e só cria o que falta.
 */
export async function ensureE2eGroup() {
  const admin = adminClient();
  const existing = await findUser(E2E_ADMIN_EMAIL);
  if (!existing) {
    const { error } = await admin.auth.admin.createUser({ email: E2E_ADMIN_EMAIL, email_confirm: true });
    if (error) throw error;
  } else if (existing.banned_until) {
    await admin.auth.admin.updateUserById(existing.id, { ban_duration: "none" });
  }
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
 * deixou para trás no grupo E2E: importações de extrato, perfis de leitura e lançamentos com o prefixo E2E.
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
    select public.delete_ledger_entry(e.id) from public.ledger_entries e where e.name like ${literal(`${E2E_PREFIX} %`)};
    commit;
  `);
}

/** Remove de vez usuários convidados pelos testes (Auth), com qualquer vínculo que tenha sobrado. */
export async function deleteUsers(emails: string[]) {
  const admin = adminClient();
  for (const email of emails) {
    const user = await findUser(email);
    if (user) {
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
    }
  }
}
