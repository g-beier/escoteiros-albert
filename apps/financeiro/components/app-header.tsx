import Link from "next/link";
import { logout } from "@/app/actions";
import { Brand } from "@/components/brand";
import { canManageEntries } from "@/lib/auth";

const links = [
  { href: "/", label: "Início", show: () => true },
  { href: "/lancamentos", label: "Lançamentos", show: () => true },
  { href: "/conciliacao", label: "Conciliação", show: () => true },
  { href: "/associados", label: "Associados", show: () => true },
  { href: "/cadastros", label: "Cadastros", show: (role: string) => canManageEntries(role) },
  { href: "/usuarios", label: "Usuários", show: (role: string) => role === "admin" },
];

export function AppHeader({ role, email, current, wide = false }: { role: string; email: string; current: string; wide?: boolean }) {
  return <header className={wide ? "topbar topbar-wide" : "topbar"}><Brand /><nav className="nav-actions" aria-label="Navegação principal">
    {links.filter((link) => link.href !== current && link.show(role)).map((link) => <Link key={link.href} href={link.href}>{link.label}</Link>)}
    <span className="nav-email">{email}</span>
    <form action={logout}><button className="link-button">Sair</button></form>
  </nav></header>;
}
