import { UserMenu, type AdminLink } from "@geas/ui";
import { logout } from "@/app/(gestao)/login/actions";
import type { Member } from "@/lib/server/session";

/**
 * Telas de administração, comuns a todos os módulos, no menu da conta (e não nas Configurações de um módulo):
 * Usuários (quem administra algum módulo) e Importar (Editor do Associados ou do Inventário, Administrador do
 * Financeiro; os mesmos que a tela /importar aceita).
 */
export function adminLinks(member: Member, current: string): AdminLink[] {
  return [
    ...(member.managesUsers ? [{ href: "/usuarios", label: "Usuários", active: current.startsWith("/usuarios") }] : []),
    ...(member.associates.canReview || member.inventory.canReview || member.finance.canAdmin ? [{ href: "/importar", label: "Importar dados", active: current.startsWith("/importar") }] : []),
  ];
}

/** Menu da conta de todos os cabeçalhos do Gestão: e-mail, papel, Administração e Sair. */
export function AccountMenu({ member, role, current }: { member: Member; role: string; current: string }) {
  return <UserMenu email={member.user.email} role={role} logoutAction={logout} adminLinks={adminLinks(member, current)} />;
}
