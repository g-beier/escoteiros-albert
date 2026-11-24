import { SectionTabs, type Crumb } from "@geas/ui";

export type SettingsTab = "divisoes" | "familias";

export const SETTINGS_LABELS: Record<SettingsTab, string> = { divisoes: "Divisões", familias: "Famílias" };

/** Primeira aba de Configurações (a raiz /inventario/configuracoes redireciona para ela). */
export const SETTINGS_HOME = "/inventario/configuracoes/divisoes";

/** Caminho das telas de Configurações: Início › Inventário › Configurações › aba. */
export function settingsCrumbs(current: SettingsTab): Crumb[] {
  return [{ label: "Inventário", href: "/inventario" }, { label: "Configurações", href: SETTINGS_HOME }, { label: SETTINGS_LABELS[current] }];
}

/**
 * Configurações do Inventário: Divisões e Famílias para todos (o gestor edita). Usuários é a tela comum /usuarios;
 * Importar (só editores, `canImport`) é a tela comum /importar.
 */
export function SettingsTabs({ current, canImport = false }: { current: SettingsTab; canImport?: boolean }) {
  const tabs = (Object.keys(SETTINGS_LABELS) as SettingsTab[])
    .map((tab) => ({ href: `/inventario/configuracoes/${tab}`, label: SETTINGS_LABELS[tab], active: tab === current }));
  if (canImport) tabs.push({ href: "/importar", label: "Importar", active: false });
  return <SectionTabs label="Configurações" tabs={tabs} />;
}
