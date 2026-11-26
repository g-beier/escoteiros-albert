import type { Fragment, PendingQuery, Row, TransactionSql } from "postgres";
import { DataError, type Db } from "@/lib/server/db";
import { pool } from "./client";
import type { Functions } from "./schema";

// Implementação Postgres do `Db`. Cada chamada abre uma transação curta, troca de papel e só então consulta:
//   usuário  → `authenticated` + `request.jwt.claims` com o id (RLS e `auth.uid()` das funções auditadas);
//   login    → `geas_auth` (só as tabelas de auth; lib/server/auth.ts);
//   dono     → o papel da própria conexão, sem troca (scripts de manutenção, nunca o app).
// Os módulos de lib/server/<módulo> montam o SQL com `sql` (parâmetros sempre ligados, nunca concatenados).

type Access = { kind: "user"; userId: string } | { kind: "auth" } | { kind: "owner" };

const access = (db: Db) => db as unknown as Access;

/** Banco como o usuário logado: tudo passa pela RLS e pelas funções auditadas. */
export const userDb = (userId: string): Db => ({ kind: "user", userId }) as unknown as Db;
/** Banco para login e sessões (schema auth). Só lib/server/auth.ts. */
export const authDb = (): Db => ({ kind: "auth" }) as unknown as Db;
/** Banco com o papel da conexão (scripts com DATABASE_ADMIN_URL). Nunca no app. */
export const ownerDb = (): Db => ({ kind: "owner" }) as unknown as Db;

export type Tx = TransactionSql;
export type { Fragment };

function toDataError(error: unknown): Error {
  if (error instanceof DataError) return error;
  const pg = error as { name?: string; message?: string; code?: string };
  if (pg?.name === "PostgresError") return new DataError(pg.message ?? "Erro no banco de dados.", pg.code);
  if (pg?.code === "ECONNREFUSED" || pg?.code === "CONNECT_TIMEOUT") return new DataError("Banco de dados indisponível. Tente de novo em instantes.", pg.code);
  return error instanceof Error ? error : new Error(String(error));
}

/** Executa `work` numa transação com o papel do `db`; erros do banco viram `DataError` com a mensagem do SQL. */
export async function run<T>(db: Db, work: (sql: Tx) => Promise<T> | T): Promise<T> {
  const who = access(db);
  try {
    return await pool().begin(async (sql) => {
      if (who.kind === "user") {
        await sql`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${JSON.stringify({ sub: who.userId, role: "authenticated" })}, true)`;
      } else if (who.kind === "auth") {
        await sql`select set_config('role', 'geas_auth', true)`;
      }
      return await work(sql);
    }) as T;
  } catch (error) {
    throw toDataError(error);
  }
}

type Query = PendingQuery<readonly Row[]>;

/** Linhas de uma consulta (array comum, pronto para ir a um componente cliente). */
export async function rows<T>(db: Db, build: (sql: Tx) => Query): Promise<T[]> {
  return run(db, async (sql) => [...(await build(sql))] as T[]);
}

/** Primeira linha da consulta, ou `null`. */
export async function one<T>(db: Db, build: (sql: Tx) => Query): Promise<T | null> {
  return run(db, async (sql) => ((await build(sql))[0] as T | undefined) ?? null);
}

/** Valor da primeira coluna da primeira linha (ex.: `select count(*) ...`). */
export async function value<T>(db: Db, build: (sql: Tx) => Query): Promise<T | null> {
  const row = await one<Record<string, T>>(db, build);
  return row ? (Object.values(row)[0] ?? null) : null;
}

/** `select count(*) ...` como número. */
export async function count(db: Db, build: (sql: Tx) => Query): Promise<number> {
  return Number((await value<number>(db, build)) ?? 0);
}

/** `where` montado de condições opcionais (as falsas ficam de fora). */
export function where(sql: Tx, conditions: (Fragment | Query | false | null | undefined | "" | 0)[]): Fragment {
  const list = conditions.filter(Boolean) as Fragment[];
  return list.length ? sql`where ${sql`and`.join(list)}` : sql``;
}

// Funções SQL ------------------------------------------------------------------------------------------

type Overload = {
  set: boolean; returnKind: "void" | "scalar" | "row"; nargs: number; ndefaults: number;
  inArgs: { name: string; type: string }[];
};

const catalog = new Map<string, Promise<Overload[]>>();

