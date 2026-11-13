import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Pacote de componentes, sem diretório pages/.
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
  globalIgnores(["node_modules/**"]),
]);
