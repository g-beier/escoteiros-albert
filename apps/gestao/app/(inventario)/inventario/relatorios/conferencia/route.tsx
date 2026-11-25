import type { ReactElement } from "react";
import type { NextRequest } from "next/server";
import type { DocumentProps } from "@react-pdf/renderer";
import { CountSheetReport } from "@/components/inventory/reports/count-sheet-report";
import { reportFilename } from "@/lib/associates/reports";
import { todayISO } from "@/lib/associates/model";
import { errorResponse } from "@/lib/finance/export/route-helpers";
import { COUNT_SHEET_TITLE, type CountSheet } from "@/lib/inventory/report";
import * as locations from "@/lib/server/inventory/locations";
import { countSheetData } from "@/lib/server/inventory/report";
import { pdfResponse, renderReport } from "@/lib/server/reports";
import { inventoryReaderOrError } from "@/lib/server/session";

const countSheetDocument = (sheet: CountSheet, issuedOn: string) =>
  <CountSheetReport sheet={sheet} title={COUNT_SHEET_TITLE} footerName={COUNT_SHEET_TITLE} issuedOn={issuedOn} /> as ReactElement<DocumentProps>;

/**
 * GET /inventario/relatorios/conferencia[?divisao=<id>][&baixar=1]: folha de conferência em PDF (A4, layout comum
 * de components/reports/). Sem divisão: todas, cada raiz em página nova; com divisão: ela e as de dentro. Quem vê o
 * Inventário (é leitura, sob RLS). Abre no navegador; `baixar=1` baixa o arquivo.
 */
export async function GET(request: NextRequest) {
  const member = await inventoryReaderOrError();
  if ("error" in member) return errorResponse(member.error, 403);
  const params = request.nextUrl.searchParams;
  const divisao = params.get("divisao") || undefined;
  const issuedOn = todayISO();
  try {
    const scope = divisao ? (await locations.listPaths(member.db, member.groupId)).find((row) => row.id === divisao) : undefined;
    if (divisao && !scope) return errorResponse("Divisão não encontrada.", 404);
    const sheet = await countSheetData(member.db, member.groupId, scope?.id);
    const pdf = await renderReport(countSheetDocument(sheet, issuedOn));
    const filename = reportFilename({ number: null, title: scope ? `${COUNT_SHEET_TITLE} ${scope.name}` : COUNT_SHEET_TITLE }, issuedOn);
    return pdfResponse(pdf, filename, params.get("baixar") === "1");
  } catch (error) {
    console.error("conferência do inventário", error);
    return errorResponse("Não foi possível gerar o relatório.", 500);
  }
}
