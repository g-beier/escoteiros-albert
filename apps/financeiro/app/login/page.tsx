import { requestOtp, verifyOtp } from "./actions";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Identidade própria do login: campos e botões maiores que no restante do app.
const fieldLabel = "text-[12px] leading-normal font-[750] text-[#ded9e1]";
const fieldInput = "h-auto rounded-[10px] border-[1.5px] bg-white px-[13px] py-3 text-base text-foreground md:text-base dark:bg-white focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-[hsl(36_85%_45%/.18)]";
const authButton = "h-auto gap-[7px] border-[1.5px] border-foreground px-[18px] py-[11px] text-base font-[650] shadow-[2px_3px_0_var(--ink)] hover:bg-(--purple-dark) active:not-aria-[haspopup]:translate-[2px] active:shadow-none";
const eyebrow = "text-[11px] font-bold tracking-[.12em] uppercase";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ erro?: string; mensagem?: string; email?: string }> }) {
  const params = await searchParams;
  return (
    <main className="grid min-h-screen grid-cols-2 max-[760px]:grid-cols-1">
      <section className="relative flex flex-col justify-between overflow-hidden bg-background p-16 text-foreground before:absolute before:top-[20%] before:-right-[75px] before:size-[150px] before:bg-primary after:absolute after:right-0 after:bottom-0 after:size-[260px] after:rounded-tl-[260px] after:bg-(--green) max-[760px]:hidden">
        <Brand href="/login" />
        <div>
          <span className={cn(eyebrow, "text-primary")}>Clareza para servir melhor</span>
          <h1 className="mt-2 mb-2.5 max-w-[550px] text-[clamp(42px,6vw,74px)] leading-[.98] font-bold tracking-[-.055em]">Contas em ordem. Energia no escotismo.</h1>
          <p className="max-w-[450px] leading-[1.6] text-muted-foreground">Registre, rateie e acompanhe cada movimentação financeira do grupo em um só lugar.</p>
        </div>
        <small className="text-muted-foreground">Acesso protegido para a diretoria do grupo</small>
      </section>
      <section className="grid place-items-center bg-foreground p-[30px] max-[760px]:flex max-[760px]:flex-col max-[760px]:items-center max-[760px]:justify-center max-[760px]:gap-7 max-[760px]:px-[22px] max-[760px]:pt-7 max-[760px]:pb-9">
        <div className="hidden w-[min(430px,100%)] max-[760px]:block [&_.brand-logo]:w-[190px]"><Brand href="/login" light /></div>
        <div className="w-[min(430px,100%)] rounded-[20px] border-[1.5px] border-[#5b565f] bg-[#302d33] p-[34px] text-white shadow-[7px_8px_0_var(--purple)]">
          <span className={cn(eyebrow, "text-(--green)")}>Área restrita</span>
          <h2 className="mt-0 mb-2 text-[32px] tracking-[-.035em]">Boas-vindas</h2>
          <p className="text-[#c3bec7]">{params.email ? "Digite o código recebido. Ele expira em poucos minutos." : "Receba um código de acesso no seu e-mail institucional."}</p>
          <form className="mt-[26px] grid gap-[17px]" action={params.email ? verifyOtp : requestOtp}>
            {params.erro && <div className="rounded-[8px] bg-[#fbecea] px-[13px] py-[11px] text-[13px] text-[#892d27]" role="alert">{params.erro}</div>}
            {params.mensagem && <div className="rounded-[8px] bg-[#e7f2e9] px-[13px] py-[11px] text-[13px] text-success" role="status">{params.mensagem}</div>}
            {params.email ? <>
              <input type="hidden" name="email" value={params.email} />
              <div className="grid gap-[7px]"><Label className={fieldLabel} htmlFor="token">Código de acesso</Label><Input className={cn(fieldInput, "num text-center text-[25px] tracking-[.3em] md:text-[25px]")} id="token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} autoFocus required /></div>
              <Button type="submit" className={authButton}>Confirmar código</Button>
              <Button nativeButton={false} render={<a href="/login" />} className={cn(authButton, "border-[#8e8992] bg-transparent text-white shadow-none hover:bg-transparent")}>Usar outro e-mail</Button>
            </> : <>
              <div className="grid gap-[7px]"><Label className={fieldLabel} htmlFor="email">E-mail</Label><Input className={fieldInput} id="email" name="email" type="email" pattern=".+@escoteirosalbert\.com\.br" placeholder="nome@escoteirosalbert.com.br" autoComplete="email" required /></div>
              <Button type="submit" className={authButton}>Enviar código de acesso</Button>
            </>}
            <p className="text-center text-xs text-[#c3bec7]">Ainda não possui acesso? Solicite um convite ao administrador do grupo.</p>
          </form>
        </div>
      </section>
    </main>
  );
}
