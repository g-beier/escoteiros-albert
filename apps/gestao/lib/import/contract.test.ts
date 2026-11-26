import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FILES } from "@/lib/import/contract";
import { contractMarkdown, DOC_END, DOC_START } from "@/lib/import/contract-doc";
import { normalizeText } from "@/lib/text";

describe("contrato de importação", () => {
  it("docs/importacao.md está em dia com lib/import/contract.ts (npm run import:doc)", () => {
    const doc = fs.readFileSync(path.join(__dirname, "..", "..", "docs", "importacao.md"), "utf8");
    const block = doc.slice(doc.indexOf(DOC_START), doc.indexOf(DOC_END) + DOC_END.length);
    expect(block).toBe(contractMarkdown());
  });

  it.each(FILES.map((spec) => [spec.file, spec] as const))("%s: nomes de coluna únicos e exemplo coerente", (_, spec) => {
    const names = spec.columns.flatMap((column) => [...new Set([column.header, ...(column.aliases ?? [])].map(normalizeText))]);
    expect(new Set(names).size).toBe(names.length);
    for (const row of spec.example.rows) expect(row).toHaveLength(spec.example.header.length);
    const fixed = spec.example.header.filter((header) => names.includes(normalizeText(header)));
    expect(fixed).toHaveLength(spec.columns.length);
  });
});
