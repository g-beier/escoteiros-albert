import { IconSettings } from "@tabler/icons-react";
import { AppHeader as SharedHeader, UserMenu } from "@geas/ui";
import { logout } from "@/app/(gestao)/login/actions";
import { Brand } from "@/components/shell/brand";

const sections = [
  { href: "/financeiro", label: "Resumo", match: (path: string) => path === "/financeiro" },
  { href: "/financeiro/lancamentos/movimentacoes", label: "Lançamentos", match: (path: string) => path.startsWith("/financeiro/lancamentos") },
  { href: "/financeiro/extrato/conciliar", label: "Extrato", match: (path: string) => path.startsWith("/financeiro/extrato") },
  { href: "/financeiro/mensalidades/controle", label: "Mensalidades", match: (path: string) => path.startsWith("/financeiro/mensalidades") },
];

export const isSettingsPath = (path: string) => path.startsWith("/financeiro/configuracoes");

export function AppHeader({ role, email, current }: { role: string; email: string; current: string }) {
  const settingsHref = role === "viewer" ? "/financeiro/configuracoes/associados" : "/financeiro/configuracoes";
  return <SharedHeader brand={<Brand module="financeiro" />} navigation={sections.map((item) => ({ href:item.href, label:item.label, active:item.match(current) }))}
    utilities={[{ href: settingsHref, label: "Configurações", icon: <IconSettings size={18} />, active: isSettingsPath(current) }]}
    account={<UserMenu email={email} role={role} logoutAction={logout} usersHref={role === "admin" ? "/usuarios" : undefined} active={current.startsWith("/usuarios")}/>}/>
}
