import { AppHeader as SharedHeader, UserMenu } from "@geas/ui";
import { logout } from "@/app/actions";
import { Brand } from "@/components/brand";

const sections = [
  { href:"/", label:"Visão geral" }, { href:"/itens", label:"Itens" },
  { href:"/locais", label:"Locais" }, { href:"/movimentacoes", label:"Movimentações" },
];

export function AppHeader({ current, email, role = "viewer" }: { current: string; email: string; role?: string }) {
  return <SharedHeader brand={<Brand />} navigation={sections.map((item) => ({ ...item, active:current === item.href }))}
    account={<UserMenu email={email} role={role} logoutAction={logout}/>}/>
}
