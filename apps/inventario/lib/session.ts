import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { InventoryRole } from "@/lib/inventory";

/** Usuário logado que pertence a um grupo, com o papel efetivo no Inventário. */
export type Member = {
  supabase: SupabaseClient;
  user: User;
  groupId: string;
  /** Papel no grupo (Financeiro): só "admin" importa aqui, porque administra os dois apps. */
  groupRole: string;
  /** Papel no Inventário; o administrador do grupo é sempre gestor. */
  role: InventoryRole;
  /** Gestor ou administrador: divisões, famílias, revisão; movimentos já nascem revisados. */
  canManage: boolean;
  /** Chefe, gestor ou administrador: cadastra e movimenta material (o chefe passa por revisão). */
  canEdit: boolean;
  isAdmin: boolean;
};

type Session =
  | { supabase: SupabaseClient; user: null; member: null }
  | { supabase: SupabaseClient; user: User; member: Member | null };

/** Sessão e vínculo com o grupo, lidos uma vez por requisição. Único lugar que lê `memberships`. */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, member: null };
  const { data } = await supabase.from("memberships").select("group_id, role, inventory_role").eq("user_id", user.id).single();
  if (!data) return { supabase, user, member: null };
  const isAdmin = data.role === "admin";
  const role: InventoryRole = isAdmin ? "manager" : (data.inventory_role as InventoryRole);
  return {
    supabase, user,
    member: { supabase, user, groupId: data.group_id as string, groupRole: data.role as string, role, isAdmin, canManage: role === "manager", canEdit: role !== "viewer" },
  };
});

/** Páginas: sem sessão vai para /login; `member` nulo = conta sem grupo (mostrar SetupNeeded). */
export async function pageSession() {
  const session = await getSession();
  if (!session.user) redirect("/login");
  return session;
}

/** Server Actions: o membro, ou a mensagem de erro para o usuário. */
export async function memberOrError(): Promise<Member | { error: string }> {
  const session = await getSession();
  if (!session.user) return { error: "Sessão expirada. Entre novamente." };
  if (!session.member) return { error: "Sua conta ainda não pertence a um grupo." };
  return session.member;
}

/** Como `memberOrError`, exigindo chefe, gestor ou administrador. */
export async function editorOrError(denied = "Sem permissão para esta alteração."): Promise<Member | { error: string }> {
  const member = await memberOrError();
  if ("error" in member) return member;
  return member.canEdit ? member : { error: denied };
}

/** Como `memberOrError`, exigindo gestor ou administrador. */
export async function managerOrError(denied = "Apenas o gestor do inventário pode fazer esta alteração."): Promise<Member | { error: string }> {
  const member = await memberOrError();
  if ("error" in member) return member;
  return member.canManage ? member : { error: denied };
}
