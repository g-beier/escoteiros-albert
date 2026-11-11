export function SetupNeeded({ email }: { email: string }) {
  return <main className="main"><span className="eyebrow">Configuração inicial</span><h1>Falta criar o grupo</h1><p className="lede">A conta {email} foi autenticada, mas ainda não pertence a um grupo. Peça a um administrador para convidá-la em Usuários. Na configuração inicial, execute <code>admin_bootstrap_group</code> no SQL Editor, conforme o README.</p></main>;
}
