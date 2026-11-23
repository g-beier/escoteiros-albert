import type { AssociatesRole, GroupRole, InventoryRole } from "@geas/ui/lib/roles";

// Papéis vêm de @geas/ui/lib/roles (comuns à tela de Usuários). Aqui ficam só as regras de cada módulo.
export { GROUP_ROLES as MEMBER_ROLES, isValidEmail } from "@geas/ui/lib/roles";
export type { GroupRole as MemberRole } from "@geas/ui/lib/roles";

/** Financeiro: tesouraria ou administração lançam, conciliam, importam e mantêm cadastros. */
export function canManageEntries(role: string): role is "admin" | "treasurer" {
  return role === "admin" || role === "treasurer";
}

/** Inventário: o administrador do grupo é sempre gestor; os demais usam `memberships.inventory_role`. */
export function inventoryRoleOf(groupRole: GroupRole, inventoryRole: InventoryRole | null | undefined): InventoryRole {
  return groupRole === "admin" ? "manager" : (inventoryRole ?? "viewer");
}

/** Associados: o administrador do grupo é sempre secretaria (manager); os demais usam `memberships.associates_role`. */
export function associatesRoleOf(groupRole: GroupRole, associatesRole: AssociatesRole | null | undefined): AssociatesRole {
  return groupRole === "admin" ? "manager" : (associatesRole ?? "viewer");
}

/** Dias sem uso até a sessão vencer (banco em lib/server/auth.ts, cookie em proxy.ts). */
export const SESSION_DAYS = 30;
