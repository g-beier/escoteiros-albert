import { IconBolt, IconSettings } from "@tabler/icons-react";
import { AppHeader as SharedHeader } from "@geas/ui";
import { AccountMenu } from "@/components/shell/account-menu";
import { Brand } from "@/components/shell/brand";
import { roleLabel, type Member } from "@/lib/server/session";

const sections = [
  { href: "/financeiro", label: "Resumo", match: (path: string) => path === "/financeiro" },
  { href: "/financeiro/lancamentos/movimentacoes", label: "Lançamentos", match: (path: string) => path.startsWith("/financeiro/lancamentos") },
  { href: "/financeiro/extrato/conciliar", label: "Extrato", match: (path: string) => path.startsWith("/financeiro/extrato") },
  { href: "/financeiro/mensalidades/controle", label: "Mensalidades", match: (path: string) => path.startsWith("/financeiro/mensalidades") },
];

export const isSettingsPath = (path: string) => path.startsWith("/financeiro/configuracoes");

/** Registro rápido (raio) para quem lança (Colaborador ou mais); Configurações (engrenagem) só para quem as mantém: Editor ou mais. */
export function AppHeader({ member, current }: { member: Member; current: string }) {
  return <SharedHeader brand={<Brand module="financeiro" />} navigation={sections.map((item) => ({ href:item.href, label:item.label, active:item.match(current) }))}
    utilities={[
      ...(member.finance.canWrite ? [{ href: "/rapido", label: "Registro rápido", icon: <IconBolt size={18} />, active: false }] : []),
      ...(member.finance.canReview ? [{ href: "/financeiro/configuracoes", label: "Configurações", icon: <IconSettings size={18} />, active: isSettingsPath(current) }] : []),
    ]}
    account={<AccountMenu member={member} role={roleLabel(member.finance)} current={current} />}/>
}
