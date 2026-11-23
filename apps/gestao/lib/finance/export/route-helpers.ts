import { NextResponse } from "next/server";
import { financeReaderOrError } from "@/lib/server/session";
import { XLSX_MIME } from "./xlsx";

/** Cliente e grupo do usuário logado; quem vê o Financeiro pode exportar (é leitura, sob RLS). */
export async function exportContext() {
  const member = await financeReaderOrError();
  if ("error" in member) return { error: errorResponse(member.error, 403) };
  return { db: member.db, groupId: member.groupId };
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function xlsxResponse(buffer: Buffer, filename: string) {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const CSV_MIME = "text/csv";

export function csvResponse(bytes: Uint8Array, filename: string, charset: string) {
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": `${CSV_MIME}; charset=${charset}`,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
