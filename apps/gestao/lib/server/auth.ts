import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/server/supabase/client";
export { updateSession as refreshSession } from "@/lib/server/supabase/proxy";

// Autenticação (hoje Supabase Auth, código por e-mail). Login, link do e-mail, logout e o proxy passam por aqui;
// trocar de provedor (docs/migracao-saida-supabase.md, 4.3) é reimplementar este arquivo e a tela de login.

/** Pessoa autenticada: só o que as telas usam. */
export type SessionUser = { id: string; email: string };

export async function currentUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? "" } : null;
}

/** Envia o código de acesso; só para quem já foi convidado (não cria conta). */
export async function sendLoginCode(email: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  return !error;
}

export async function verifyLoginCode(email: string, token: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  return !error;
}

/** Link do e-mail (convite ou acesso): `token_hash` e `type` da URL de /auth/confirm. */
export async function verifyLoginLink(tokenHash: string, type: string): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: type as EmailOtpType, token_hash: tokenHash });
  return !error;
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
