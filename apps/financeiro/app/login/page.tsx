import { AppLogin, AppLoginForm } from "@geas/ui";
import { requestOtp, verifyOtp } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; mensagem?: string; email?: string }> }) {
  const params = await searchParams;
  const inventoryUrl = process.env.NEXT_PUBLIC_INVENTARIO_URL ?? "http://localhost:3002";
  return <AppLogin current="financeiro" financeiroHref="/" inventarioHref={inventoryUrl}
    eyebrow="Clareza para servir melhor" headline="Contas em ordem. Energia no escotismo."
    description="Registre, rateie e acompanhe cada movimentação financeira do grupo em um só lugar.">
    <AppLoginForm email={params.email} error={params.erro} message={params.mensagem} requestOtp={requestOtp} verifyOtp={verifyOtp} />
  </AppLogin>;
}
