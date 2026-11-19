import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./lib/utils";
import { AppNavMenu } from "./components/app-nav-menu";
import { SectionTabsMenu } from "./components/section-tabs-menu";

/** Módulo atual; "gestao" = telas comuns (Início, Usuários), sem módulo. */
export type GeasApp = "gestao" | "financeiro" | "inventario" | "atividades";

type AppBrandProps = {
  current: GeasApp;
  /** Destino do logo: o Início geral. */
  homeHref?: string;
  /** Mantido por compatibilidade; o seletor usa financeiroHref / inventarioHref. */
  currentHref?: string;
  financeiroHref: string;
  inventarioHref: string;
  atividadesHref: string;
  light?: boolean;
};

/** Identidade comum e seletor: Inicial, Financeiro, Inventário e Atividades sempre visíveis. */
export function AppBrand({
  current,
  homeHref = "/",
  financeiroHref,
  inventarioHref,
  atividadesHref,
  light = false,
}: AppBrandProps) {
  const modules = [
    { id: "gestao" as const, label: "Inicial", href: homeHref },
    { id: "financeiro" as const, label: "Financeiro", href: financeiroHref },
    { id: "inventario" as const, label: "Inventário", href: inventarioHref },
    { id: "atividades" as const, label: "Atividades", href: atividadesHref },
  ];

  return <div className="geas-brand" data-theme={light ? "dark" : "light"}>
    <Link href={homeHref} className="geas-brand__logo" aria-label="Grupo Escoteiro Albert Schweitzer — Início">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={light ? "/images/logo-dark.svg" : "/images/logo.svg"} alt="Grupo Escoteiro Albert Schweitzer" width="210" height="60" />
    </Link>
    <nav className="geas-brand__apps" aria-label="Módulos">
      {modules.map((app) => <a
        key={app.id}
        href={app.href}
        aria-current={app.id === current ? "page" : undefined}
        className={cn("geas-brand__module", app.id === current && "geas-brand__module--current")}
      >{app.label}</a>)}
    </nav>
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

/** Formulário de acesso por código (OTP) enviado ao e-mail institucional, comum aos apps. */
export function AppLoginForm({ email, error, message, requestOtp, verifyOtp }: {
  email?: string; error?: string; message?: string;
  requestOtp: (formData: FormData) => Promise<void>; verifyOtp: (formData: FormData) => Promise<void>;
}) {
  return <>
    <span className="geas-login__card-eyebrow">Área restrita</span><h2>Boas-vindas</h2>
    <p>{email ? "Digite o código recebido. Ele expira em poucos minutos." : "Receba um código de acesso no seu e-mail institucional."}</p>
    <form className="geas-login__form" action={email ? verifyOtp : requestOtp}>
      {error && <div className="geas-login__message geas-login__message--error" role="alert">{error}</div>}
      {message && <div className="geas-login__message" role="status">{message}</div>}
      {email ? <>
        <input type="hidden" name="email" value={email} />
        <label className="geas-login__field">Código de acesso<input className="geas-login__token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} autoFocus required /></label>
        <button className="geas-login__button" type="submit">Confirmar código</button>
        <a className="geas-login__button geas-login__button--secondary" href="/login">Usar outro e-mail</a>
      </> : <>
        <label className="geas-login__field">E-mail<input name="email" type="email" pattern=".+@escoteirosalbert\.com\.br" placeholder="nome@escoteirosalbert.com.br" autoComplete="email" required /></label>
        <button className="geas-login__button" type="submit">Enviar código de acesso</button>
      </>}
      <p className="geas-login__help">Ainda não possui acesso? Solicite um convite ao administrador do grupo.</p>
    </form>
  </>;
}

export type AppNavItem = { href: string; label: string; active: boolean };
/** Atalho de ícone à direita da navegação (ex.: Configurações); no menu do celular aparece por extenso. */
export type AppUtility = AppNavItem & { icon: ReactNode };

/**
 * Cabeçalho dos apps: marca à esquerda, conta à direita.
 * `navigation` / `utilities` são opcionais (menu interno do módulo).
 */
export function AppHeader({ brand, navigation = [], utilities = [], account }: {
  brand: ReactNode;
  navigation?: AppNavItem[];
  utilities?: AppUtility[];
  account: ReactNode;
}) {
  const hasNav = navigation.length > 0 || utilities.length > 0;
  return <header className="geas-header">
    {brand}
    {/* Conta sempre por último à direita; o menu do módulo cresce para a esquerda dela. */}
    <div className="geas-header__end">
      {hasNav && <nav className="geas-header__nav" aria-label="Navegação principal">
        {navigation.map((item) => <Link key={item.href} href={item.href} aria-current={item.active ? "page" : undefined}>{item.label}</Link>)}
        {utilities.length > 0 && <span className="geas-header__divider" aria-hidden />}
        {utilities.map((item) => <Link key={item.href} href={item.href} className="geas-header__utility" aria-label={item.label} title={item.label}
          aria-current={item.active ? "page" : undefined}>{item.icon}</Link>)}
      </nav>}
      {hasNav && <AppNavMenu items={navigation} utilities={utilities.map(({ href, label, active }) => ({ href, label, active }))} />}
      {account}
    </div>
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

/** Mantido por compatibilidade nas telas que ainda passam `crumbs`; o caminho não é mais exibido. */
export type Crumb = { label: ReactNode; href?: string };

export function PageHeader({ title, description, hideTitle, tabs, actions, children }: {
  title: ReactNode; description?: ReactNode; crumbs?: Crumb[]; hideTitle?: boolean;
  tabs?: ReactNode; actions?: ReactNode; children?: ReactNode;
}) {
  return <div className="geas-page-header">
    <div className="geas-page-header__row">
      <h1 className={hideTitle ? "geas-sr-only" : undefined}>{title}</h1>{tabs}
      {actions && <div className="geas-page-header__actions">{actions}</div>}
    </div>
    {description && <p>{description}</p>}{children}
  </div>;
}

export type PageWidth = "full" | "narrow";
/** Corpo da página: `narrow` (padrão, até 72rem) como no inventário; `full` só quando a tela precisa da largura toda. */
export function PageBody({ width = "narrow", className = "", ...props }: React.ComponentProps<"main"> & { width?: PageWidth }) {
  return <main className={`geas-page geas-page--${width} ${className}`.trim()} {...props} />;
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
