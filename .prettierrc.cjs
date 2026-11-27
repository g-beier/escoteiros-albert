/**
 * Prettier for apps/gestao and packages/ui (apps/institucional has its own config).
 * Also used by the pre-commit hook (lint-staged) and by editors on save.
 * @type {import('prettier').Config}
 */
module.exports = {
  printWidth: 120,
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "all",
  useTabs: false,

  plugins: [require.resolve("prettier-plugin-tailwindcss")],
  tailwindFunctions: ["cn", "cva"],
  tailwindStylesheet: "./apps/gestao/app/globals.css",
};
