import { IconBolt, IconSettings } from "@tabler/icons-react";
import { AppHeader as SharedHeader } from "@geas/ui";
import { AccountMenu } from "@/components/shell/account-menu";
import { Brand } from "@/components/shell/brand";
import { roleLabel, type Member } from "@/lib/server/session";

/** Configurações do módulo (engrenagem): seções e equipes, itens de controle. */
export const ASSOCIATES_SETTINGS_HOME = "/associados/configuracoes/secoes";
const isSettingsPath = (path: string) => path.startsWith("/associados/configuracoes");

/** Menu = 2º segmento da rota (/associados/<menu>); a lista é a raiz do módulo. */
const isControlPath = (path: string) => path.startsWith("/associados/controle");
/** Visão do grupo e a linha do tempo de cada um (/associados/<id>/vida-escoteira). */
const isLifePath = (path: string) => path.startsWith("/associados/vida-escoteira") || path.endsWith("/vida-escoteira");
const sections = [
  { href: "/associados", label: "Associados", match: (path: string) => path.startsWith("/associados") && !isSettingsPath(path) && !isControlPath(path) && !isLifePath(path) },
  { href: "/associados/vida-escoteira", label: "Vida escoteira", match: isLifePath },
  { href: "/associados/controle", label: "Controle de dados", match: isControlPath },
];

export function AppHeader({ current, member }: { current: string; member: Member }) {
  return <SharedHeader brand={<Brand module="associados" />} navigation={sections.map((item) => ({ href: item.href, label: item.label, active: item.match(current) }))}
    utilities={[
      // Registro rápido (raio) para quem cadastra (Colaborador ou mais), como no Inventário e no Financeiro
      ...(member.associates.canWrite ? [{ href: "/rapido", label: "Registro rápido", icon: <IconBolt size={18} />, active: false }] : []),
      { href: ASSOCIATES_SETTINGS_HOME, label: "Configurações", icon: <IconSettings size={18} />, active: isSettingsPath(current) },
    ]}
    account={<AccountMenu member={member} role={roleLabel(member.associates)} current={current} />} />;
}
