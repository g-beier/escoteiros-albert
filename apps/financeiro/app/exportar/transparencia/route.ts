import { NextResponse, type NextRequest } from "next/server";
import { fetchRealizedModel } from "@/lib/export/queries";
import { errorResponse, exportContext } from "@/lib/export/route-helpers";
import { buildTransparencyReport } from "@/lib/export/transparency";

/** GET /exportar/transparencia?ano=AAAA — JSON do Realizado para a página Transparência do site. */
export async function GET(request: NextRequest) {
  const year = Number(request.nextUrl.searchParams.get("ano"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return errorResponse("Ano inválido.");

  const context = await exportContext();
  if (context.error) return context.error;
  try {
    const report = buildTransparencyReport(await fetchRealizedModel(context.supabase, context.groupId, year));
    return new NextResponse(`${JSON.stringify(report, null, 2)}\n`, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="prestacao-contas-${year}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("export transparencia", error);
    return errorResponse("Não foi possível gerar o arquivo.", 500);
  }
}
