import { Link } from "@geas/ui/components/link";
import logo from "./assets/logo.svg";
import logoDark from "./assets/logo-dark.svg";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "./lib/utils";
import { AppNavMenu } from "./components/app-nav-menu";
import { SectionTabsMenu } from "./components/section-tabs-menu";
import { displayCase } from "@geas/ui/lib/text";

/** Módulo atual; "gestao" = telas comuns (Início, Usuários), sem módulo. */
export type GeasApp = "gestao" | "financeiro" | "inventario" | "associados";
type GeasModule = Exclude<GeasApp, "gestao">;

type AppBrandProps = {
  current: GeasApp;
  /** Início do módulo atual (o rótulo leva para lá). */
  currentHref?: string;
  /** Destino do logo: o Início geral. */
  homeHref?: string;
  /** Início de cada módulo; sem o link, o módulo não aparece no seletor (pessoa sem acesso a ele). */
  financeiroHref?: string;
  inventarioHref?: string;
  associadosHref?: string;
  light?: boolean;
};

const APPS: Record<GeasApp, { label: string }> = {
  gestao: { label: "Gestão" },
  financeiro: { label: "Financeiro" },
  inventario: { label: "Inventário" },
  associados: { label: "Associados" },
};

/** Ordem dos módulos no seletor (o atual sobe para o topo). */
const MODULES: GeasModule[] = ["financeiro", "inventario", "associados"];
/** Distância vertical entre as opções do seletor, em px. */
const OPTION_STEP = 18;

/** Identidade comum e seletor de módulo. Ao passar o mouse, mostra os módulos empilhados (o atual em cima). */
export function AppBrand({
  current,
  currentHref = "/",
  homeHref = "/",
  financeiroHref,
  inventarioHref,
  associadosHref,
  light = false,
}: AppBrandProps) {
  const hrefs: Record<GeasModule, string | undefined> = { financeiro: financeiroHref, inventario: inventarioHref, associados: associadosHref };
  const available = MODULES.filter((app) => hrefs[app] !== undefined);
  const options = current === "gestao" ? available : [current, ...available.filter((app) => app !== current)];
  const middle = (options.length - 1) / 2;

  return <div className="geas-brand" data-theme={light ? "dark" : "light"}>
    <Link href={homeHref} className="geas-brand__logo" aria-label="Grupo Escoteiro Albert Schweitzer — Início">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={(light ? logoDark : logo).src} alt="Grupo Escoteiro Albert Schweitzer" width="210" height="60" />
    </Link>
    <div className="geas-brand__apps" aria-label="Trocar de módulo">
      <Link href={currentHref} className={cn("geas-brand__static", `geas-app--${current}`)}>{APPS[current].label}</Link>
      <div className="geas-brand__options">
        {options.map((app, index) => <a key={app} href={hrefs[app] ?? currentHref} aria-current={app === current ? "page" : undefined}
          style={{ "--geas-brand-shift": `${(index - middle) * OPTION_STEP}px` } as CSSProperties}
          className={cn("geas-brand__option", `geas-app--${app}`)}>{APPS[app].label}</a>)}
      </div>
    </div>
  </div>;
}

type AppLoginProps = AppBrandProps & {
  eyebrow: string;
  headline: string;
  description: string;
  protectedText?: string;
  children: ReactNode;
};

/** Estrutura comum das telas de acesso; cada app fornece somente conteúdo e formulário. */
export function AppLogin({ eyebrow, headline, description, protectedText = "Acesso protegido para a equipe do grupo", children, ...brand }: AppLoginProps) {
  return <main className={cn("geas-login", `geas-login--${brand.current}`)}>
    <section className="geas-login__story">
      <AppBrand {...brand} />
      <div className="geas-login__copy">
        <span className="geas-login__eyebrow">{eyebrow}</span>
        <h1>{headline}</h1>
        <p>{description}</p>
      </div>
      <small>{protectedText}</small>
    </section>
    <section className="geas-login__panel">
      <div className="geas-login__mobile-brand"><AppBrand {...brand} light /></div>
      <div className="geas-login__card">{children}</div>
    </section>
  </main>;
}

/** Acesso com a conta Google do e-mail cadastrado pelo administrador do grupo, comum aos apps. */
export function AppLoginForm({ error, googleHref }: { error?: string; googleHref: string }) {
  return <>
    <span className="geas-login__card-eyebrow">Área restrita</span><h2>Boas-vindas</h2>
    <p>Entre com a conta Google do e-mail que o administrador do grupo cadastrou para você.</p>
    <div className="geas-login__form">
      {error && <div className="geas-login__message geas-login__message--error" role="alert">{error}</div>}
      <a className="geas-login__button" href={googleHref}>Entrar com Google</a>
      <p className="geas-login__help">Ainda não possui acesso? Peça ao administrador do grupo para cadastrar seu e-mail.</p>
    </div>
  </>;
}

export type AppNavItem = { href: string; label: string; active: boolean };
/** Atalho de ícone à direita da navegação (ex.: Configurações); no menu do celular aparece por extenso. */
export type AppUtility = AppNavItem & { icon: ReactNode };

