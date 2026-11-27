// Papéis dos apps internos (sem dependências: usado na tela e no servidor).
// Os três módulos usam os mesmos cinco níveis (`memberships.finance_role`, `inventory_role`, `associates_role`, tipo
// `module_role`, migration 003). Não há administrador do grupo: cada módulo tem os seus.

/** E-mail com formato válido (qualquer domínio: o acesso é pela conta Google desse e-mail, cadastrado pelo administrador). */
export function isValidEmail(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim().toLowerCase());
}

/** Do menor ao maior: cada nível pode tudo o que os anteriores podem. */
export const MODULE_ROLES = ["none", "viewer", "contributor", "editor", "admin"] as const;
export type ModuleRole = (typeof MODULE_ROLES)[number];

export const MODULE_ROLE_LABELS: Record<ModuleRole, string> = {
  none: "Sem acesso",
  viewer: "Consulta",
  contributor: "Colaborador",
  editor: "Editor",
  admin: "Administrador",
};

export const MODULE_ROLE_HELP: Record<ModuleRole, string> = {
  none: "Não vê o módulo.",
  viewer: "Só consulta.",
  contributor: "Consulta e faz o dia a dia; o que grava fica para revisar.",
  editor: "Edita, revisa e mantém as configurações do módulo.",
  admin: "Editor que também gerencia os usuários do módulo.",
};

/** `role` é pelo menos `min` (ex.: `roleAtLeast(role, "contributor")`). */
export function roleAtLeast(role: ModuleRole, min: ModuleRole) {
  return MODULE_ROLES.indexOf(role) >= MODULE_ROLES.indexOf(min);
}

export function isModuleRole(value: unknown): value is ModuleRole {
  return typeof value === "string" && (MODULE_ROLES as readonly string[]).includes(value);
}

/** Módulos com papel próprio, como o banco os nomeia (`admin_set_module_role`). */
export const ROLE_MODULES = ["finance", "inventory", "associates"] as const;
export type RoleModule = (typeof ROLE_MODULES)[number];
export const ROLE_MODULE_LABELS: Record<RoleModule, string> = {
  finance: "Financeiro",
  inventory: "Inventário",
  associates: "Associados",
};

export type ModuleRoles = Record<RoleModule, ModuleRole>;

/** Pessoa com acesso ao grupo, como a tela de Usuários mostra. */
export type GroupUser = {
  userId: string;
  email: string;
  signedIn: boolean;
  roles: ModuleRoles;
  /** Associado adulto ligado ao acesso (avisos da seção do chefe, nome no lugar do e-mail). */
  associateId: string | null;
};
