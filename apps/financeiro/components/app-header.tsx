import Link from "next/link";
import { IconSettings } from "@tabler/icons-react";
import { AppHeader as SharedHeader, UserMenu } from "@geas/ui";
import { logout } from "@/app/actions";
import { Brand } from "@/components/brand";

const sections = [
  { href: "/", label: "Início", match: (path: string) => path === "/" },
  { href: "/lancamentos/movimentacoes", label: "Lançamentos", match: (path: string) => path.startsWith("/lancamentos") },
  { href: "/extrato/conciliar", label: "Extrato", match: (path: string) => path.startsWith("/extrato") },
  { href: "/mensalidades", label: "Mensalidades", match: (path: string) => path.startsWith("/mensalidades") },
];

export const isSettingsPath = (path: string) => path.startsWith("/configuracoes");

export function AppHeader({ role, email, current }: { role: string; email: string; current: string }) {
  const settingsHref = role === "viewer" ? "/configuracoes/associados" : "/configuracoes";
  return <SharedHeader brand={<Brand />} navigation={sections.map((item) => ({ href:item.href, label:item.label, active:item.match(current) }))}
    utilities={<Link className="geas-header__utility" href={settingsHref} aria-label="Configurações" aria-current={isSettingsPath(current) ? "page" : undefined}><IconSettings size={18}/></Link>}
    account={<UserMenu email={email} role={role} logoutAction={logout} usersHref={role === "admin" ? "/usuarios" : undefined} active={current.startsWith("/usuarios")}/>}/>
}
