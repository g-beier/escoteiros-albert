"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const domain = "escoteirosalbert.com.br";
const valid = (email: string) => email.split("@")[1] === domain;

export async function requestOtp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!valid(email)) redirect(`/login?erro=${encodeURIComponent(`Use seu e-mail @${domain}.`)}`);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) redirect("/login?erro=Não+foi+possível+enviar+o+código.");
  redirect(`/login?email=${encodeURIComponent(email)}&mensagem=Código+enviado.`);
}

export async function verifyOtp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const token = String(formData.get("token") ?? "").replace(/\s/g, "");
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) redirect(`/login?email=${encodeURIComponent(email)}&erro=Código+inválido+ou+expirado.`);
  redirect("/");
}
