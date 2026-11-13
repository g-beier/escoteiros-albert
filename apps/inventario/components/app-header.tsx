import { AppHeader as SharedHeader, UserMenu } from "@geas/ui";
import { logout } from "@/app/actions";
import { Brand } from "@/components/brand";

const sections = [
  { href: "/", label: "Início" }, { href: "/itens", label: "Itens" },
  { href: "/locais", label: "Locais" }, { href: "/movimentacoes", label: "Movimentações" },
];

export function AppHeader({ current, email, role }: { current: string; email: string; role: string }) {
  return <SharedHeader brand={<Brand />} navigation={sections.map((item) => ({ ...item, active: current === item.href }))}
    account={<UserMenu email={email} role={role} logoutAction={logout} />} />;
}
