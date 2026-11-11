import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: { environment: "node", coverage: { include: ["lib/**/*.ts"] } },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
