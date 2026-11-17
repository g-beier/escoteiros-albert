import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { GroupRole, InventoryRole } from "@geas/ui/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { canManageEntries, inventoryRoleOf } from "@/lib/auth";

/** Usuário logado que pertence a um grupo, com o papel em cada módulo do Gestão. */
export type Member = {
  supabase: SupabaseClient;
  user: User;
  groupId: string;
  /** Administrador do grupo: gestor nos dois módulos e único que gere usuários. */
  isAdmin: boolean;
  finance: {
    /** `memberships.role`: o papel do grupo, que é o do Financeiro. */
    role: GroupRole;
    /** Tesouraria ou administração: lança, concilia, importa e mantém cadastros. */
    canEdit: boolean;
  };
  inventory: {
    role: InventoryRole;
    /** Chefe, gestor ou administrador: cadastra e movimenta material (o chefe passa por revisão). */
    canEdit: boolean;
    /** Gestor ou administrador: divisões, famílias, revisão; movimentos já nascem revisados. */
    canManage: boolean;
  };
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
  const role = data.role as GroupRole;
  const inventoryRole = inventoryRoleOf(role, data.inventory_role as InventoryRole | null);
  return {
    supabase, user,
    member: {
      supabase, user, groupId: data.group_id as string, isAdmin: role === "admin",
      finance: { role, canEdit: canManageEntries(role) },
      inventory: { role: inventoryRole, canEdit: inventoryRole !== "viewer", canManage: inventoryRole === "manager" },
    },
  };
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

/** Como `memberOrError`, exigindo tesouraria ou administração (Financeiro). */
export async function financeEditorOrError(denied = "Sem permissão para esta alteração."): Promise<Member | { error: string }> {
  const member = await memberOrError();
  if ("error" in member) return member;
  return member.finance.canEdit ? member : { error: denied };
}

/** Variantes que lançam `Error` com a mensagem, para actions que já tratam exceções. */
export async function requireFinanceEditor(denied?: string): Promise<Member> {
  const member = await financeEditorOrError(denied);
  if ("error" in member) throw new Error(member.error);
  return member;
}

export async function requireAdmin(): Promise<Member> {
  const member = await memberOrError();
  if ("error" in member) throw new Error(member.error);
  if (!member.isAdmin) throw new Error("Apenas administradores podem gerir usuários.");
  return member;
}
