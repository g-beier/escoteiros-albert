import { IconBolt } from "@tabler/icons-react";
import { AppHeader, UserMenu } from "@geas/ui";
import { logout } from "@/app/(gestao)/login/actions";
import { Brand } from "@/components/shell/brand";
import { moduleAccess, roleLabel, type Member, type ModuleAccess } from "@/lib/server/session";

const sections: { href: string; label: string; module?: keyof ModuleAccess; match: (path: string) => boolean }[] = [
  { href: "/", label: "Início", match: (path: string) => path === "/" },
  { href: "/financeiro", label: "Financeiro", module: "financeiro", match: () => false },
  { href: "/inventario", label: "Inventário", module: "inventario", match: () => false },
  { href: "/associados", label: "Associados", module: "associados", match: () => false },
];

/** Papel mostrado nas telas comuns: o maior entre os módulos. */
function highestRole(member: Member) {
  return [member.finance, member.inventory, member.associates].reduce((best, next) => (next.canAdmin || (!best.canAdmin && next.canReview) ||
    (!best.canReview && next.canWrite) || (!best.canWrite && next.canRead) ? next : best));
}

/**
 * Cabeçalho das telas comuns (Início, Registro rápido, Usuários): só os módulos que a pessoa vê entram no menu.
 * `quick`: mostra o atalho do registro rápido (quem é Colaborador ou mais em algum módulo).
 */
export function GestaoHeader({ current, member, quick = false }: { current: string; member: Member; quick?: boolean }) {
  const access = moduleAccess(member);
  return <AppHeader brand={<Brand module="gestao" />}
    navigation={sections.filter((item) => !item.module || access[item.module]).map((item) => ({ href: item.href, label: item.label, active: item.match(current) }))}
    utilities={quick ? [{ href: "/rapido", label: "Registro rápido", icon: <IconBolt size={18} />, active: current.startsWith("/rapido") }] : undefined}
    account={<UserMenu email={member.user.email} role={roleLabel(highestRole(member))} logoutAction={logout}
      usersHref={member.managesUsers ? "/usuarios" : undefined} active={current === "/usuarios"} />} />;
}