/**
 * Cabeçalho dos apps. Desktop (≥ 1024px): marca, áreas, utilitários e conta numa linha.
 * Telas menores: marca, conta e um botão de menu (AppNavMenu) com as áreas e os utilitários.
 */
export function AppHeader({ brand, navigation, utilities = [], account }: {
  brand: ReactNode;
  navigation: AppNavItem[];
  utilities?: AppUtility[];
  account: ReactNode;
}) {
  return <header className="geas-header">
    {brand}
    <nav className="geas-header__nav" aria-label="Navegação principal">
      {navigation.map((item) => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</Link>)}
      {utilities.length > 0 && <span className="geas-header__divider" aria-hidden />}
      {utilities.map((item) => <Link key={item.href} href={item.href} className="geas-header__utility" aria-label={item.label} title={item.label}
        aria-current={item.active ? "page" : undefined}>{item.icon}</Link>)}
    </nav>
    <div className="geas-header__end">
      {account}
      <AppNavMenu items={navigation} utilities={utilities.map(({ href, label, active }) => ({ href, label, active }))} />
    </div>
  </header>;
}

export function userInitials(email: string) {
  const parts = (email.split("@")[0] ?? "").split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export type AdminLink = { href: string; label: string; active?: boolean };

/**
 * Menu da conta: e-mail, papel, o grupo "Administração" (telas comuns a todos os módulos, como Usuários e Importar;
 * só os links que a pessoa pode abrir) e Sair. Fica destacado quando a tela atual é uma das de administração.
 */
export function UserMenu({ email, role, logoutAction, adminLinks = [] }: {
  email: string; /** Rótulo do papel (ex.: "Editor"). */ role?: string; logoutAction: () => Promise<void>; adminLinks?: AdminLink[];
}) {
  return <details className="geas-user-menu" data-active={adminLinks.some((link) => link.active) || undefined}>
    <summary aria-label={`Conta de ${email}`} title={email}><span>{userInitials(email)}</span></summary>
    <div className="geas-user-menu__content">
      <div className="geas-user-menu__identity"><strong>{email}</strong>{role && <small>{role}</small>}</div>
      {adminLinks.length > 0 && <div role="group" aria-labelledby="geas-user-menu-admin" className="geas-user-menu__group">
        <span id="geas-user-menu-admin" className="geas-user-menu__heading">Administração</span>
        {adminLinks.map((link) => <Link key={link.href} href={link.href} aria-current={link.active ? "page" : undefined}>{link.label}</Link>)}
      </div>}
      <form action={logoutAction}><button type="submit">Sair</button></form>
    </div>
  </details>;
}

export type Crumb = { label: ReactNode; href?: string };

/** Breadcrumbs no mesmo padrão: nomes cadastrados em maiúsculas aparecem capitalizados (`displayCase`). */
const crumbLabel = (label: ReactNode) => (typeof label === "string" ? displayCase(label) : label);

export function PageHeader({ title, description, crumbs, hideTitle, tabs, actions, children }: {
  title: ReactNode; description?: ReactNode; crumbs?: Crumb[]; hideTitle?: boolean;
  tabs?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  const path: Crumb[] = crumbs?.length ? [{ label: "Início", href: "/" }, ...crumbs] : [];
  return <div className="geas-page-header">
    {path.length > 0 && <nav className="geas-breadcrumbs" aria-label="Caminho"><ol>{path.map((crumb, index) => <li key={index}>
      {index > 0 && <span aria-hidden>›</span>}{crumb.href ? <Link href={crumb.href}>{crumbLabel(crumb.label)}</Link> : <strong aria-current="page">{crumbLabel(crumb.label)}</strong>}
    </li>)}</ol></nav>}
    <div className="geas-page-header__row">
      <h1 className={hideTitle ? "geas-sr-only" : undefined}>{title}</h1>{tabs}
      {actions && <div className="geas-page-header__actions">{actions}</div>}
    </div>
    {description && <p>{description}</p>}{children}
  </div>;
}

export type PageWidth = "full" | "narrow";
export function PageBody({ width = "full", className, ...props }: React.ComponentProps<"main"> & { width?: PageWidth }) {
  return <main className={cn("geas-page", `geas-page--${width}`, className)} {...props} />;
}

export type Tab = { href: string; label: string; active: boolean };

/** Abas de uma área, ao lado do título (Extrato: Conciliar/Importar; Configurações: Contas, Rubricas…).
 * Em telas pequenas, viram um botão com menu (SectionTabsMenu) em vez da linha de botões. */
export function SectionTabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  return <>
    <nav aria-label={label} className="hidden w-fit flex-wrap rounded-full bg-secondary p-0.5 sm:inline-flex">
      {tabs.map((tab) => <Link key={tab.href} href={tab.href} aria-current={tab.active ? "page" : undefined}
        className={cn("rounded-full px-3 py-1 text-xs font-semibold no-underline transition-colors",
          tab.active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{tab.label}</Link>)}
    </nav>
    <SectionTabsMenu tabs={tabs} label={label} className="sm:hidden" />
  </>;
}
