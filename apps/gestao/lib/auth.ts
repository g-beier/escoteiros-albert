import type { ActivitiesRole, GroupRole, InventoryRole } from "@geas/ui/lib/roles";

// Domínio permitido e papéis vêm de @geas/ui/lib/roles (comuns à tela de Usuários). Aqui ficam só as regras de cada módulo.
export { ALLOWED_EMAIL_DOMAIN, GROUP_ROLES as MEMBER_ROLES, isAllowedEmail } from "@geas/ui/lib/roles";
export type { GroupRole as MemberRole } from "@geas/ui/lib/roles";

/** Financeiro: tesouraria ou administração lançam, conciliam, importam e mantêm cadastros. */
export function canManageEntries(role: string): role is "admin" | "treasurer" {
  return role === "admin" || role === "treasurer";
}

/** Inventário: o administrador do grupo é sempre gestor; os demais usam `memberships.inventory_role`. */
export function inventoryRoleOf(groupRole: GroupRole, inventoryRole: InventoryRole | null | undefined): InventoryRole {
  return groupRole === "admin" ? "manager" : (inventoryRole ?? "viewer");
}

/** Atividades: o administrador do grupo é sempre gestor; os demais usam `memberships.activities_role`. */
export function activitiesRoleOf(groupRole: GroupRole, activitiesRole: ActivitiesRole | null | undefined): ActivitiesRole {
  return groupRole === "admin" ? "manager" : (activitiesRole ?? "viewer");
}
