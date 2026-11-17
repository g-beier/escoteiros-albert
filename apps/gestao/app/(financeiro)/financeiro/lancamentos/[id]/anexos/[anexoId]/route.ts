import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DataError } from "@/lib/server/db";
import { downloadUrl } from "@/lib/server/finance/attachments";
import { memberOrError } from "@/lib/server/session";

/**
 * GET /financeiro/lancamentos/<id>/anexos/<anexoId>[?baixar=1]
 * Redireciona para uma URL assinada de curta duração do bucket privado. Qualquer membro do grupo
 * (inclusive consulta) pode abrir; a RLS de `entry_attachments` e a política do bucket conferem o grupo.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; anexoId: string }> }) {
  const { id, anexoId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(anexoId).success) return text("Anexo não encontrado.", 404);
  const member = await memberOrError();
  if ("error" in member) return text(member.error, 401);
  let url: string | null;
  try {
    url = await downloadUrl(member.db, id, anexoId, request.nextUrl.searchParams.has("baixar"));
  } catch (error) {
    if (error instanceof DataError) return text("Não foi possível abrir o anexo.", 502);
    throw error;
  }
  if (!url) return text("Anexo não encontrado.", 404);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function text(message: string, status: number) {
  return new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
