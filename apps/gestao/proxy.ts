import type { NextRequest } from "next/server";
import { refreshSession } from "@/lib/server/auth";

export async function proxy(request: NextRequest) {
  return refreshSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
