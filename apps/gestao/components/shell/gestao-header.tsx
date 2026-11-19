import { AppHeader, UserMenu } from "@geas/ui";
import { logout } from "@/app/(gestao)/login/actions";
import { Brand } from "@/components/shell/brand";

/** Cabeçalho das telas comuns (Início, Usuários): módulos na marca; à direita só a conta. */
export function GestaoHeader({ current, email, role, isAdmin }: { current: string; email: string; role: string; isAdmin: boolean }) {
  return <AppHeader brand={<Brand module="gestao" />}
    account={<UserMenu email={email} role={role} logoutAction={logout} usersHref={isAdmin ? "/usuarios" : undefined} active={current === "/usuarios"} />} />;
}
