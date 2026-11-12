import Link from "next/link";
import { IconSettings } from "@tabler/icons-react";
import { Brand } from "@/components/brand";
import { UserMenu } from "@/components/nav/user-menu";
import { cn } from "@/lib/utils";

/**
 * Navegação principal: Início · Lançamentos · Extrato (conciliar e importar) · Mensalidades.
 * Configurações (contas, rubricas, formas de pagamento, associados) na engrenagem; email, Usuários e Sair no menu da pessoa.
 */
const SECTIONS = [
  { href: "/", label: "Início", match: (path: string) => path === "/" },
  { href: "/lancamentos", label: "Lançamentos", match: (path: string) => path.startsWith("/lancamentos") },
  { href: "/conciliacao", label: "Extrato", match: (path: string) => path.startsWith("/conciliacao") || path.startsWith("/importacao") },
  { href: "/mensalidades", label: "Mensalidades", match: (path: string) => path.startsWith("/mensalidades") },
];

export const isSettingsPath = (path: string) => path.startsWith("/cadastros") || path.startsWith("/associados");

/** Mesma largura em todas as telas (largura total, margens de 16px), como o corpo das páginas. */
export function AppHeader({ role, email, current }: { role: string; email: string; current: string }) {
  const settingsActive = isSettingsPath(current);
  return <header className="sticky top-0 z-5 flex min-h-(--topbar-h) items-center justify-between border-b border-[#e8e3dc] bg-[color-mix(in_srgb,var(--surface)_96%,transparent)] px-4 py-2 text-foreground backdrop-blur-[12px] max-[760px]:flex-wrap max-[760px]:gap-x-3 max-[760px]:gap-y-1.5 max-[760px]:py-2.5">
    <Brand />
    <nav className="flex items-center gap-1 sm:gap-2" aria-label="Navegação principal">
      {SECTIONS.map((section) => {
        const active = section.match(current);
        return <Link key={section.href} href={section.href} aria-current={active ? "page" : undefined}
          className={cn("rounded-full px-2.5 py-1.5 text-sm font-semibold no-underline transition-colors sm:px-3",
            active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>{section.label}</Link>;
      })}
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <Link href={role === "viewer" ? "/associados" : "/cadastros"} aria-label="Configurações" title="Configurações: contas, rubricas, formas de pagamento e associados"
        aria-current={settingsActive ? "page" : undefined}
        className={cn("grid size-8 place-items-center rounded-full transition-colors", settingsActive ? "bg-foreground text-background" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
        <IconSettings className="size-[18px]" aria-hidden />
      </Link>
      <UserMenu email={email} role={role} active={current.startsWith("/usuarios")} />
    </nav>
  </header>;
}
