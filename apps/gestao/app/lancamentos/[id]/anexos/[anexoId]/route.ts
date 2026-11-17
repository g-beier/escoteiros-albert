import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { memberOrError } from "@/lib/session";
import { ATTACHMENT_BUCKET, ATTACHMENT_URL_TTL } from "@/lib/attachments";

/**
 * GET /lancamentos/<id>/anexos/<anexoId>[?baixar=1]
 * Redireciona para uma URL assinada de curta duração do bucket privado. Qualquer membro do grupo
 * (inclusive consulta) pode abrir; a RLS de `entry_attachments` e a política do bucket conferem o grupo.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; anexoId: string }> }) {
  const { id, anexoId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(anexoId).success) return text("Anexo não encontrado.", 404);
  const member = await memberOrError();
  if ("error" in member) return text(member.error, 401);
  const { data: attachment } = await member.supabase.from("entry_attachments")
    .select("storage_path, file_name").eq("id", anexoId).eq("entry_id", id).maybeSingle();
  if (!attachment) return text("Anexo não encontrado.", 404);
  const download = request.nextUrl.searchParams.has("baixar");
  const { data, error } = await member.supabase.storage.from(ATTACHMENT_BUCKET)
    .createSignedUrl(attachment.storage_path as string, ATTACHMENT_URL_TTL, download ? { download: attachment.file_name as string } : undefined);
  if (error || !data) return text("Não foi possível abrir o anexo.", 502);
  const response = NextResponse.redirect(data.signedUrl, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function text(message: string, status: number) {
  return new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
