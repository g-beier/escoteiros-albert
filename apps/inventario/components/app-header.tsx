import { IconSettings } from "@tabler/icons-react";
import { AppHeader as SharedHeader, UserMenu } from "@geas/ui";
import { logout } from "@/app/actions";
import { Brand } from "@/components/brand";
import { SETTINGS_HOME } from "@/components/settings-tabs";
import { ROLE_LABELS, type InventoryRole } from "@/lib/inventory";

/** Menu = Início; Materiais e Movimentações ficam fora do menu (rotas ainda existem). Configurações na engrenagem. */
const sections = [
  { href: "/", label: "Início", match: (path: string) => path === "/" },
];

export function AppHeader({ current, email, role, isAdmin }: { current: string; email: string; role: InventoryRole; isAdmin: boolean }) {
  return <SharedHeader brand={<Brand />} navigation={sections.map((item) => ({ href: item.href, label: item.label, active: item.match(current) }))}
    utilities={[{ href: SETTINGS_HOME, label: "Configurações", icon: <IconSettings size={18} />, active: current.startsWith("/configuracoes") }]}
    account={<UserMenu email={email} role={isAdmin ? "admin" : ROLE_LABELS[role]} logoutAction={logout}
      usersHref={isAdmin ? "/configuracoes/usuarios" : undefined} active={current === "/configuracoes/usuarios"} />} />;
}
