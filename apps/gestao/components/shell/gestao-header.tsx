import { AppHeader, UserMenu } from "@geas/ui";
import { logout } from "@/app/(gestao)/login/actions";
import { Brand } from "@/components/shell/brand";

const sections = [
  { href: "/", label: "Início", match: (path: string) => path === "/" },
  { href: "/financeiro", label: "Financeiro", match: () => false },
  { href: "/inventario", label: "Inventário", match: () => false },
  { href: "/associados", label: "Associados", match: () => false },
];

/** Cabeçalho das telas comuns (Início, Usuários): os módulos no menu; o papel mostrado é o do grupo. */
export function GestaoHeader({ current, email, role, isAdmin }: { current: string; email: string; role: string; isAdmin: boolean }) {
  return <AppHeader brand={<Brand module="gestao" />} navigation={sections.map((item) => ({ href: item.href, label: item.label, active: item.match(current) }))}
    account={<UserMenu email={email} role={role} logoutAction={logout} usersHref={isAdmin ? "/usuarios" : undefined} active={current === "/usuarios"} />} />;
}
