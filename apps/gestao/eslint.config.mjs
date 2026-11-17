import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Camada de dados (docs/consolidacao-gestao.md, seção 4): só lib/server/** fala com o Supabase. Fora dela, nada de
// @supabase/* nem do adaptador lib/server/supabase; telas e actions usam lib/server/<módulo> com `member.db`.
const dataLayer = (severity) => [severity, {
  patterns: [
    { group: ["@supabase/*"], message: "Supabase só em lib/server/supabase: use as funções de lib/server/<módulo>." },
    { group: ["@/lib/server/supabase/*"], message: "Adaptador do banco: use as funções de lib/server/<módulo> com member.db." },
  ],
}];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["**/*.{ts,tsx,mts}"], rules: { "no-restricted-imports": dataLayer("error") } },
  { files: ["lib/server/**", "e2e/**", "scripts/**"], rules: { "no-restricted-imports": "off" } },
  globalIgnores([".next/**", "next-env.d.ts", "playwright-report/**", "test-results/**", "lib/server/supabase/database.types.ts"]),
]);
