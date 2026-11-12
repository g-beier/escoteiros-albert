import type { NextRequest } from "next/server";
import { fetchRealizedModel } from "@/lib/export/queries";
import { errorResponse, exportContext, xlsxResponse } from "@/lib/export/route-helpers";
import { realizedWorkbook } from "@/lib/export/xlsx";

/** GET /exportar/realizado?ano=AAAA */
export async function GET(request: NextRequest) {
  const year = Number(request.nextUrl.searchParams.get("ano"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return errorResponse("Ano inválido.");

  const context = await exportContext();
  if (context.error) return context.error;
  try {
    const model = await fetchRealizedModel(context.supabase, context.groupId, year);
    return xlsxResponse(await realizedWorkbook(model), `realizado-${year}.xlsx`);
  } catch (error) {
    console.error("export realizado", error);
    return errorResponse("Não foi possível gerar a planilha.", 500);
  }
}
