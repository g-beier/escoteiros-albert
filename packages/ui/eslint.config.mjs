import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Pacote de componentes, sem diretório pages/.
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
  // Links só pelo Link do pacote (sem prefetch).
  {
    ignores: ["src/components/link.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "next/link", message: "Use @geas/ui/components/link (sem prefetch)." }] },
      ],
    },
  },
  globalIgnores(["node_modules/**"]),
]);
