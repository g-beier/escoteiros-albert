import { cache } from "react";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupRole, InventoryRole } from "@geas/ui/lib/roles";
import { canManageEntries, inventoryRoleOf } from "@/lib/auth";
import { currentUser, type SessionUser } from "@/lib/server/auth";
import type { Db } from "@/lib/server/db";
import { createClient } from "@/lib/server/supabase/client";
import { asDb, rowsOf } from "@/lib/server/supabase/db";

/** Usuário logado que pertence a um grupo, com o papel em cada módulo do Gestão. */
export type Member = {
  /** Banco como este usuário (RLS): passar para as funções de lib/server/<módulo>. */
  db: Db;
  /** @deprecated Cliente Supabase direto, só para o Financeiro até a fase 3 (docs/consolidacao-gestao.md); use `db`. */
  supabase: SupabaseClient;
  user: SessionUser;
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
  | { supabase: SupabaseClient; user: SessionUser; member: Member | null };

/** Sessão e vínculo com o grupo, lidos uma vez por requisição. Único lugar que lê `memberships`. */
export const getSession = cache(async (): Promise<Session> => {
  const supabase = await createClient();
  const user = await currentUser();
  if (!user) return { supabase, user: null, member: null };
  const [data] = rowsOf(await supabase.from("memberships").select("group_id, role, inventory_role").eq("user_id", user.id).limit(1));
  if (!data) return { supabase, user, member: null };
  const role = data.role as GroupRole;
  const inventoryRole = inventoryRoleOf(role, data.inventory_role as InventoryRole | null);
  return {
    supabase, user,
    member: {
      db: asDb(supabase), supabase, user, groupId: data.group_id as string, isAdmin: role === "admin",
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

type Guard = Member | { error: string };

/** Server Actions e rotas: o membro, ou a mensagem de erro para o usuário. */
export async function memberOrError(): Promise<Guard> {
  const session = await getSession();
  if (!session.user) return { error: "Sessão expirada. Entre novamente." };
  if (!session.member) return { error: "Sua conta ainda não pertence a um grupo." };
  return session.member;
}

async function allowed(test: (member: Member) => boolean, denied: string): Promise<Guard> {
  const member = await memberOrError();
  if ("error" in member) return member;
  return test(member) ? member : { error: denied };
}

/** Financeiro: tesouraria ou administração. */
export const financeEditorOrError = (denied = "Sem permissão para esta alteração.") => allowed((m) => m.finance.canEdit, denied);
/** Inventário: chefe, gestor ou administrador. */
export const inventoryEditorOrError = (denied = "Sem permissão para esta alteração.") => allowed((m) => m.inventory.canEdit, denied);
/** Inventário: gestor ou administrador. */
export const inventoryManagerOrError = (denied = "Apenas o gestor do inventário pode fazer esta alteração.") => allowed((m) => m.inventory.canManage, denied);
/** Administrador do grupo. */
export const adminOrError = (denied = "Apenas administradores do grupo gerenciam usuários.") => allowed((m) => m.isAdmin, denied);

/** Variantes que lançam `Error` com a mensagem, para actions que já tratam exceções. */
export async function requireFinanceEditor(denied?: string): Promise<Member> {
  const member = await financeEditorOrError(denied);
  if ("error" in member) throw new Error(member.error);
  return member;
}

export async function requireAdmin(): Promise<Member> {
  const member = await adminOrError("Apenas administradores podem gerir usuários.");
  if ("error" in member) throw new Error(member.error);
  return member;
}
