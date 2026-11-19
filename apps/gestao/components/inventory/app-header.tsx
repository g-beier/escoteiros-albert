import { IconBolt, IconSettings } from "@tabler/icons-react";
import { AppHeader as SharedHeader, UserMenu } from "@geas/ui";
import { logout } from "@/app/(gestao)/login/actions";
import { Brand } from "@/components/shell/brand";
import { SETTINGS_HOME } from "@/components/inventory/settings-tabs";
import { ROLE_LABELS, type InventoryRole } from "@/lib/inventory/vocabulary";

/** Menu = 2º segmento da rota (/inventario/<menu>); Divisões e Famílias ficam em Configurações (engrenagem). */
const sections = [
  { href: "/inventario/materiais", label: "Materiais", match: (path: string) => path.startsWith("/inventario/materiais") },
  { href: "/inventario/movimentacoes", label: "Movimentações", match: (path: string) => path.startsWith("/inventario/movimentacoes") },
];

export function AppHeader({ current, email, role, isAdmin }: { current: string; email: string; role: InventoryRole; isAdmin: boolean }) {
  return <SharedHeader brand={<Brand module="inventario" />} navigation={sections.map((item) => ({ href: item.href, label: item.label, active: item.match(current) }))}
    utilities={[
      ...(role === "viewer" ? [] : [{ href: "/inventario/rapido", label: "Registro rápido", icon: <IconBolt size={18} />, active: current.startsWith("/inventario/rapido") }]),
      { href: SETTINGS_HOME, label: "Configurações", icon: <IconSettings size={18} />, active: current.startsWith("/inventario/configuracoes") },
    ]}
    account={<UserMenu email={email} role={isAdmin ? "admin" : ROLE_LABELS[role]} logoutAction={logout}
      usersHref={isAdmin ? "/usuarios" : undefined} active={current === "/usuarios"} />} />;
}
