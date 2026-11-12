export function SetupNeeded({ email }: { email: string }) {
  return <main className="mx-auto max-w-[1180px] px-6 pt-[52px] pb-[78px] max-[760px]:pt-7">
    <span className="text-[11px] font-bold tracking-[.12em] text-primary uppercase">Configuração inicial</span>
    <h1 className="mt-2 mb-2.5 text-[clamp(40px,5vw,60px)] leading-[.98] font-bold tracking-[-.055em]">Falta criar o grupo</h1>
    <p className="m-0 max-w-[680px] leading-[1.55] text-muted-foreground">A conta {email} foi autenticada, mas ainda não pertence a um grupo. Peça a um administrador para convidá-la em Usuários. Na configuração inicial, execute <code>admin_bootstrap_group</code> no SQL Editor, conforme o README.</p>
  </main>;
}
