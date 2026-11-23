import { cache } from "react";
import { redirect } from "next/navigation";
import { MODULE_ROLE_LABELS, isModuleRole, roleAtLeast, type ModuleRole, type RoleModule } from "@geas/ui/lib/roles";
import { currentUser, type SessionUser } from "@/lib/server/auth";
import type { Db } from "@/lib/server/db";
import { one, userDb } from "@/lib/server/pg/db";

/** O que o papel (`module_role`, migration 003) permite num módulo. Mesmas regras nas funções SQL `can_*`. */
export type ModulePermissions = {
  role: ModuleRole;
  /** Consulta ou mais: vê o módulo ("Sem acesso" some do menu). */
  canRead: boolean;
  /** Colaborador ou mais: faz o dia a dia (lançamentos, associados, materiais e movimentos); o do Colaborador fica
   * para revisar. */
  canWrite: boolean;
  /** Editor ou mais: revisa, mantém as configurações, importa, concilia e cuida das mensalidades. */
  canReview: boolean;
  /** Administrador: também gerencia os usuários do módulo. */
  canAdmin: boolean;
};

export function permissionsOf(role: ModuleRole): ModulePermissions {
  return {
    role, canRead: roleAtLeast(role, "viewer"), canWrite: roleAtLeast(role, "contributor"),
    canReview: roleAtLeast(role, "editor"), canAdmin: role === "admin",
  };
}

/** Rótulo do papel para o menu do usuário. */
export const roleLabel = (permissions: ModulePermissions) => MODULE_ROLE_LABELS[permissions.role];

/** Usuário logado que pertence a um grupo, com o papel em cada módulo do Gestão. */
export type Member = {
  /** Banco como este usuário (RLS): passar para as funções de lib/server/<módulo>. */
  db: Db;
  user: SessionUser;
  groupId: string;
  /** Associado adulto ligado ao acesso pelo administrador do Associados (avisos da seção do chefe). */
  associateId: string | null;
  finance: ModulePermissions;
  inventory: ModulePermissions;
  associates: ModulePermissions;
  /** Administra algum módulo: abre /usuarios. */
  managesUsers: boolean;
};

export const moduleOf = (member: Member, module: RoleModule): ModulePermissions => member[module];

type Session =
  | { user: null; member: null }
  | { user: SessionUser; member: Member | null };

const toRole = (value: string | null): ModuleRole => (isModuleRole(value) ? value : "none");

/** Sessão e vínculo com o grupo, lidos uma vez por requisição. Único lugar que lê `memberships`. */
export const getSession = cache(async (): Promise<Session> => {
  const user = await currentUser();
  if (!user) return { user: null, member: null };
  const db = userDb(user.id);
  const data = await one<{ group_id: string; finance_role: string; inventory_role: string; associates_role: string; associate_id: string | null }>(db, (sql) => sql`
    select group_id, finance_role, inventory_role, associates_role, associate_id
    from public.memberships where user_id = ${user.id} order by created_at limit 1`);
  if (!data) return { user, member: null };
  const finance = permissionsOf(toRole(data.finance_role));
  const inventory = permissionsOf(toRole(data.inventory_role));
  const associates = permissionsOf(toRole(data.associates_role));
  return {
    user,
    member: {
      db, user, groupId: data.group_id, associateId: data.associate_id, finance, inventory, associates,
      managesUsers: finance.canAdmin || inventory.canAdmin || associates.canAdmin,
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

/** Módulos que o membro vê (menu, seletor de módulo, layouts). */
export type ModuleAccess = { financeiro: boolean; inventario: boolean; associados: boolean };
export const moduleAccess = (member: Member | null): ModuleAccess => ({
  financeiro: member?.finance.canRead ?? false, inventario: member?.inventory.canRead ?? false, associados: member?.associates.canRead ?? false,
});

/** Layout de um módulo: quem não tem acesso a ele volta para o Início (o banco já não deixaria ler os dados). */
export async function requireModule(module: keyof ModuleAccess): Promise<void> {
  const { member } = await pageSession();
  if (!moduleAccess(member)[module]) redirect("/");
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

/** Financeiro: quem vê o módulo (rotas de leitura: exportações, anexos). */
export const financeReaderOrError = (denied = "Sem acesso ao Financeiro.") => allowed((m) => m.finance.canRead, denied);
/** Associados: quem vê o módulo (relatórios). */
export const associatesReaderOrError = (denied = "Sem acesso ao Associados.") => allowed((m) => m.associates.canRead, denied);
/** Financeiro, Colaborador ou mais: lançamentos e comprovantes. */
export const financeWriterOrError = (denied = "Sem permissão para esta alteração.") => allowed((m) => m.finance.canWrite, denied);
/** Financeiro, Editor ou mais: revisão, cadastros, extrato, conciliação e mensalidades. */
export const financeEditorOrError = (denied = "Apenas editores do Financeiro podem fazer esta alteração.") => allowed((m) => m.finance.canReview, denied);
/** Inventário, Colaborador ou mais: cadastra e movimenta material (o do Colaborador fica para revisar). */
export const inventoryWriterOrError = (denied = "Sem permissão para esta alteração.") => allowed((m) => m.inventory.canWrite, denied);
/** Inventário, Editor ou mais: revisão, divisões, famílias e contagens. */
export const inventoryEditorOrError = (denied = "Apenas editores do Inventário podem fazer esta alteração.") => allowed((m) => m.inventory.canReview, denied);
/** Associados, Colaborador ou mais: cadastro, funções, passagens, controle e responsáveis. */
export const associatesWriterOrError = (denied = "Sem permissão para esta alteração.") => allowed((m) => m.associates.canWrite, denied);
/** Associados, Editor ou mais: revisão, seções, itens de controle e importação. */
export const associatesEditorOrError = (denied = "Apenas editores do Associados podem fazer esta alteração.") => allowed((m) => m.associates.canReview, denied);
/** Administrador de algum módulo (tela de Usuários; o banco confere módulo a módulo). */
export const usersAdminOrError = (denied = "Apenas administradores gerenciam usuários.") => allowed((m) => m.managesUsers, denied);

/** Variantes que lançam `Error` com a mensagem, para actions que já tratam exceções. */
async function required(guard: Promise<Guard>): Promise<Member> {
  const member = await guard;
  if ("error" in member) throw new Error(member.error);
  return member;
}

export const requireFinanceEditor = (denied?: string) => required(financeEditorOrError(denied));
export const requireFinanceWriter = (denied?: string) => required(financeWriterOrError(denied));
export const requireAssociatesEditor = (denied?: string) => required(associatesEditorOrError(denied));
export const requireAssociatesWriter = (denied?: string) => required(associatesWriterOrError(denied));
export const requireUsersAdmin = () => required(usersAdminOrError());
