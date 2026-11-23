import { NextResponse, type NextRequest } from "next/server";
import { DataError } from "@/lib/server/db";
import { appUrl, startGoogleLogin } from "@/lib/server/auth";

/** GET /auth/google[?next=/caminho]: vai para o login do Google (state, PKCE e nonce num cookie curto). */
export async function GET(request: NextRequest) {
  try {
    return NextResponse.redirect(await startGoogleLogin(request.nextUrl.searchParams.get("next") ?? "/"), 303);
  } catch (error) {
    if (!(error instanceof DataError)) throw error;
    return NextResponse.redirect(new URL(`/login?erro=${encodeURIComponent(error.message)}`, appUrl()), 303);
  }
}
