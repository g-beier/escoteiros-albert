import { IconBolt, IconSettings } from "@tabler/icons-react";
import { AppHeader as SharedHeader, UserMenu } from "@geas/ui";
import { logout } from "@/app/(gestao)/login/actions";
import { Brand } from "@/components/shell/brand";
import { SETTINGS_HOME } from "@/components/inventory/settings-tabs";
import { roleLabel, type Member } from "@/lib/server/session";

/**
 * Menu = 2º segmento da rota (/inventario/<menu>); a raiz /inventario abre Materiais; Divisões e Famílias ficam em Configurações (engrenagem).
 * Registro rápido (raio, telas de celular) só para quem registra (Colaborador ou mais).
 */
const sections = [
  { href: "/inventario/materiais", label: "Materiais", match: (path: string) => path.startsWith("/inventario/materiais") },
  { href: "/inventario/movimentacoes", label: "Movimentações", match: (path: string) => path.startsWith("/inventario/movimentacoes") },
];

export function AppHeader({ current, member }: { current: string; member: Member }) {
  return <SharedHeader brand={<Brand module="inventario" />} navigation={sections.map((item) => ({ href: item.href, label: item.label, active: item.match(current) }))}
    utilities={[
      ...(member.inventory.canWrite ? [{ href: "/rapido", label: "Registro rápido", icon: <IconBolt size={18} />, active: false }] : []),
      { href: SETTINGS_HOME, label: "Configurações", icon: <IconSettings size={18} />, active: current.startsWith("/inventario/configuracoes") },
    ]}
    account={<UserMenu email={member.user.email} role={roleLabel(member.inventory)} logoutAction={logout}
      usersHref={member.managesUsers ? "/usuarios" : undefined} active={current === "/usuarios"} />} />;
}
