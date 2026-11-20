import { IconBolt } from "@tabler/icons-react";
import { AppHeader, UserMenu } from "@geas/ui";
import { logout } from "@/app/(gestao)/login/actions";
import { Brand } from "@/components/shell/brand";

const sections = [
  { href: "/", label: "Início", match: (path: string) => path === "/" },
  { href: "/financeiro", label: "Financeiro", match: () => false },
  { href: "/inventario", label: "Inventário", match: () => false },
  { href: "/associados", label: "Associados", match: () => false },
];

/**
 * Cabeçalho das telas comuns (Início, Registro rápido, Usuários): os módulos no menu; o papel mostrado é o do grupo.
 * `quick`: mostra o atalho do registro rápido (quem edita algum módulo).
 */
export function GestaoHeader({ current, email, role, isAdmin, quick = false }: { current: string; email: string; role: string; isAdmin: boolean; quick?: boolean }) {
  return <AppHeader brand={<Brand module="gestao" />} navigation={sections.map((item) => ({ href: item.href, label: item.label, active: item.match(current) }))}
    utilities={quick ? [{ href: "/rapido", label: "Registro rápido", icon: <IconBolt size={18} />, active: current.startsWith("/rapido") }] : undefined}
    account={<UserMenu email={email} role={role} logoutAction={logout} usersHref={isAdmin ? "/usuarios" : undefined} active={current === "/usuarios"} />} />;
}
