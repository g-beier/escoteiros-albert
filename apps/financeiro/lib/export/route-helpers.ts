import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { XLSX_MIME } from "./xlsx";

/** Cliente e grupo do usuário logado; qualquer papel pode exportar (é leitura, sob RLS). */
export async function exportContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: errorResponse("Sessão expirada. Entre novamente.", 401) };
  const { data: membership } = await supabase.from("memberships").select("group_id").eq("user_id", user.id).single();
  if (!membership) return { error: errorResponse("Usuário sem grupo.", 403) };
  return { supabase, groupId: membership.group_id as string };
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
