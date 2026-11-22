import postgres, { type Sql } from "postgres";

// Conexão com o Postgres (local: Docker; produção: Azure Database for PostgreSQL). Só lib/server/pg usa isto.
// DATABASE_URL é o papel de login do app (NOINHERIT): sozinho não lê nada; cada transação troca para
// `authenticated` (com os claims do usuário) ou `geas_auth` (login), em lib/server/pg/db.ts.

/** "2026-11-21 17:33:53.97-03" → "2026-11-21T17:33:53.97-03:00" (ISO, como o PostgREST entregava). */
const isoTimestamp = (value: string) => value.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00");

const TYPES = {
  // datas e horários como texto (yyyy-mm-dd / ISO), sem Date: as telas comparam e formatam strings
  date: { to: 1082, from: [1082], serialize: (value: string) => value, parse: (value: string) => value },
  timestamp: { to: 1184, from: [1114, 1184], serialize: (value: string) => value, parse: isoTimestamp },
  // bigint (centavos, contagens) e numeric como número: os valores do grupo cabem com folga em 2^53
  int8: { to: 20, from: [20, 1700], serialize: (value: number) => String(value), parse: Number },
};

export function connectionOptions() {
  return {
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idle_timeout: 60,
    connect_timeout: 15,
    onnotice: () => {},
    types: TYPES,
    connection: { application_name: "gestao" },
  };
}

const globalPool = globalThis as unknown as { geasSql?: Sql };

/** Pool único por processo (no `next dev`, sobrevive ao recarregamento dos módulos). */
export function pool(url = process.env.DATABASE_URL): Sql {
  if (globalPool.geasSql) return globalPool.geasSql;
  if (!url) throw new Error("DATABASE_URL não configurada. Em desenvolvimento, rode `npm run infra:start` para gerar o .env.local.");
  globalPool.geasSql = postgres(url, connectionOptions()) as unknown as Sql;
  return globalPool.geasSql;
}
