import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDoc13 } from "@/lib/associates/doc13";
import { doc10Input, largeDoc10Input } from "@/lib/associates/doc10.fixture";
import { reportBySlug, reportFooterName } from "@/lib/associates/reports";
import { renderReport } from "@/lib/server/reports";
import { Doc13Report } from "./doc13-report";

// Fumaça do Doc 13 com nomes fictícios. REPORT_OUT=/caminho/pasta/prefixo grava os PDFs (<prefixo>-doc13-…).

const withBirths = <T extends { associates: { id: string; branch: string }[] }>(input: T): T => {
  const base: Record<string, number> = { filhote: 2021, lobinho: 2017, escoteiro: 2013, senior: 2010, pioneiro: 2006 };
  return {
    ...input,
    associates: input.associates.map((a, i) => ({
      ...a,
      birth_date: base[a.branch] ? `${base[a.branch] - (i % 4)}-${String((i % 12) + 1).padStart(2, "0")}-10` : null,
    })),
  };
};
const render = async (input: Parameters<typeof buildDoc13>[0], name: string) => {
  const report = reportBySlug("doc-13")!;
  const pdf = await renderReport(
    <Doc13Report
      doc={buildDoc13(input)}
      title={report.title}
      footerName={reportFooterName(report)}
      issuedOn="2026-11-20"
    />,
  );
  if (process.env.REPORT_OUT) writeFileSync(`${process.env.REPORT_OUT}-${name}.pdf`, pdf);
  return pdf.toString("latin1");
};
const pages = (text: string) => text.match(/\/Type \/Page\b/g)?.length ?? 0;

describe("Doc 13 em PDF", () => {
  it("pequeno: uma página", async () => {
    const text = await render(withBirths(doc10Input), "doc13-pequeno");
    expect(text.startsWith("%PDF")).toBe(true);
    expect(pages(text)).toBe(1);
  }, 30_000);

  it("grande: seções inteiras em poucas páginas", async () => {
    expect(pages(await render(withBirths(largeDoc10Input()), "doc13-grande"))).toBeLessThanOrEqual(3);
  }, 30_000);
});
