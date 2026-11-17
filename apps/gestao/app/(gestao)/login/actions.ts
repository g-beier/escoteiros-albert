"use server";

import { redirect } from "next/navigation";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "@/lib/auth";
import { sendLoginCode, signOut, verifyLoginCode } from "@/lib/server/auth";

export async function requestOtp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isAllowedEmail(email)) redirect(`/login?erro=${encodeURIComponent(`Use seu e-mail @${ALLOWED_EMAIL_DOMAIN}.`)}`);
  if (!(await sendLoginCode(email))) redirect(`/login?erro=${encodeURIComponent("Não foi possível enviar o código. Verifique se você foi convidado.")}`);
  redirect(`/login?email=${encodeURIComponent(email)}&mensagem=${encodeURIComponent("Enviamos um código de acesso para seu e-mail.")}`);
}

export async function verifyOtp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").replace(/\s/g, "");
  if (!isAllowedEmail(email)) redirect(`/login?erro=${encodeURIComponent("E-mail não autorizado.")}`);
  if (!(await verifyLoginCode(email, token))) redirect(`/login?email=${encodeURIComponent(email)}&erro=${encodeURIComponent("Código inválido ou expirado.")}`);
  redirect("/");
}

export async function logout() {
  await signOut();
  redirect("/login");
}
