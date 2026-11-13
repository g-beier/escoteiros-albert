import { AppLogin } from "@geas/ui";
import { requestOtp, verifyOtp } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; mensagem?: string; email?: string }> }) {
  const params = await searchParams;
  const inventoryUrl = process.env.NEXT_PUBLIC_INVENTARIO_URL ?? "http://localhost:3002";
  return <AppLogin current="financeiro" financeiroHref="/" inventarioHref={inventoryUrl}
    eyebrow="Clareza para servir melhor" headline="Contas em ordem. Energia no escotismo."
    description="Registre, rateie e acompanhe cada movimentação financeira do grupo em um só lugar.">
    <span className="geas-login__card-eyebrow">Área restrita</span><h2>Boas-vindas</h2>
    <p>{params.email ? "Digite o código recebido. Ele expira em poucos minutos." : "Receba um código de acesso no seu e-mail institucional."}</p>
    <form className="geas-login__form" action={params.email ? verifyOtp : requestOtp}>
      {params.erro && <div className="geas-login__message geas-login__message--error" role="alert">{params.erro}</div>}
      {params.mensagem && <div className="geas-login__message" role="status">{params.mensagem}</div>}
      {params.email ? <><input type="hidden" name="email" value={params.email}/><label className="geas-login__field">Código de acesso<input className="geas-login__token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} autoFocus required/></label><button className="geas-login__button" type="submit">Confirmar código</button><a className="geas-login__button geas-login__button--secondary" href="/login">Usar outro e-mail</a></> : <><label className="geas-login__field">E-mail<input name="email" type="email" pattern=".+@escoteirosalbert\.com\.br" placeholder="nome@escoteirosalbert.com.br" autoComplete="email" required/></label><button className="geas-login__button" type="submit">Enviar código de acesso</button></>}
      <p className="geas-login__help">Ainda não possui acesso? Solicite um convite ao administrador do grupo.</p>
    </form>
  </AppLogin>;
}
