"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ALLOWED_EMAIL_DOMAIN, isAllowedEmail } from "@/lib/auth";

export async function requestOtp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isAllowedEmail(email)) redirect(`/login?erro=${encodeURIComponent(`Use seu e-mail @${ALLOWED_EMAIL_DOMAIN}.`)}`);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) redirect(`/login?erro=${encodeURIComponent("Não foi possível enviar o código. Verifique se você foi convidado.")}`);
  redirect(`/login?email=${encodeURIComponent(email)}&mensagem=${encodeURIComponent("Enviamos um código de acesso para seu e-mail.")}`);
}
export async function verifyOtp(formData: FormData) {
  const supabase = await createClient();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").replace(/\s/g, "");
  if (!isAllowedEmail(email)) redirect(`/login?erro=${encodeURIComponent("E-mail não autorizado.")}`);
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) redirect(`/login?email=${encodeURIComponent(email)}&erro=${encodeURIComponent("Código inválido ou expirado.")}`);
  redirect("/");
}
