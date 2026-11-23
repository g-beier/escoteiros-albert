import type { ReactElement } from "react";
import type { NextRequest } from "next/server";
import type { DocumentProps } from "@react-pdf/renderer";
import { Doc10Report } from "@/components/associates/reports/doc10-report";
import { Doc13Report } from "@/components/associates/reports/doc13-report";
import { Doc14Report } from "@/components/associates/reports/doc14-report";
import { reportBySlug, reportFilename, reportFooterName, type ReportInfo } from "@/lib/associates/reports";
import { todayISO } from "@/lib/associates/model";
import { errorResponse } from "@/lib/finance/export/route-helpers";
import type { Db } from "@/lib/server/db";
import * as reports from "@/lib/server/associates/reports";
import { pdfResponse, renderReport } from "@/lib/server/reports";
import { associatesReaderOrError } from "@/lib/server/session";

type Context = { db: Db; groupId: string; report: ReportInfo; issuedOn: string };
type Builder = (context: Context) => Promise<ReactElement<DocumentProps>>;

/** Montador de cada relatório (slug do catálogo `REPORTS`). */
const BUILDERS: Record<string, Builder> = {
  "doc-10": async ({ db, groupId, report, issuedOn }) =>
    <Doc10Report doc={await reports.doc10(db, groupId, issuedOn)} title={report.title} footerName={reportFooterName(report)} issuedOn={issuedOn} /> as ReactElement<DocumentProps>,
  "doc-13": async ({ db, groupId, report, issuedOn }) =>
    <Doc13Report doc={await reports.doc13(db, groupId, issuedOn)} title={report.title} footerName={reportFooterName(report)} issuedOn={issuedOn} /> as ReactElement<DocumentProps>,
  "doc-14": async ({ db, groupId, report, issuedOn }) =>
    <Doc14Report doc={await reports.doc14(db, groupId, issuedOn)} title={report.title} footerName={reportFooterName(report)} issuedOn={issuedOn} /> as ReactElement<DocumentProps>,
};

/**
 * GET /associados/relatorios/<relatorio>[?baixar=1]: o relatório em PDF (A4, layout comum de components/reports/).
 * Qualquer membro do grupo (é leitura, sob RLS). Abre no navegador; `baixar=1` baixa o arquivo.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ relatorio: string }> }) {
  const report = reportBySlug((await params).relatorio);
  const build = report && BUILDERS[report.slug];
  if (!report || !build) return errorResponse("Relatório não encontrado.", 404);
  const member = await associatesReaderOrError();
  if ("error" in member) return errorResponse(member.error, 403);

  const issuedOn = todayISO();
  try {
    const pdf = await renderReport(await build({ db: member.db, groupId: member.groupId, report, issuedOn }));
    return pdfResponse(pdf, reportFilename(report, issuedOn), request.nextUrl.searchParams.get("baixar") === "1");
  } catch (error) {
    console.error("relatório", report.slug, error);
    return errorResponse("Não foi possível gerar o relatório.", 500);
  }
}
