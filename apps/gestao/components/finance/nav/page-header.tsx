import type { ComponentProps } from "react";
import { PageHeader as SharedPageHeader, SectionTabs, type Crumb, type Tab } from "@geas/ui";

export { PageBody, SectionTabs } from "@geas/ui";

const MODULE_CRUMB: Crumb = { label: "Financeiro", href: "/financeiro" };

/** Cabeçalho das telas do Financeiro: o caminho ganha "Financeiro" logo depois de Início. */
export function PageHeader({ crumbs, ...props }: ComponentProps<typeof SharedPageHeader>) {
  return <SharedPageHeader {...props} crumbs={crumbs?.length ? [MODULE_CRUMB, ...crumbs] : crumbs} />;
}
export type { Crumb, PageWidth, Tab } from "@geas/ui";

export type EntryView = "movimentacoes" | "detalhamento" | "realizado";

/** Visões de Lançamentos. `hrefs` permite levar os filtros da lista de uma visão para a outra. */
export function EntryViewTabs({ current, hrefs }: { current: EntryView; hrefs?: Partial<Record<EntryView, string>> }) {
  const href = (view: EntryView) => hrefs?.[view] ?? `/financeiro/lancamentos/${view}`;
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
    { href: `/financeiro/extrato/conciliar${query}`, label: "Conciliar", active: current === "conciliar" },
    { href: `/financeiro/extrato/importar${query}`, label: "Importar", active: current === "importar" },
  ]} />;
}

export type FeeTab = "controle" | "devedores";

/** Área de Mensalidades: o controle do ano e as anotações de dívidas. */
export function FeeTabs({ current }: { current: FeeTab }) {
  return <SectionTabs label="Mensalidades" tabs={[
    { href: "/financeiro/mensalidades/controle", label: "Controle", active: current === "controle" },
    { href: "/financeiro/mensalidades/devedores", label: "Devedores", active: current === "devedores" },
  ]} />;
}

/** Caminho das telas de Mensalidades: Início › Mensalidades › Controle/Devedores. */
export function feeCrumbs(current: FeeTab): Crumb[] {
  return [{ label: "Mensalidades", href: "/financeiro/mensalidades/controle" }, { label: current === "controle" ? "Controle" : "Devedores" }];
}

export type SettingsTab = "contas" | "rubricas" | "formas" | "perfis" | "associados" | "mensalidades";

export const SETTINGS_LABELS: Record<SettingsTab, string> = {
  contas: "Contas", rubricas: "Rubricas", formas: "Formas de pagamento", perfis: "Perfis de leitura", associados: "Associados", mensalidades: "Mensalidades",
};

/** Caminho das telas de Configurações: Início › Configurações › aba. */
export function settingsCrumbs(current: SettingsTab, canEdit: boolean): Crumb[] {
  return [{ label: "Configurações", href: canEdit ? "/financeiro/configuracoes" : "/financeiro/configuracoes/associados" }, { label: SETTINGS_LABELS[current] }];
}

/** Caminho das telas do Extrato: Início › Extrato › Conciliar/Importar. */
export function extratoCrumbs(current: "conciliar" | "importar"): Crumb[] {
  return [{ label: "Extrato", href: "/financeiro/extrato/conciliar" }, { label: current === "conciliar" ? "Conciliar" : "Importar" }];
}

/** Configurações: cadastros do grupo. Consulta vê só Associados. */
export function SettingsTabs({ current, canEdit }: { current: SettingsTab; canEdit: boolean }) {
  const tabs: Tab[] = [
    ...(canEdit ? [
      { href: "/financeiro/configuracoes/contas", label: "Contas", active: current === "contas" },
      { href: "/financeiro/configuracoes/rubricas", label: "Rubricas", active: current === "rubricas" },
      { href: "/financeiro/configuracoes/formas", label: "Formas de pagamento", active: current === "formas" },
      { href: "/financeiro/configuracoes/perfis", label: "Perfis de leitura", active: current === "perfis" },
    ] : []),
    { href: "/financeiro/configuracoes/associados", label: "Associados", active: current === "associados" },
    ...(canEdit ? [{ href: "/financeiro/configuracoes/mensalidades", label: "Mensalidades", active: current === "mensalidades" }] : []),
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
