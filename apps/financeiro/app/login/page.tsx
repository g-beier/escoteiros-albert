import { requestOtp, verifyOtp } from "./actions";
import { Brand } from "@/components/brand";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; mensagem?: string; email?: string }> }) {
  const params = await searchParams;
  return (
    <main className="auth">
      <section className="auth-aside">
        <Brand href="/login" />
        <div>
          <span className="eyebrow">Clareza para servir melhor</span>
          <h1>Contas em ordem. Energia no escotismo.</h1>
          <p>Registre, rateie e acompanhe cada movimentação financeira do grupo em um só lugar.</p>
        </div>
        <small className="auth-note">Acesso protegido para a diretoria do grupo</small>
      </section>
      <section className="auth-panel">
        <div className="mobile-login-brand"><Brand href="/login" light /></div>
        <div className="auth-card">
          <span className="eyebrow">Área restrita</span>
          <h2>Boas-vindas</h2>
          <p className="muted">{params.email ? "Digite o código recebido. Ele expira em poucos minutos." : "Receba um código de acesso no seu e-mail institucional."}</p>
          <form className="form" action={params.email ? verifyOtp : requestOtp}>
            {params.erro && <div className="error" role="alert">{params.erro}</div>}
            {params.mensagem && <div className="success" role="status">{params.mensagem}</div>}
            {params.email ? <>
              <input type="hidden" name="email" value={params.email} />
              <div className="field"><label htmlFor="token">Código de acesso</label><input className="input otp-input" id="token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} autoFocus required /></div>
              <button className="button">Confirmar código</button>
              <a className="button secondary" href="/login">Usar outro e-mail</a>
            </> : <>
              <div className="field"><label htmlFor="email">E-mail</label><input className="input" id="email" name="email" type="email" pattern=".+@escoteirosalbert\.com\.br" placeholder="nome@escoteirosalbert.com.br" autoComplete="email" required /></div>
              <button className="button">Enviar código de acesso</button>
            </>}
            <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>Ainda não possui acesso? Solicite um convite ao administrador do grupo.</p>
          </form>
        </div>
      </section>
    </main>
  );
}
