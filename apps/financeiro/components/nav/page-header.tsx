import Link from "next/link";
import { cn } from "@/lib/utils";

export type Tab = { href: string; label: string; active: boolean };

/** Abas de uma área (Extrato: Conciliar/Importar; Configurações: Contas, Rubricas…). */
export function SectionTabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  return <nav aria-label={label} className="inline-flex w-fit flex-wrap rounded-full bg-secondary p-0.5">
    {tabs.map((tab) => <Link key={tab.href} href={tab.href} aria-current={tab.active ? "page" : undefined}
      className={cn("rounded-full px-3 py-1 text-xs font-semibold no-underline transition-colors",
        tab.active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{tab.label}</Link>)}
  </nav>;
}

/** Item do caminho; sem `href`, é a tela atual (último item). */
export type Crumb = { label: React.ReactNode; href?: string };

/** Caminho da tela, sempre começando no Início. Os links de volta levam os filtros de onde se veio. */
function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  const items: Crumb[] = [{ label: "Início", href: "/" }, ...crumbs];
  return <nav aria-label="Caminho" className="flex h-5 min-w-0 items-center text-xs">
    <ol className="m-0 flex min-w-0 list-none items-center gap-1.5 p-0">
      {items.map((crumb, index) => <li key={index} className="flex min-w-0 items-center gap-1.5">
        {index > 0 && <span aria-hidden className="text-muted-foreground/70">›</span>}
        {crumb.href
          ? <Link href={crumb.href} className="shrink-0 font-medium text-muted-foreground no-underline hover:text-foreground hover:underline">{crumb.label}</Link>
          : <span aria-current="page" className="min-w-0 truncate font-semibold text-foreground">{crumb.label}</span>}
      </li>)}
    </ol>
  </nav>;
}

/**
 * Cabeçalho comum das telas: caminho (breadcrumbs), título, abas da área, descrição e ações à direita.
 * Mesmo formato compacto em todas as telas; o título fica no mesmo lugar em todas.
 */
export function PageHeader({ title, description, crumbs, hideTitle, tabs, actions, children }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Caminho depois do Início, terminando na tela atual (sem href). Omitido só no Início. */
  crumbs?: Crumb[];
  /** Título só para leitores de tela (Início: a linha mostra apenas as ações à direita). */
  hideTitle?: boolean;
  tabs?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return <div className="grid gap-2">
    {crumbs?.length ? <Breadcrumbs crumbs={crumbs} /> : null}
    {/* altura mínima fixa: o título fica na mesma posição com ou sem abas e botões ao lado */}
    <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-2">
      <h1 className={cn("m-0 min-w-0 text-xl leading-tight font-bold tracking-tight break-words", hideTitle && "sr-only")}>{title}</h1>
      {tabs}
      {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {description && <p className="m-0 max-w-3xl text-xs text-muted-foreground">{description}</p>}
    {children}
  </div>;
}

export type EntryView = "movimentacoes" | "detalhamento" | "realizado";

/** Visões de Lançamentos. `hrefs` permite levar os filtros da lista de uma visão para a outra. */
export function EntryViewTabs({ current, hrefs }: { current: EntryView; hrefs?: Partial<Record<EntryView, string>> }) {
  const href = (view: EntryView) => hrefs?.[view] ?? `/lancamentos/${view}`;
  return <SectionTabs label="Visões" tabs={[
    { href: href("movimentacoes"), label: "Movimentações", active: current === "movimentacoes" },
    { href: href("detalhamento"), label: "Detalhamento", active: current === "detalhamento" },
    { href: href("realizado"), label: "Realizado", active: current === "realizado" },
  ]} />;
}

/** Área do Extrato: a mesma conta segue de uma aba para a outra. */
export function ExtratoTabs({ current, accountId }: { current: "conciliar" | "importar"; accountId?: string }) {
  const query = accountId ? `?conta=${encodeURIComponent(accountId)}` : "";
  return <SectionTabs label="Extrato" tabs={[
    { href: `/extrato/conciliar${query}`, label: "Conciliar", active: current === "conciliar" },
    { href: `/extrato/importar${query}`, label: "Importar", active: current === "importar" },
  ]} />;
}

export type SettingsTab = "contas" | "rubricas" | "formas" | "perfis" | "associados" | "mensalidades";

export const SETTINGS_LABELS: Record<SettingsTab, string> = {
  contas: "Contas", rubricas: "Rubricas", formas: "Formas de pagamento", perfis: "Perfis de leitura", associados: "Associados", mensalidades: "Mensalidades",
};

/** Caminho das telas de Configurações: Início › Configurações › aba. */
export function settingsCrumbs(current: SettingsTab, canEdit: boolean): Crumb[] {
  return [{ label: "Configurações", href: canEdit ? "/configuracoes" : "/configuracoes/associados" }, { label: SETTINGS_LABELS[current] }];
}

/** Caminho das telas do Extrato: Início › Extrato › Conciliar/Importar. */
export function extratoCrumbs(current: "conciliar" | "importar"): Crumb[] {
  return [{ label: "Extrato", href: "/extrato/conciliar" }, { label: current === "conciliar" ? "Conciliar" : "Importar" }];
}

/** Configurações: cadastros do grupo. Consulta vê só Associados. */
export function SettingsTabs({ current, canEdit }: { current: SettingsTab; canEdit: boolean }) {
  const tabs: Tab[] = [
    ...(canEdit ? [
      { href: "/configuracoes/contas", label: "Contas", active: current === "contas" },
      { href: "/configuracoes/rubricas", label: "Rubricas", active: current === "rubricas" },
      { href: "/configuracoes/formas", label: "Formas de pagamento", active: current === "formas" },
      { href: "/configuracoes/perfis", label: "Perfis de leitura", active: current === "perfis" },
    ] : []),
    { href: "/configuracoes/associados", label: "Associados", active: current === "associados" },
    ...(canEdit ? [{ href: "/configuracoes/mensalidades", label: "Mensalidades", active: current === "mensalidades" }] : []),
  ];
  return <SectionTabs label="Configurações" tabs={tabs} />;
}

/**
 * Corpo das telas: o mesmo contêiner (largura total, margens de 16px) em todas, alinhado ao header,
 * para não haver saltos de largura ao navegar. O conteúdo pode não ocupar tudo.
 */
export const PAGE_BODY = "grid w-full content-start gap-5 px-4 pt-4 pb-6";

export function PageBody({ className, ...props }: React.ComponentProps<"main">) {
  return <main className={cn(PAGE_BODY, className)} {...props} />;
}
