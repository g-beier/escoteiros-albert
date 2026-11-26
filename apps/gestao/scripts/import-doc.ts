// Regera as tabelas do contrato de importação em docs/importacao.md a partir de lib/import/contract.ts.
// Uso: npm run import:doc --workspace=@geas/gestao
import fs from "node:fs";
import path from "node:path";
import { replaceContractBlock } from "@/lib/import/contract-doc";

const file = path.join(import.meta.dirname, "..", "docs", "importacao.md");
fs.writeFileSync(file, replaceContractBlock(fs.readFileSync(file, "utf8")));
console.log(`Atualizado: ${path.relative(process.cwd(), file)}`);
