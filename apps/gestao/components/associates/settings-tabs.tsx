import { SectionTabs, type Crumb } from "@geas/ui";
import { ASSOCIATES_SETTINGS_HOME } from "@/components/associates/app-header";

export type SettingsTab = "secoes" | "itens" | "excluidos";

export const SETTINGS_LABELS: Record<SettingsTab, string> = { secoes: "Seções e equipes", itens: "Itens de controle", excluidos: "Excluídos" };

/** Caminho das telas de Configurações: Início › Associados › Configurações › aba. */
export function settingsCrumbs(current: SettingsTab): Crumb[] {
  return [{ label: "Associados", href: "/associados" }, { label: "Configurações", href: ASSOCIATES_SETTINGS_HOME }, { label: SETTINGS_LABELS[current] }];
}

/**
 * Configurações do Associados: Seções e equipes e Itens de controle para todos (quem edita altera); Excluídos
 * (quarentena, 018) só para o Editor (`canReview`). Importar é tela comum a todos os módulos, no menu da conta
 * (Administração).
 */
export function SettingsTabs({ current, canReview = false }: { current: SettingsTab; canReview?: boolean }) {
  const tabs = (Object.keys(SETTINGS_LABELS) as SettingsTab[])
    .filter((tab) => tab !== "excluidos" || canReview)
    .map((tab) => ({ href: `/associados/configuracoes/${tab}`, label: SETTINGS_LABELS[tab], active: tab === current }));
  return <SectionTabs label="Configurações" tabs={tabs} />;
}
