import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDoc10 } from "@/lib/associates/doc10";
import { doc10Input, largeDoc10Input } from "@/lib/associates/doc10.fixture";
import { reportBySlug, reportFooterName } from "@/lib/associates/reports";
import { renderReport } from "@/lib/server/reports";
import { Doc10Report } from "./doc10-report";

// Fumaça do Doc 10 com nomes fictícios: PDF A4 com a Outfit. REPORT_OUT=/caminho/pasta/prefixo grava os PDFs (<prefixo>-doc10-…) para conferir.

const render = async (input: Parameters<typeof buildDoc10>[0], name: string) => {
  const report = reportBySlug("doc-10")!;
  const pdf = await renderReport(<Doc10Report doc={buildDoc10(input)} title={report.title} footerName={reportFooterName(report)} issuedOn="2026-11-20" />);
  if (process.env.REPORT_OUT) writeFileSync(`${process.env.REPORT_OUT}-${name}.pdf`, pdf);
  return pdf.toString("latin1");
};
const pages = (text: string) => text.match(/\/Type \/Page\b/g)?.length ?? 0;

describe("Doc 10 em PDF", () => {
  it("gera A4 com a Outfit", async () => {
    const text = await render(doc10Input, "doc10-pequeno");
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text).toMatch(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/);
    expect(text).toContain("Outfit");
    expect(pages(text)).toBeGreaterThanOrEqual(2); // parte 2 começa em página nova
  }, 30_000);

  it("grupo grande: um bloco por página no máximo", async () => {
    const text = await render(largeDoc10Input(), "doc10-grande");
    // 4 seções + totais (parte 1) e 4 seções de responsáveis (parte 2), cada uma cabendo numa página
    expect(pages(text)).toBeLessThanOrEqual(10);
  }, 30_000);
});
