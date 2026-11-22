import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { SESSION_DAYS } from "@/lib/auth";
import { DataError } from "@/lib/server/db";
import { authDb, one, run } from "@/lib/server/pg/db";

// Autenticação: login com Google (OpenID Connect, fluxo de código com PKCE, `state` e `nonce`) e sessão própria.
// Entra quem o administrador cadastrou em Usuários (auth.users), por qualquer conta Google com aquele e-mail
// verificado; no primeiro login a conta Google (`sub`) fica presa ao cadastro. O cookie leva um token aleatório;
// o banco guarda só o hash (auth.sessions). Configuração: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e APP_URL.

/** Pessoa autenticada: só o que as telas usam. */
export type SessionUser = { id: string; email: string };

const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Renova a validade no máximo uma vez por dia de uso (sessão deslizante). */
const RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
const FLOW_MINUTES = 10;

/** Origem pública do app (redirect do Google e cookies `Secure`). */
export function appUrl(): string {
  const url = process.env.APP_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
  if (!url) throw new Error("APP_URL não configurada.");
  return url.replace(/\/$/, "");
}

const secure = () => appUrl().startsWith("https://");
/** `__Host-` (só HTTPS) prende o cookie ao host exato, sem domínio nem caminho alterados. */
export const sessionCookieName = () => (secure() ? "__Host-geas_session" : "geas_session");
const flowCookieName = () => (secure() ? "__Host-geas_login" : "geas_login");

const base64url = (bytes: Buffer) => bytes.toString("base64url");
const sha256 = (value: string) => createHash("sha256").update(value).digest();
const tokenId = (token: string) => sha256(token).toString("hex");

function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new DataError("Login com Google não configurado (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).");
  return { clientId, clientSecret, redirectUri: `${appUrl()}/auth/callback` };
}

/**
 * Caminho interno para depois do login (nunca outro site). Recusa `//`, barra invertida e caracteres de controle:
 * o parser de URL descarta tab e quebra de linha, então "/\t/site" viraria "//site".
 */
export function safeNext(value: string | null | undefined): string {
  return value && /^\/(?!\/)[^\\\p{Cc}]*$/u.test(value) ? value : "/";
}

// Login ---------------------------------------------------------------------------------------------

/** Começa o login: guarda state, verificador PKCE e nonce num cookie curto e devolve a URL do Google. */
export async function startGoogleLogin(next: string): Promise<string> {
  const { clientId, redirectUri } = googleConfig();
  const state = base64url(randomBytes(32));
  const verifier = base64url(randomBytes(32));
  const nonce = base64url(randomBytes(32));
  const store = await cookies();
  store.set(flowCookieName(), JSON.stringify({ state, verifier, nonce, next: safeNext(next) }), {
    httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: FLOW_MINUTES * 60,
  });
  const url = new URL(GOOGLE_AUTHORIZE);
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email",
    state, nonce, code_challenge: base64url(sha256(verifier)), code_challenge_method: "S256", prompt: "select_account",
  }).toString();
  return url.toString();
}

/** Motivo de recusa do login, mostrado na tela (/login?erro=…). */
export class LoginError extends Error {}

/** Volta do Google: confere state, troca o código, valida o id_token e abre a sessão. Devolve o caminho seguinte. */
export async function finishGoogleLogin(params: URLSearchParams): Promise<string> {
  const store = await cookies();
  const raw = store.get(flowCookieName())?.value;
  store.delete(flowCookieName());
  const flow = raw ? (JSON.parse(raw) as { state: string; verifier: string; nonce: string; next: string }) : null;
  if (params.get("error")) throw new LoginError("Login cancelado.");
  const code = params.get("code");
  if (!flow || !code || params.get("state") !== flow.state) throw new LoginError("O login expirou. Tente de novo.");

  const { clientId, clientSecret, redirectUri } = googleConfig();
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: flow.verifier }),
    cache: "no-store",
  });
  const tokens = (await response.json().catch(() => null)) as { id_token?: string } | null;
  if (!response.ok || !tokens?.id_token) throw new LoginError("O Google não confirmou o login. Tente de novo.");

  const { payload } = await jwtVerify(tokens.id_token, googleKeys, { issuer: GOOGLE_ISSUERS, audience: clientId }).catch(() => {
    throw new LoginError("O Google não confirmou o login. Tente de novo.");
  });
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (payload.nonce !== flow.nonce || !payload.sub) throw new LoginError("O login expirou. Tente de novo.");
  if (!email || payload.email_verified !== true) throw new LoginError("A conta Google precisa ter o e-mail verificado.");

  const userId = await signInUser(email, payload.sub);
  await openSession(userId);
  return safeNext(flow.next);
}

