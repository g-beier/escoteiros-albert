import { AppHeader as SharedHeader, UserMenu } from "@geas/ui";
import { logout } from "@/app/(gestao)/login/actions";
import { Brand } from "@/components/shell/brand";
import { ACTIVITIES_ROLE_LABELS, type ActivitiesRole } from "@/lib/activities/vocabulary";

const sections = [
  { href: "/atividades", label: "Calendário", match: (path: string) => path === "/atividades" || path.startsWith("/atividades/novo") || /^\/atividades\/[^/]+$/.test(path) },
  { href: "/atividades/locais", label: "Locais", match: (path: string) => path.startsWith("/atividades/locais") },
  { href: "/atividades/base", label: "Base", match: (path: string) => path.startsWith("/atividades/base") },
  { href: "/atividades/lobinhos", label: "Lobinhos", match: (path: string) => path.startsWith("/atividades/lobinhos") },
];

export function AppHeader({ current, email, role, isAdmin }: {
  current: string; email: string; role: ActivitiesRole; isAdmin: boolean;
}) {
  return <SharedHeader brand={<Brand module="atividades" />}
    navigation={sections.map((item) => ({ href: item.href, label: item.label, active: item.match(current) }))}
    account={<UserMenu email={email} role={isAdmin ? "admin" : ACTIVITIES_ROLE_LABELS[role]} logoutAction={logout}
      usersHref={isAdmin ? "/usuarios" : undefined} active={current === "/usuarios"} />} />;
}
