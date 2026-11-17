export const ALLOWED_EMAIL_DOMAIN = "escoteirosalbert.com.br";
export const MEMBER_ROLES = ["admin", "treasurer", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export function isAllowedEmail(value: string) {
  const email = value.trim().toLowerCase();
  const parts = email.split("@");
  return parts.length === 2 && parts[0].length > 0 && parts[1] === ALLOWED_EMAIL_DOMAIN;
}

export function canManageEntries(role: string): role is "admin" | "treasurer" {
  return role === "admin" || role === "treasurer";
}
