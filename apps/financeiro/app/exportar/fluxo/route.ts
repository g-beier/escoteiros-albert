import type { NextRequest } from "next/server";
import { ExportTooLargeError, fetchAllSplitRows, fetchAllStatementRows } from "@/lib/export/queries";
import { periodBounds } from "@/lib/export/period";
import { errorResponse, exportContext, xlsxResponse } from "@/lib/export/route-helpers";
import { splitWorkbook, statementWorkbook } from "@/lib/export/xlsx";

/** GET /exportar/fluxo?visao=extrato|rubricas&de=AAAA-MM-DD&ate=AAAA-MM-DD (limites inclusivos). */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const view = params.get("visao") === "rubricas" ? "rubricas" : "extrato";
  const period = periodBounds({ kind: "personalizado", from: params.get("de") ?? "", to: params.get("ate") ?? "" });
  if (!period) return errorResponse("Período inválido: informe datas válidas, com início antes do fim.");

  const context = await exportContext();
  if (context.error) return context.error;
  try {
    const buffer = view === "rubricas"
      ? await splitWorkbook(await fetchAllSplitRows(context.supabase, context.groupId, period), period)
      : await statementWorkbook(await fetchAllStatementRows(context.supabase, context.groupId, period), period);
    return xlsxResponse(buffer, `fluxo-${view === "rubricas" ? "rubricas" : "extrato"}_${period.from}_${period.to}.xlsx`);
  } catch (error) {
    if (error instanceof ExportTooLargeError) return errorResponse(error.message, 413);
    console.error("export fluxo", error);
    return errorResponse("Não foi possível gerar a planilha.", 500);
  }
}
