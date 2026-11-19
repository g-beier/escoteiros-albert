import { IconSettings } from "@tabler/icons-react";
import { AppHeader as SharedHeader, UserMenu } from "@geas/ui";
import { ASSOCIATES_ROLE_LABELS, type AssociatesRole } from "@geas/ui/lib/roles";
import { logout } from "@/app/(gestao)/login/actions";
import { Brand } from "@/components/shell/brand";

/** Configurações do módulo (engrenagem): seções e equipes, itens de controle, importação. */
export const ASSOCIATES_SETTINGS_HOME = "/associados/configuracoes/secoes";
const isSettingsPath = (path: string) => path.startsWith("/associados/configuracoes");

/** Menu = 2º segmento da rota (/associados/<menu>); a lista é a raiz do módulo. */
const isControlPath = (path: string) => path.startsWith("/associados/controle");
const sections = [
  { href: "/associados", label: "Associados", match: (path: string) => path.startsWith("/associados") && !isSettingsPath(path) && !isControlPath(path) },
  { href: "/associados/controle", label: "Controle de dados", match: isControlPath },
];

export function AppHeader({ current, email, role, isAdmin }: { current: string; email: string; role: AssociatesRole; isAdmin: boolean }) {
  return <SharedHeader brand={<Brand module="associados" />} navigation={sections.map((item) => ({ href: item.href, label: item.label, active: item.match(current) }))}
    utilities={[{ href: ASSOCIATES_SETTINGS_HOME, label: "Configurações", icon: <IconSettings size={18} />, active: isSettingsPath(current) }]}
    account={<UserMenu email={email} role={isAdmin ? "admin" : ASSOCIATES_ROLE_LABELS[role]} logoutAction={logout}
      usersHref={isAdmin ? "/usuarios" : undefined} active={current === "/usuarios"} />} />;
}
