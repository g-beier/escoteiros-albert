import { SectionTabs, type Crumb } from "@geas/ui";
import { ASSOCIATES_SETTINGS_HOME } from "@/components/associates/app-header";

export type SettingsTab = "secoes" | "itens" | "importar";

export const SETTINGS_LABELS: Record<SettingsTab, string> = { secoes: "Seções e equipes", itens: "Itens de controle", importar: "Importar" };

/** Caminho das telas de Configurações: Início › Associados › Configurações › aba. */
export function settingsCrumbs(current: SettingsTab): Crumb[] {
  return [{ label: "Associados", href: "/associados" }, { label: "Configurações", href: ASSOCIATES_SETTINGS_HOME }, { label: SETTINGS_LABELS[current] }];
}

/** Configurações do Associados: Seções e equipes e Itens de controle para todos (quem edita altera); Importar só para quem edita. */
export function SettingsTabs({ current, canEdit }: { current: SettingsTab; canEdit: boolean }) {
  const tabs = (Object.keys(SETTINGS_LABELS) as SettingsTab[])
    .filter((tab) => canEdit || tab !== "importar")
    // Importar é a tela comum /importar (CSVs de todos os módulos)
    .map((tab) => ({ href: tab === "importar" ? "/importar" : `/associados/configuracoes/${tab}`, label: SETTINGS_LABELS[tab], active: tab === current }));
  return <SectionTabs label="Configurações" tabs={tabs} />;
}
