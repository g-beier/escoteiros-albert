import Link from "next/link";
import type { ReactNode } from "react";

export type GeasApp = "financeiro" | "inventario";

type AppBrandProps = {
  current: GeasApp;
  currentHref?: string;
  financeiroHref: string;
  inventarioHref: string;
  light?: boolean;
};

const APPS: Record<GeasApp, { label: string }> = {
  financeiro: { label: "Financeiro" },
  inventario: { label: "Inventário" },
};

/** Identidade comum e seletor dos aplicativos internos do GEAS. */
export function AppBrand({
  current,
  currentHref = "/",
  financeiroHref,
  inventarioHref,
  light = false,
}: AppBrandProps) {
  const other: GeasApp = current === "financeiro" ? "inventario" : "financeiro";
  const hrefs: Record<GeasApp, string> = {
    financeiro: current === "financeiro" ? currentHref : financeiroHref,
    inventario: current === "inventario" ? currentHref : inventarioHref,
  };

  return <div className="geas-brand" data-theme={light ? "dark" : "light"}>
    <Link href={currentHref} className="geas-brand__logo" aria-label={`Grupo Escoteiro Albert Schweitzer — ${APPS[current].label}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={light ? "/images/logo-dark.svg" : "/images/logo.svg"} alt="Grupo Escoteiro Albert Schweitzer" width="210" height="60" />
    </Link>
    <div className="geas-brand__apps" aria-label="Trocar de aplicativo">
      <Link href={currentHref} className={`geas-brand__static geas-app--${current}`}>{APPS[current].label}</Link>
      <div className="geas-brand__options">
        <Link href={hrefs[current]} className={`geas-brand__option geas-brand__option--current geas-app--${current}`} aria-current="page">{APPS[current].label}</Link>
        <a href={hrefs[other]} className={`geas-brand__option geas-brand__option--other geas-app--${other}`}>{APPS[other].label}</a>
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
  return <main className={`geas-login geas-login--${brand.current}`}>
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

export type AppNavItem = { href: string; label: string; active: boolean };

export function AppHeader({ brand, navigation, utilities, account }: {
  brand: ReactNode;
  navigation: AppNavItem[];
  utilities?: ReactNode;
  account: ReactNode;
}) {
  return <header className="geas-header">
    {brand}
    <nav className="geas-header__nav" aria-label="Navegação principal">
      {navigation.map((item) => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</Link>)}
      {utilities && <><span className="geas-header__divider" aria-hidden />{utilities}</>}
      {account}
    </nav>
  </header>;
}

const ROLE_LABELS: Record<string, string> = { admin: "Administração", treasurer: "Tesouraria", viewer: "Consulta" };

export function userInitials(email: string) {
  const parts = (email.split("@")[0] ?? "").split(/[._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function UserMenu({ email, role, logoutAction, usersHref, active = false }: {
  email: string; role: string; logoutAction: () => Promise<void>; usersHref?: string; active?: boolean;
}) {
  return <details className="geas-user-menu" data-active={active || undefined}>
    <summary aria-label={`Conta de ${email}`} title={email}><span>{userInitials(email)}</span></summary>
    <div className="geas-user-menu__content">
      <div className="geas-user-menu__identity"><strong>{email}</strong><small>{ROLE_LABELS[role] ?? role}</small></div>
      {usersHref && <Link href={usersHref}>Usuários</Link>}
      <form action={logoutAction}><button type="submit">Sair</button></form>
    </div>
  </details>;
}

export type Crumb = { label: ReactNode; href?: string };

export function PageHeader({ title, description, crumbs, hideTitle, tabs, actions, children }: {
  title: ReactNode; description?: ReactNode; crumbs?: Crumb[]; hideTitle?: boolean;
  tabs?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  const path: Crumb[] = crumbs?.length ? [{ label: "Início", href: "/" }, ...crumbs] : [];
  return <div className="geas-page-header">
    {path.length > 0 && <nav className="geas-breadcrumbs" aria-label="Caminho"><ol>{path.map((crumb, index) => <li key={index}>
      {index > 0 && <span aria-hidden>›</span>}{crumb.href ? <Link href={crumb.href}>{crumb.label}</Link> : <strong aria-current="page">{crumb.label}</strong>}
    </li>)}</ol></nav>}
    <div className="geas-page-header__row">
      <h1 className={hideTitle ? "geas-sr-only" : undefined}>{title}</h1>{tabs}
      {actions && <div className="geas-page-header__actions">{actions}</div>}
    </div>
    {description && <p>{description}</p>}{children}
  </div>;
}

export type PageWidth = "full" | "narrow";
export function PageBody({ width = "full", className = "", ...props }: React.ComponentProps<"main"> & { width?: PageWidth }) {
  return <main className={`geas-page geas-page--${width} ${className}`.trim()} {...props} />;
}

export function PageTitle({ eyebrow, title, actions, description }: { eyebrow?: ReactNode; title: ReactNode; actions?: ReactNode; description?: ReactNode }) {
  return <div className="geas-page-title"><div>{eyebrow && <span>{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="geas-page-title__actions">{actions}</div>}</div>;
}
