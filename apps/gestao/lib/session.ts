import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { canManageEntries, type MemberRole } from "@/lib/auth";

/** Usuário logado que pertence a um grupo. */
export type Member = {
  supabase: SupabaseClient;
  user: User;
  groupId: string;
  role: MemberRole;
  /** Tesouraria ou administração: lança, concilia, importa e mantém cadastros. */
  canEdit: boolean;
};

type Session =
  | { supabase: SupabaseClient; user: null; member: null }
  | { supabase: SupabaseClient; user: User; member: Member | null };

/** Sessão e vínculo com o grupo, lidos uma vez por requisição. */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, member: null };
  const { data } = await supabase.from("memberships").select("group_id, role").eq("user_id", user.id).single();
  const member: Member | null = data
    ? { supabase, user, groupId: data.group_id as string, role: data.role as MemberRole, canEdit: canManageEntries(data.role) }
    : null;
  return { supabase, user, member };
});

/** Páginas: sem sessão vai para /login; `member` nulo = conta sem grupo (mostrar SetupNeeded). */
export async function pageSession() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  return session;
}

/** Páginas que exigem um grupo: sem grupo volta para o início. */
export async function pageMember(): Promise<Member> {
  const { member } = await pageSession();
  if (!member) redirect("/");
  return member;
}

/** Server Actions e rotas: o membro, ou a mensagem de erro para o usuário. */
export async function memberOrError(): Promise<Member | { error: string }> {
  const session = await getSession();
  if (!session.user) return { error: "Sessão expirada. Entre novamente." };
  if (!session.member) return { error: "Sua conta ainda não pertence a um grupo." };
  return session.member;
}

/** Como `memberOrError`, exigindo tesouraria ou administração. */
export async function editorOrError(denied = "Sem permissão para esta alteração."): Promise<Member | { error: string }> {
  const member = await memberOrError();
  if ("error" in member) return member;
  return member.canEdit ? member : { error: denied };
}

/** Variantes que lançam `Error` com a mensagem, para actions que já tratam exceções. */
export async function requireEditor(denied?: string): Promise<Member> {
  const member = await editorOrError(denied);
  if ("error" in member) throw new Error(member.error);
  return member;
}

export async function requireAdmin(): Promise<Member> {
  const member = await memberOrError();
  if ("error" in member) throw new Error(member.error);
  if (member.role !== "admin") throw new Error("Apenas administradores podem gerir usuários.");
  return member;
}
