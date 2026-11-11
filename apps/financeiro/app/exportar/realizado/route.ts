import type { NextRequest } from "next/server";
import type { CategoryItem } from "@/lib/categories";
import { buildRealizedModel, type RealizedSum } from "@/lib/export/realized";
import { errorResponse, exportContext, xlsxResponse } from "@/lib/export/route-helpers";
import { realizedWorkbook } from "@/lib/export/xlsx";

/** GET /exportar/realizado?ano=AAAA */
export async function GET(request: NextRequest) {
  const year = Number(request.nextUrl.searchParams.get("ano"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return errorResponse("Ano inválido.");

  const context = await exportContext();
  if (context.error) return context.error;
  const { supabase, groupId } = context;
  const [{ data: categories, error: categoriesError }, { data: sums, error: sumsError }] = await Promise.all([
    supabase.from("categories").select("id, name, active, code, kind, parent_id").eq("group_id", groupId),
    supabase.rpc("realized_by_month", { p_group_id: groupId, p_year: year }),
  ]);
  if (categoriesError || sumsError) {
    console.error("export realizado", categoriesError ?? sumsError);
    return errorResponse("Não foi possível gerar a planilha.", 500);
  }
  const model = buildRealizedModel((categories ?? []) as CategoryItem[], (sums ?? []) as RealizedSum[], year);
  return xlsxResponse(await realizedWorkbook(model), `realizado-${year}.xlsx`);
}
