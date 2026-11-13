// Papéis dos apps internos (sem dependências: usado na tela e no servidor).
// O papel do grupo (memberships.role) é o do Financeiro; "admin" administra os dois apps e os usuários.
// O papel do Inventário (memberships.inventory_role) vale para quem não é administrador.

export const ALLOWED_EMAIL_DOMAIN = "escoteirosalbert.com.br";

export function isAllowedEmail(value: string) {
  const parts = value.trim().toLowerCase().split("@");
  return parts.length === 2 && parts[0].length > 0 && parts[1] === ALLOWED_EMAIL_DOMAIN;
}

export const GROUP_ROLES = ["admin", "treasurer", "viewer"] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];
export const GROUP_ROLE_LABELS: Record<GroupRole, string> = { admin: "Administrador", treasurer: "Tesoureiro", viewer: "Consulta" };

export const INVENTORY_ROLES = ["manager", "chief", "viewer"] as const;
export type InventoryRole = (typeof INVENTORY_ROLES)[number];
export const INVENTORY_ROLE_LABELS: Record<InventoryRole, string> = { manager: "Gestor", chief: "Chefe", viewer: "Consulta" };

/** Pessoa com acesso ao grupo, como a tela de Usuários mostra. */
export type GroupUser = { userId: string; email: string; confirmed: boolean; role: GroupRole; inventoryRole: InventoryRole };
