import { SectionTabs, type Crumb } from "@geas/ui";

export type SettingsTab = "divisoes" | "familias";

export const SETTINGS_LABELS: Record<SettingsTab, string> = { divisoes: "Divisões", familias: "Famílias" };

/** Primeira aba de Configurações (a raiz /inventario/configuracoes redireciona para ela). */
export const SETTINGS_HOME = "/inventario/configuracoes/divisoes";

/** Caminho das telas de Configurações: Início › Inventário › Configurações › aba. */
export function settingsCrumbs(current: SettingsTab): Crumb[] {
  return [
    { label: "Inventário", href: "/inventario" },
    { label: "Configurações", href: SETTINGS_HOME },
    { label: SETTINGS_LABELS[current] },
  ];
}

/**
 * Configurações do Inventário: Divisões e Famílias para todos (o gestor edita). Usuários e Importar são telas comuns,
 * no menu da conta (Administração).
 */
export function SettingsTabs({ current }: { current: SettingsTab }) {
  const tabs = (Object.keys(SETTINGS_LABELS) as SettingsTab[]).map((tab) => ({
    href: `/inventario/configuracoes/${tab}`,
    label: SETTINGS_LABELS[tab],
    active: tab === current,
  }));
  return <SectionTabs label="Configurações" tabs={tabs} />;
}
