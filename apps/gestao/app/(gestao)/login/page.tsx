import { AppLogin, AppLoginForm } from "@geas/ui";
import { requestOtp, verifyOtp } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; mensagem?: string; email?: string }> }) {
  const params = await searchParams;
  return <AppLogin current="gestao" financeiroHref="/financeiro" inventarioHref="/inventario" associadosHref="/associados"
    eyebrow="Clareza para servir melhor" headline="Grupo em ordem. Energia no escotismo."
    description="Finanças, mensalidades e materiais do grupo num só lugar: cada movimentação registrada, conferida e fácil de achar.">
    <AppLoginForm email={params.email} error={params.erro} message={params.mensagem} requestOtp={requestOtp} verifyOtp={verifyOtp} />
  </AppLogin>;
}
