import { SectionTabs, type Crumb } from "@geas/ui";

export type SettingsTab = "divisoes" | "familias" | "usuarios";

export const SETTINGS_LABELS: Record<SettingsTab, string> = { divisoes: "Divisões", familias: "Famílias", usuarios: "Usuários" };

/** Primeira aba de Configurações (a raiz /configuracoes redireciona para ela). */
export const SETTINGS_HOME = "/configuracoes/divisoes";

/** Caminho das telas de Configurações: Início › Configurações › aba. */
export function settingsCrumbs(current: SettingsTab): Crumb[] {
  return [{ label: "Configurações", href: SETTINGS_HOME }, { label: SETTINGS_LABELS[current] }];
}

/** Configurações do Inventário: Divisões e Famílias para todos (o gestor edita); Usuários só para o administrador do grupo. */
export function SettingsTabs({ current, isAdmin }: { current: SettingsTab; isAdmin: boolean }) {
  const tabs = (["divisoes", "familias", ...(isAdmin ? ["usuarios" as const] : [])] as SettingsTab[])
    .map((tab) => ({ href: `/configuracoes/${tab}`, label: SETTINGS_LABELS[tab], active: tab === current }));
  return <SectionTabs label="Configurações" tabs={tabs} />;
}
