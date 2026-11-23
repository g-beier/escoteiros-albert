import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Link } from "@geas/ui/components/link";

export const metadata: Metadata = {
  title: "Privacidade · GEAS Gestão",
  description: "Como o Gestão do Grupo Escoteiro Albert Schweitzer trata os dados de quem usa o app",
};

/** Atualize junto com o texto: aparece no topo da página. */
const UPDATED_ON = "23 de novembro de 2026";
const CONTACT = "diretoria@escoteirosalbert.com.br";

/** Política de privacidade do app (pública: link da tela de consentimento do Google e do login). */
export default function PrivacyPage() {
  return <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
    <p className="text-sm font-medium text-primary">GEAS Gestão</p>
    <h1 className="mt-1 text-3xl font-semibold tracking-tight">Política de privacidade</h1>
    <p className="mt-2 text-sm text-muted-foreground">Atualizada em {UPDATED_ON}</p>

    <div className="mt-8 space-y-8 leading-relaxed">
      <Section title="Sobre o app">
        <p>
          O Gestão é o sistema interno do Grupo Escoteiro Albert Schweitzer (CNPJ 17.582.094/0001-57), usado pela
          diretoria e pela equipe do grupo para cuidar das finanças, do inventário de materiais e do cadastro de
          associados. Só entra quem o administrador do grupo cadastrou. O grupo é o controlador dos dados tratados aqui,
          nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).
        </p>
      </Section>

      <Section title="O que usamos da sua conta Google">
        <p>
          O login é feito com o Google. O app pede apenas os escopos <code>openid</code> e <code>email</code> e recebe
          do Google:
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>seu endereço de e-mail e a confirmação de que ele foi verificado pelo Google;</li>
          <li>o identificador da sua conta Google, que liga a conta ao seu cadastro no primeiro login.</li>
        </ul>
        <p>
          Não pedimos seu nome, sua foto, seus contatos nem acesso a Gmail, Drive, Agenda ou qualquer outro serviço do
          Google. Esses dados servem só para saber quem está entrando e se o e-mail tem acesso ao grupo.
        </p>
        <p>
          O uso das informações recebidas das APIs do Google segue a{" "}
          <a className="underline underline-offset-2" href="https://developers.google.com/terms/api-services-user-data-policy"
            rel="noopener noreferrer" target="_blank">Política de Dados do Usuário dos Serviços de API do Google</a>,
          incluindo os requisitos de uso limitado. Não vendemos, não compartilhamos e não usamos esses dados para
          publicidade.
        </p>
      </Section>

      <Section title="O que o app guarda sobre quem usa">
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Cadastro de acesso:</strong> e-mail, identificador da conta Google, data do cadastro, último login
            e os papéis que você tem em cada módulo.</li>
          <li><strong>Sessões:</strong> data de início, último uso e validade de cada sessão aberta. O banco guarda
            apenas uma impressão digital (hash) do código da sessão, nunca o código em si.</li>
          <li><strong>Histórico de alterações:</strong> quem criou, alterou ou revisou cada registro e quando, para que
            o grupo possa prestar contas do que foi feito.</li>
        </ul>
        <p>O app não registra sua localização e não usa ferramentas de análise de navegação ou de publicidade.</p>
      </Section>

      <Section title="Cookies">
        <ul className="list-disc space-y-1 pl-6">
          <li><strong>Sessão</strong> (essencial): mantém você conectado por até 30 dias sem uso. Sai ao clicar em
            “Sair”.</li>
          <li><strong>Preferências de tela</strong>, como as colunas escolhidas na lista de materiais.</li>
        </ul>
        <p>Durante o login, um cookie temporário protege a volta do Google contra falsificação e expira em minutos.</p>
      </Section>

      <Section title="Dados dos associados">
        <p>
          O cadastro de associados guarda nomes, datas (nascimento, entrada, promessa), ramo e seção, funções, vínculos
          entre familiares e o andamento de itens de controle, inclusive de crianças e adolescentes. Contatos,
          documentos e dados de saúde não ficam no Gestão: continuam no Paxtu, o sistema da União dos Escoteiros do
          Brasil. Esses dados são usados apenas para a administração do grupo e só são vistos por usuários cadastrados,
          conforme o papel de cada um.
        </p>
      </Section>

      <Section title="Onde os dados ficam e quem acessa">
        <p>
          Os dados ficam em servidores contratados pelo grupo na Microsoft Azure, com conexão criptografada. Cada
          usuário só vê os dados do próprio grupo e, dentro dele, só o que o seu papel permite. Não repassamos dados a
          terceiros, exceto quando a lei exigir.
        </p>
      </Section>

      <Section title="Por quanto tempo">
        <p>
          O acesso vale enquanto o administrador mantiver seu cadastro. Ao ser removido, suas sessões são encerradas e a
          conta Google deixa de estar ligada ao cadastro. O e-mail e o histórico de alterações continuam guardados para
          preservar a autoria dos registros e a prestação de contas do grupo.
        </p>
      </Section>

      <Section title="Seus direitos">
        <p>
          Você pode pedir a confirmação de que tratamos seus dados, acesso, correção, anonimização ou exclusão do que
          não precisarmos guardar, além de informações sobre o uso, como prevê o art. 18 da LGPD. Também pode retirar o
          acesso do app à sua conta a qualquer momento em{" "}
          <a className="underline underline-offset-2" href="https://myaccount.google.com/connections"
            rel="noopener noreferrer" target="_blank">myaccount.google.com/connections</a>.
        </p>
        <p>
          Pedidos e dúvidas: <a className="underline underline-offset-2" href={`mailto:${CONTACT}`}>{CONTACT}</a>.
        </p>
      </Section>

      <Section title="Mudanças nesta política">
        <p>Quando esta política mudar, a data no topo da página será atualizada.</p>
      </Section>
    </div>

    <p className="mt-12 border-t pt-6 text-sm">
      <Link className="underline underline-offset-2" href="/login">Entrar no Gestão</Link>
    </p>
  </main>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-3">
    <h2 className="text-xl font-semibold">{title}</h2>
    {children}
  </section>;
}
