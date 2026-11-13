import Link from "next/link";
import type { Crumb } from "@geas/ui";
import { cn } from "@/lib/utils";

export { PageBody, PageHeader } from "@geas/ui";
export type { Crumb, PageWidth } from "@geas/ui";

export type Tab = { href: string; label: string; active: boolean };

/** Abas de uma área (Extrato: Conciliar/Importar; Configurações: Contas, Rubricas…). */
export function SectionTabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  return <nav aria-label={label} className="inline-flex w-fit flex-wrap rounded-full bg-secondary p-0.5">
    {tabs.map((tab) => <Link key={tab.href} href={tab.href} aria-current={tab.active ? "page" : undefined}
      className={cn("rounded-full px-3 py-1 text-xs font-semibold no-underline transition-colors",
        tab.active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>{tab.label}</Link>)}
  </nav>;
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
export const PAGE_BODY = "geas-page geas-page--full";

/**
 * Larguras do corpo: `full` (padrão, fluida) para listas largas como Lançamentos e Extrato;
 * `narrow` (centralizada, até 72rem + margens) para cadastros e telas que não ganham com mais largura.
 * O cabeçalho acompanha o corpo, então todas as abas de uma área usam a mesma largura (sem saltos).
 * Numa área larga com uma aba estreita (Extrato › Importar), o cabeçalho fica largo e só o conteúdo
 * estreita, com `NARROW_CONTENT`.
 */
export const NARROW_CONTENT = "mx-auto w-full max-w-6xl";
