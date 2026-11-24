import type { NextRequest } from "next/server";
import { EXPORTABLE, controlsCsv, functionsCsv, itemsCsv, lifeCsv, peopleCsv, relativesCsv, sectionsCsv } from "@/lib/import/export";
import type { FileKind } from "@/lib/import/contract";
import * as imports from "@/lib/server/import";
import { associatesReaderOrError } from "@/lib/server/session";

/** GET /importar/exportar/<tipo>: dados atuais no formato do contrato (docs/importacao.md), para corrigir e reimportar. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ arquivo: string }> }) {
  const kind = (await params).arquivo.replace(/\.csv$/, "") as FileKind;
  if (!EXPORTABLE.includes(kind)) return new Response("Arquivo desconhecido.", { status: 404 });
  const member = await associatesReaderOrError();
  if ("error" in member) return new Response(member.error, { status: 403 });
  const { db, groupId } = member;
  const csv = kind === "pessoas" ? peopleCsv(await imports.exportPeople(db, groupId))
    : kind === "itens-controle" ? itemsCsv(await imports.state(db, groupId))
    : kind === "controle" ? controlsCsv(await imports.state(db, groupId))
    : kind === "vida-escoteira" ? lifeCsv(await imports.state(db, groupId))
    : kind === "funcoes" ? functionsCsv(await imports.exportFunctions(db, groupId))
      : kind === "responsaveis" ? relativesCsv(await imports.exportRelatives(db, groupId))
        : sectionsCsv(await imports.exportSections(db, groupId));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${kind}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
