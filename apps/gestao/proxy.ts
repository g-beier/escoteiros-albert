import { NextResponse, type NextRequest } from "next/server";
import { SESSION_DAYS } from "@/lib/auth";

// Checagem otimista: sem o cookie de sessão, vai para o login. A sessão é validada no banco por cada página e
// action (lib/server/session.ts); aqui não há consulta. A cada página aberta o cookie ganha mais SESSION_DAYS: quem
// decide se a sessão vale continua sendo o banco. Só em GET de documento, para não desfazer o "Sair" (POST).
const PUBLIC = ["/login", "/auth/", "/privacidade"];
const SESSION_COOKIES = ["__Host-geas_session", "geas_session"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) return NextResponse.next();
  const session = SESSION_COOKIES.map((name) => request.cookies.get(name)).find((cookie) => cookie !== undefined);
  if (session) {
    const response = NextResponse.next();
    if (request.method === "GET" && (request.headers.get("sec-fetch-dest") ?? "document") === "document") {
      response.cookies.set(session.name, session.value, {
        httpOnly: true,
        secure: session.name.startsWith("__Host-"),
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_DAYS * 86_400,
      });
    }
    return response;
  }
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
