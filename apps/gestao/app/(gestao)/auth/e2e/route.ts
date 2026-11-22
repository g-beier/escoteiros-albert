import { NextResponse, type NextRequest } from "next/server";
import { e2eLoginEnabled, e2eSignIn, safeNext } from "@/lib/server/auth";

/**
 * POST /auth/e2e (formulário com `email` e `next`): login sem Google, só para os testes E2E. Responde 404 a não ser
 * com `E2E_LOGIN=1` num servidor de desenvolvimento (lib/server/auth.ts, `e2eLoginEnabled`).
 */
export async function POST(request: NextRequest) {
  if (!e2eLoginEnabled()) return new NextResponse("Não encontrado.", { status: 404 });
  const form = await request.formData();
  const ok = await e2eSignIn(String(form.get("email") ?? ""));
  if (!ok) return NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent("Este e-mail não tem acesso ao Gestão.")}`, request.url), 303);
  return NextResponse.redirect(new URL(safeNext(String(form.get("next") ?? "/")), request.url), 303);
}
