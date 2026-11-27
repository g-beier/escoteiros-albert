import { NextResponse, type NextRequest } from "next/server";
import { DataError } from "@/lib/server/db";
import { appUrl, finishGoogleLogin, LoginError, pruneSessions } from "@/lib/server/auth";

/** GET /auth/callback: volta do Google; abre a sessão ou mostra o motivo na tela de login. */
export async function GET(request: NextRequest) {
  try {
    const next = await finishGoogleLogin(request.nextUrl.searchParams);
    if (Math.random() < 0.05) await pruneSessions();
    return NextResponse.redirect(new URL(next, appUrl()), 303);
  } catch (error) {
    if (!(error instanceof LoginError || error instanceof DataError)) {
      console.error("login Google", error);
      return failed("Não foi possível entrar. Tente de novo.");
    }
    return failed(error.message);
  }
}

const failed = (message: string) =>
  NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent(message)}`, appUrl()), 303);