/** Confere o cadastro (e a conta Google presa a ele) e registra o acesso; devolve o id. */
async function signInUser(email: string, googleSub: string): Promise<string> {
  const user = await run(authDb(), async (sql) => {
    const [found] = await sql`
      select id, google_sub, banned_until > now() as banned from auth.users where email = ${email} for update`;
    if (!found || found.banned) return null;
    if (found.google_sub && found.google_sub !== googleSub) return "other-account" as const;
    await sql`update auth.users set google_sub = ${googleSub}, last_sign_in_at = now() where id = ${found.id}`;
    return found.id as string;
  });
  if (user === "other-account") throw new LoginError("Este e-mail já entrou com outra conta Google. Peça ao administrador para refazer o cadastro.");
  if (!user) throw new LoginError("Este e-mail não tem acesso ao Gestão. Peça ao administrador do grupo para cadastrá-lo.");
  return user;
}

/** Cria a sessão e grava o cookie (só o hash do token vai ao banco). */
export async function openSession(userId: string): Promise<void> {
  const token = base64url(randomBytes(32));
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await run(authDb(), (sql) => sql`
    insert into auth.sessions(id, user_id, expires_at) values (${tokenId(token)}, ${userId}, ${expires.toISOString()})`);
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true, secure: secure(), sameSite: "lax", path: "/", expires,
  });
}

// Sessão ---------------------------------------------------------------------------------------------

export async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token || token.length > 100) return null;
  const id = tokenId(token);
  const session = await one<{ user_id: string; email: string; last_seen_at: string }>(authDb(), (sql) => sql`
    select s.user_id, u.email, s.last_seen_at from auth.sessions s join auth.users u on u.id = s.user_id
    where s.id = ${id} and s.expires_at > now() and (u.banned_until is null or u.banned_until <= now())`);
  if (!session) return null;
  if (Date.now() - Date.parse(session.last_seen_at) > RENEW_AFTER_MS) {
    // o banco decide a validade; o cookie é renovado em proxy.ts (Server Components não gravam cookies)
    await run(authDb(), (sql) => sql`
      update auth.sessions set last_seen_at = now(), expires_at = greatest(expires_at, now() + make_interval(days => ${SESSION_DAYS}))
      where id = ${id}`).catch(() => undefined);
  }
  return { id: session.user_id, email: session.email };
}

export async function signOut() {
  const store = await cookies();
  const token = store.get(sessionCookieName())?.value;
  if (token) await run(authDb(), (sql) => sql`delete from auth.sessions where id = ${tokenId(token)}`).catch(() => undefined);
  store.delete(sessionCookieName());
}

/** Apaga sessões vencidas (chamado de vez em quando no login). */
export async function pruneSessions() {
  await run(authDb(), (sql) => sql`delete from auth.sessions where expires_at < now() - interval '1 day'`).catch(() => undefined);
}

// Testes E2E -----------------------------------------------------------------------------------------

/**
 * Login sem Google, só para os testes E2E: exige `E2E_LOGIN=1` e um servidor de desenvolvimento (`next dev`);
 * num build de produção (`NODE_ENV=production`) nunca liga.
 */
export const e2eLoginEnabled = () => process.env.E2E_LOGIN === "1" && process.env.NODE_ENV !== "production";

export async function e2eSignIn(email: string): Promise<boolean> {
  if (!e2eLoginEnabled()) return false;
  const user = await one<{ id: string }>(authDb(), (sql) => sql`
    update auth.users set last_sign_in_at = now() where email = ${email.trim().toLowerCase()} and (banned_until is null or banned_until <= now())
    returning id`);
  if (!user) return false;
  await openSession(user.id);
  return true;
}
