import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Camada de dados (docs/consolidacao-gestao.md, seção 4): só lib/server/** fala com o banco e o storage. Fora dela,
// nada do driver Postgres, do SDK do Azure nem do adaptador lib/server/pg; telas e actions usam lib/server/<módulo>.
// E links só pelo Link de @geas/ui, que não faz prefetch (next/link faz uma requisição por link visível).
const dataLayer = (severity) => [
  severity,
  {
    paths: [
      { name: "postgres", message: "Postgres só em lib/server/pg: use as funções de lib/server/<módulo>." },
      { name: "next/link", message: 'Use `import { Link } from "@geas/ui/components/link"` (sem prefetch).' },
    ],
    patterns: [
      { group: ["@azure/*"], message: "Azure só em lib/server: use as funções de lib/server/<módulo>." },
      {
        group: ["@/lib/server/pg/*"],
        message: "Adaptador do banco: use as funções de lib/server/<módulo> com member.db.",
      },
    ],
  },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["**/*.{ts,tsx,mts}"], rules: { "no-restricted-imports": dataLayer("error") } },
  { files: ["lib/server/**", "e2e/**", "scripts/**"], rules: { "no-restricted-imports": "off" } },
  globalIgnores([".next/**", "next-env.d.ts", "playwright-report/**", "test-results/**", "lib/server/pg/schema.ts"]),
]);
