// Gera lib/server/pg/schema.ts a partir do catálogo do banco local (DATABASE_ADMIN_URL de .env.local): funções
// (nomes e tipos dos argumentos para `rpc()`), linhas de tabelas e visões e enums do schema public.
// Rode depois de criar ou mudar uma migration: `npm run db:types --workspace=@geas/gestao`.
import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.DATABASE_ADMIN_URL;
if (!url) throw new Error("DATABASE_ADMIN_URL ausente: rode `npm run infra:start`.");
const target = resolve(root, "lib/server/pg/schema.ts");

const SCALARS = {
  bool: "boolean",
  int2: "number", int4: "number", int8: "number", float4: "number", float8: "number", numeric: "number", oid: "number",
  json: "Json", jsonb: "Json",
  void: "undefined",
};

const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
  const enums = await sql`
    select t.typname as name, array_agg(e.enumlabel order by e.enumsortorder) as labels
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' group by t.typname order by t.typname`;

  const types = new Map((await sql`
    select t.oid, t.typname, t.typtype, t.typelem, t.typrelid, n.nspname
    from pg_type t join pg_namespace n on n.oid = t.typnamespace`).map((t) => [Number(t.oid), t]));

  const tsType = (oid) => {
    const t = types.get(Number(oid));
    if (!t) return "unknown";
    if (t.typname.startsWith("_") && t.typelem) return `${wrap(tsType(t.typelem))}[]`;
    if (t.typtype === "e" && t.nspname === "public") return `Enums["${t.typname}"]`;
    if (t.typtype === "d") return "unknown";
    if (SCALARS[t.typname]) return SCALARS[t.typname];
    if (t.typtype === "c") return t.nspname === "public" ? `Tables["${t.typname}"]` : "Record<string, unknown>";
    if (t.typname === "record") return "Record<string, unknown>";
    return "string";
  };
  const wrap = (type) => (type.includes("|") ? `(${type})` : type);

  const relations = await sql`
    select c.relname as name, c.relkind as kind,
      json_agg(json_build_object('name', a.attname, 'type', a.atttypid, 'notnull', a.attnotnull) order by a.attnum) as columns
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'p')
    group by c.relname, c.relkind order by c.relname`;

  const functions = await sql`
    select p.proname as name, p.proretset as set, p.prorettype as returns, p.pronargs as nargs, p.pronargdefaults as ndefaults,
      p.proargtypes::oid[] as in_types, coalesce(p.proallargtypes, p.proargtypes::oid[]) as all_types,
      coalesce(p.proargnames, '{}') as names, p.proargmodes::text[] as modes
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
      and p.prorettype <> 'trigger'::regtype
    order by p.proname, p.oid`;

  const out = [];
  out.push("// Gerado por scripts/db-types.mjs a partir do banco local; não edite à mão (`npm run db:types`).");
  out.push("/* eslint-disable */");
  out.push("export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];");
  out.push("");
  out.push("export type Enums = {");
  for (const e of enums) out.push(`  ${e.name}: ${e.labels.map((l) => JSON.stringify(l)).join(" | ")};`);
  out.push("};");
  out.push("");
  out.push("/** Linhas das tabelas e visões do schema public (colunas de visão sempre anuláveis). */");
  out.push("export type Tables = {");
  for (const r of relations) {
    out.push(`  ${r.name}: {`);
    for (const c of r.columns) {
      const nullable = r.kind === "v" || !c.notnull;
      out.push(`    ${c.name}: ${tsType(c.type)}${nullable ? " | null" : ""};`);
    }
    out.push("  };");
  }
  out.push("};");
  out.push("");
  out.push("/** Funções SQL chamáveis por `rpc()`: argumentos (os com padrão são opcionais) e retorno como o `rpc` entrega. */");
  out.push("export type Functions = {");
  const byName = new Map();
  for (const f of functions) byName.set(f.name, [...(byName.get(f.name) ?? []), f]);
  for (const [name, overloads] of byName) {
    const variants = overloads.map((f) => {
      const modes = f.modes ?? f.all_types.map(() => "i");
      const args = [];
      const outs = [];
      let inIndex = 0;
      f.all_types.forEach((type, i) => {
        const mode = modes[i];
        const argName = f.names[i];
        if (mode === "i" || mode === "b" || mode === "v") {
          const optional = inIndex >= f.nargs - f.ndefaults;
          if (argName) args.push(`${argName}${optional ? "?" : ""}: ${tsType(type)}`);
          inIndex++;
        }
        if (mode === "o" || mode === "b" || mode === "t") outs.push(`${argName}: ${tsType(type)}`);
      });
      let returns;
      if (outs.length) returns = `{ ${outs.join("; ")} }`;
      else returns = tsType(f.returns);
      if (f.set) returns = `${wrap(returns)}[]`;
      else if (outs.length) returns = `${returns} | null`;
      return { args: args.length ? `{ ${args.join("; ")} }` : "Record<string, never>", returns };
    });
    const args = [...new Set(variants.map((v) => v.args))].join(" | ");
    out.push(`  ${name}: { Args: ${args}; Returns: ${variants[0].returns} };`);
  }
  out.push("};");
  out.push("");
  writeFileSync(target, out.join("\n"));
  console.log(`Tipos gravados em ${target} (${relations.length} tabelas/visões, ${byName.size} funções).`);
} finally {
  await sql.end();
}
