import type { NextRequest } from "next/server";
import { LEDGER_EXPORT_COLUMNS, SPLIT_EXPORT_COLUMNS } from "@/lib/export/columns";
import { encodeCsv, isCsvEncoding, toCsv } from "@/lib/export/csv";
import { ExportTooLargeError, fetchAllLedgerRows, fetchAllSplitRows } from "@/lib/export/queries";
import { periodBounds } from "@/lib/export/period";
import { csvResponse, errorResponse, exportContext, xlsxResponse } from "@/lib/export/route-helpers";
import { ledgerWorkbook, splitWorkbook } from "@/lib/export/xlsx";

/**
 * GET /exportar/fluxo?visao=lancamentos|rubricas&de=AAAA-MM-DD&ate=AAAA-MM-DD[&formato=xlsx|csv&codificacao=utf-8|windows-1252]
 * (limites inclusivos). XLSX formatado com totais, ou CSV com as mesmas colunas.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const byCategory = params.get("visao") === "rubricas";
  const csv = params.get("formato") === "csv";
  const encoding = isCsvEncoding(params.get("codificacao")) ? params.get("codificacao") as "utf-8" | "windows-1252" : "utf-8";
  const period = periodBounds({ kind: "personalizado", from: params.get("de") ?? "", to: params.get("ate") ?? "" });
  if (!period) return errorResponse("Período inválido: informe datas válidas, com início antes do fim.");

  const context = await exportContext();
  if (context.error) return context.error;
  const name = `fluxo-${byCategory ? "rubricas" : "lancamentos"}_${period.from}_${period.to}`;
  try {
    if (byCategory) {
      const rows = await fetchAllSplitRows(context.supabase, context.groupId, period);
      return csv
        ? csvResponse(encodeCsv(toCsv(SPLIT_EXPORT_COLUMNS, rows), encoding), `${name}.csv`, encoding)
        : xlsxResponse(await splitWorkbook(rows, period), `${name}.xlsx`);
    }
    const rows = await fetchAllLedgerRows(context.supabase, context.groupId, period);
    return csv
      ? csvResponse(encodeCsv(toCsv(LEDGER_EXPORT_COLUMNS, rows), encoding), `${name}.csv`, encoding)
      : xlsxResponse(await ledgerWorkbook(rows, period), `${name}.xlsx`);
  } catch (error) {
    if (error instanceof ExportTooLargeError) return errorResponse(error.message, 413);
    console.error("export fluxo", error);
    return errorResponse("Não foi possível gerar o arquivo.", 500);
  }
}
