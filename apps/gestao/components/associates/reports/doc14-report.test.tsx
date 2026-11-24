import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildDoc14 } from "@/lib/associates/doc14";
import { doc10Input, largeDoc10Input } from "@/lib/associates/doc10.fixture";
import { reportBySlug, reportFooterName } from "@/lib/associates/reports";
import { renderReport } from "@/lib/server/reports";
import { Doc14Report } from "./doc14-report";

// Fumaça do Doc 14 com nomes fictícios. REPORT_OUT=/caminho/prefixo grava os PDFs para conferir.

const render = async (input: Parameters<typeof buildDoc14>[0], name: string) => {
  const report = reportBySlug("doc-14a")!;
  const pdf = await renderReport(<Doc14Report doc={buildDoc14(input)} title={report.title} footerName={reportFooterName(report)} issuedOn="2026-11-20" />);
  if (process.env.REPORT_OUT) writeFileSync(`${process.env.REPORT_OUT}-${name}.pdf`, pdf);
  return pdf.toString("latin1");
};
const pages = (text: string) => text.match(/\/Type \/Page\b/g)?.length ?? 0;

// datas espalhadas pelos meses, metade sem promessa
const dated = <T extends { associates: { id: string }[] }>(input: T, every = 1) => ({
  ...input,
  associates: input.associates.map((a, i) => ({ ...a, promise_date: i % (every + 1) === every ? null : `20${String(10 + (i % 15)).padStart(2, "0")}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}` })),
});

describe("Doc 14 em PDF", () => {
  it("meses na primeira página e sem promessa na seguinte", async () => {
    const text = await render(dated(doc10Input) as typeof doc10Input, "doc14-pequeno");
    expect(text.startsWith("%PDF")).toBe(true);
    expect(pages(text)).toBe(2);
  }, 30_000);

  it("grupo grande: meses sem quebra, em poucas páginas", async () => {
    const text = await render(dated(largeDoc10Input(), 5) as ReturnType<typeof largeDoc10Input>, "doc14-grande");
    expect(pages(text)).toBeLessThanOrEqual(4);
  }, 30_000);
});