/** Assinaturas de uma função de public, lidas do catálogo uma vez por processo. */
function overloads(name: string): Promise<Overload[]> {
  let found = catalog.get(name);
  if (!found) {
    found = pool()`
      select p.proretset as set, p.pronargs as nargs, p.pronargdefaults as ndefaults, coalesce(p.proargnames, '{}') as names,
        coalesce(p.proargmodes::text[], array_fill('i'::text, array[p.pronargs])) as modes,
        array(select format_type(t, null) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality u(t, i) order by i) as types,
        rt.typtype as ret_typtype, rt.typname as ret_name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type rt on rt.oid = p.prorettype
      where n.nspname = 'public' and p.proname = ${name} and p.prokind = 'f'`.then((list) => list.map((row) => {
      const modes = row.modes as string[];
      const names = row.names as string[];
      const types = row.types as string[];
      const inArgs = types.flatMap((type, i) => (["i", "b", "v"].includes(modes[i]) ? [{ name: names[i], type }] : []));
      const hasOut = modes.some((mode) => mode === "o" || mode === "b" || mode === "t");
      const returnKind = row.ret_name === "void" ? "void" : hasOut || row.ret_typtype === "c" || row.ret_name === "record" ? "row" : "scalar";
      return { set: row.set as boolean, returnKind, nargs: row.nargs as number, ndefaults: row.ndefaults as number, inArgs } satisfies Overload;
    }));
    found.catch(() => catalog.delete(name));
    catalog.set(name, found);
  }
  return found;
}

function pick(name: string, list: Overload[], given: string[]): Overload {
  const match = list.find((overload) => {
    const names = overload.inArgs.map((arg) => arg.name);
    const required = names.slice(0, overload.nargs - overload.ndefaults);
    return given.every((arg) => names.includes(arg)) && required.every((arg) => given.includes(arg));
  });
  if (!match) throw new DataError(`Função ${name}(${given.join(", ")}) não encontrada no banco.`);
  return match;
}

/** O gerador não marca parâmetros anuláveis; as funções SQL aceitam `null` (= não informado). */
type Nullable<T> = { [K in keyof T]: T[K] | null };

/**
 * Chama uma função SQL auditada com argumentos nomeados (nomes e tipos conferidos por lib/server/pg/schema.ts) e
 * devolve o resultado como o PostgREST devolvia: valor (escalar), objeto (registro), lista (`setof`/`table`) ou nulo.
 * Argumentos `undefined` ficam de fora (vale o padrão da função).
 */
export async function rpc<F extends keyof Functions & string>(db: Db, fn: F, args: Nullable<Functions[F]["Args"]>): Promise<Functions[F]["Returns"]> {
  const entries = Object.entries(args as Record<string, unknown>).filter(([, value]) => value !== undefined);
  if (![fn, ...entries.map(([name]) => name)].every((name) => /^[a-z_][a-z0-9_]*$/.test(name))) throw new DataError(`Nome inválido em ${fn}.`);
  const given = entries.map(([name]) => name);
  let signature: Overload;
  try {
    signature = pick(fn, await overloads(fn), given);
  } catch {
    // O catálogo fica em cache no processo: depois de uma migration que muda a assinatura (com o servidor de pé, como
    // no desenvolvimento), consulta o banco de novo uma vez antes de desistir.
    catalog.delete(fn);
    signature = pick(fn, await overloads(fn), given);
  }
  const typeOf = new Map(signature.inArgs.map((arg) => [arg.name, arg.type]));
  // nomes e tipos vêm do catálogo (conferidos acima); os valores vão como parâmetros
  const list = entries.map(([name], i) => `${name} => $${i + 1}::${typeOf.get(name)}`).join(", ");
  const call = `public.${fn}(${list})`;
  const text = signature.returnKind === "scalar" && !signature.set ? `select ${call} as result` : `select * from ${call}`;
  const result = await run(db, (sql) => sql.unsafe(text, entries.map(([, value]) => value as never), { prepare: true }));
  if (signature.returnKind === "void") return null as Functions[F]["Returns"];
  if (signature.set) return (signature.returnKind === "scalar" ? result.map((row) => row[fn]) : [...result]) as Functions[F]["Returns"];
  if (signature.returnKind === "row") return (result[0] ?? null) as Functions[F]["Returns"];
  return (result[0]?.result ?? null) as Functions[F]["Returns"];
}
