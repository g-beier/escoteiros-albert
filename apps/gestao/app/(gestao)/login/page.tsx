import { redirect } from "next/navigation";
import { AppLogin, AppLoginForm } from "@geas/ui";
import { Link } from "@geas/ui/components/link";
import { currentUser, e2eLoginEnabled, safeNext } from "@/lib/server/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; next?: string }> }) {
  const params = await searchParams;
  if (await currentUser()) redirect(safeNext(params.next));
  const next = safeNext(params.next);
  return (
    <AppLogin
      current="gestao"
      financeiroHref="/financeiro"
      inventarioHref="/inventario"
      associadosHref="/associados"
      eyebrow="Clareza para servir melhor"
      headline="Grupo em ordem. Energia no escotismo."
      description="Finanças, mensalidades e materiais do grupo num só lugar: cada movimentação registrada, conferida e fácil de achar."
    >
      <AppLoginForm error={params.erro} googleHref={`/auth/google?next=${encodeURIComponent(next)}`} />
      {e2eLoginEnabled() && (
        <form method="post" action="/auth/e2e" className="geas-login__form" aria-label="Login de teste">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="e2e-email">E-mail (teste)</label>
          <input id="e2e-email" name="email" type="email" placeholder="e2e@exemplo.org" required />
          <button type="submit">Entrar (teste)</button>
        </form>
      )}
      <p className="geas-login__help">
        <Link href="/privacidade">Política de privacidade</Link>
      </p>
    </AppLogin>
  );
}
