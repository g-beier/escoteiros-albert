import type { NextRequest } from "next/server";
import { z } from "zod";
import { ACCOUNTING_COLUMNS, missingLedgerCodes, toAccountingRows } from "@/lib/export/accounting";
import { encodeCsv, isCsvEncoding, toCsv, type CsvEncoding } from "@/lib/export/csv";
import { ExportTooLargeError, fetchAllSplitRows } from "@/lib/export/queries";
import { periodBounds } from "@/lib/export/period";
import { csvResponse, errorResponse, exportContext } from "@/lib/export/route-helpers";

/**
 * GET /exportar/contabil?de=AAAA-MM-DD&ate=AAAA-MM-DD[&conta=<uuid>&codificacao=windows-1252|utf-8]
 * CSV em partida dobrada para importar no sistema contábil: uma linha por rateio (ver lib/export/accounting.ts).
 * Recusa (422) quando alguma rubrica usada no período não tem conta contábil.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const period = periodBounds({ kind: "personalizado", from: params.get("de") ?? "", to: params.get("ate") ?? "" });
  if (!period) return errorResponse("Período inválido: informe datas válidas, com início antes do fim.");
  const account = z.uuid().optional().safeParse(params.get("conta") || undefined);
  if (!account.success) return errorResponse("Conta inválida.");
  const raw = params.get("codificacao");
  const encoding: CsvEncoding = isCsvEncoding(raw) ? raw : "windows-1252";

  const context = await exportContext();
  if (context.error) return context.error;
  try {
    const splits = await fetchAllSplitRows(context.supabase, context.groupId, period, account.data);
    const missing = missingLedgerCodes(splits);
    if (missing.length) {
      const list = missing.slice(0, 8).join(", ") + (missing.length > 8 ? ` e mais ${missing.length - 8}` : "");
      return errorResponse(`Rubricas sem conta contábil: ${list}. Cadastre a conta contábil em Cadastros antes de exportar.`, 422);
    }
    const csv = toCsv(ACCOUNTING_COLUMNS, toAccountingRows(splits));
    return csvResponse(encodeCsv(csv, encoding), `contabil_${period.from}_${period.to}.csv`, encoding);
  } catch (error) {
    if (error instanceof ExportTooLargeError) return errorResponse(error.message, 413);
    console.error("export contabil", error);
    return errorResponse("Não foi possível gerar o arquivo.", 500);
  }
}
