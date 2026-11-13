import { PageBody, PageHeader } from "@geas/ui";

/** Conta autenticada que ainda não pertence a um grupo. */
export function SetupNeeded({ email }: { email: string }) {
  return <PageBody width="narrow">
    <PageHeader title="Acesso ainda não vinculado"
      description={`A conta ${email} foi autenticada, mas ainda não pertence a um grupo. Peça a um administrador para convidá-la em Usuários, no Financeiro.`} />
  </PageBody>;
}
