import { AppLogin, AppLoginForm } from "@geas/ui";
import { requestOtp, verifyOtp } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; mensagem?: string; email?: string }> }) {
  const params = await searchParams;
  const financeUrl = process.env.NEXT_PUBLIC_FINANCEIRO_URL ?? "http://localhost:3000";
  return <AppLogin current="inventario" financeiroHref={financeUrl} inventarioHref="/"
    eyebrow="Tudo no lugar" headline="Materiais cuidados. Escotismo em movimento."
    description="Saiba o que o grupo possui, onde está e quando precisa de atenção.">
    <AppLoginForm email={params.email} error={params.erro} message={params.mensagem} requestOtp={requestOtp} verifyOtp={verifyOtp} />
  </AppLogin>;
}
