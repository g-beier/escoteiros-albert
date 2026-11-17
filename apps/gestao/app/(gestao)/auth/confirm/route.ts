import { type NextRequest, NextResponse } from "next/server";
import { verifyLoginLink } from "@/lib/server/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  if (tokenHash && type && await verifyLoginLink(tokenHash, type)) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.redirect(new URL("/login?erro=Link%20inv%C3%A1lido%20ou%20expirado", request.url));
}
