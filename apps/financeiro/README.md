# GEAS Financeiro

MVP de gestão financeira para grupo escoteiro. Um lançamento representa uma linha do extrato e contém um ou mais rateios por rubrica. A aplicação oferece as visões “Por extrato” e “Por rubrica”.

## Arquitetura

- Next.js (App Router e Server Actions)
- Supabase Auth passwordless com código único por e-mail e sessão em cookies
- Gestão de usuários por convite, restrita a `@escoteirosalbert.com.br`
- PostgreSQL/Supabase com Row Level Security por grupo
- Valores monetários armazenados como centavos inteiros
- Criação do lançamento e seus rateios em uma única transação SQL

## Identidade visual

A interface usa exclusivamente Poppins, nos pesos 400, 500, 600 e 700. A paleta segue a identidade do Grupo Escoteiro Albert Schweitzer: roxo para ações primárias, verde para suporte e sucesso, amarelo para foco e neutros quentes nas superfícies.

O navegador recebe somente a chave publicável do Supabase. As políticas RLS e as funções transacionais validam novamente grupo, papel e fechamento do rateio no banco.

## Executar localmente

O ambiente de desenvolvimento usa a Supabase CLI para executar PostgreSQL, Auth,
Studio, Inbucket e os demais serviços em containers Docker. É necessário ter Docker
ativo e Node.js instalado. Na primeira execução, `npx` baixa a CLI do Supabase.

```bash
npm install
npm run infra:start
npm run dev
```

`infra:start` aplica automaticamente as migrations de `supabase/migrations` e gera
um `.env.local` com as credenciais locais. Os serviços ficam disponíveis em:

- aplicação: http://localhost:3000
- Supabase Studio: http://127.0.0.1:54323
- caixa de e-mails local (Inbucket): http://127.0.0.1:54324
- API Supabase: http://127.0.0.1:54321

Comandos úteis:

```bash
npm run infra:status  # mostra serviços, URLs e chaves
npm run infra:reset   # recria o banco e reaplica todas as migrations
npm run infra:env     # regenera somente o .env.local
npm run infra:stop    # encerra os containers
```

Para o primeiro acesso, crie no Studio um usuário confirmado com e-mail do domínio
`@escoteirosalbert.com.br`. Depois, no SQL Editor do Studio, inicialize o grupo com
a função restrita ao papel `postgres`:

```sql
select public.admin_bootstrap_group(
  'administrador@escoteirosalbert.com.br',
  'Grupo Escoteiro Albert Schweitzer'
);
```

A partir daí, use `/usuarios` para convidar as demais pessoas.
Os códigos de acesso e convites enviados localmente aparecem no Inbucket; nenhum
e-mail real é disparado.

### Deploy na Vercel

Produção: `https://financeiro.escoteirosalbert.com.br`.

1. Importe o repositório na Vercel com **Root Directory** = `apps/financeiro`. Mantenha habilitado "Include files outside the root directory": a instalação usa o `package-lock.json` da raiz do monorepo. O framework Next.js é detectado sozinho.
2. Em **Ignored Build Step**, use `git diff --quiet HEAD^ HEAD -- . ../../package-lock.json` para não fazer build quando só o site institucional mudar.
3. Em **Domains**, adicione `financeiro.escoteirosalbert.com.br`. No DNS do domínio, crie o `CNAME financeiro → cname.vercel-dns.com`.
4. Configure as variáveis abaixo com `NEXT_PUBLIC_SITE_URL=https://financeiro.escoteirosalbert.com.br` em Production.
5. No Supabase de produção (Authentication → URL Configuration), defina o Site URL `https://financeiro.escoteirosalbert.com.br` e a Redirect URL `https://financeiro.escoteirosalbert.com.br/auth/confirm`.

### Produção e Preview

Crie projetos separados no Supabase, execute as migrations e replique nesses
ambientes as opções de Auth declaradas em `supabase/config.toml`: URLs permitidas,
hook SQL `public.restrict_auth_domain`, bloqueio de cadastro público e template de
e-mail com `{{ .Token }}`.

Na Vercel, configure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` e `NEXT_PUBLIC_SITE_URL`. A chave secreta nunca pode usar o prefixo `NEXT_PUBLIC_`.

O código por e-mail é autenticação passwordless de um fator, não MFA verdadeiro. Para administradores, pode-se adicionar TOTP como segundo fator futuramente. Configure SMTP próprio antes da produção para melhorar entregabilidade e controle dos e-mails.

### Segurança operacional

- Configure os limites de envio de OTP e CAPTCHA do Supabase antes de produção.
- Use bancos Supabase distintos para Preview e Production na Vercel.
- Depois de criar o primeiro grupo, a migração `003_security_and_audit.sql` revoga o bootstrap público.
- Remover um usuário bloqueia a conta e elimina sua associação ao grupo; lançamentos antigos preservam a autoria.
- Mudanças de papel, remoções, convites e novos lançamentos geram eventos de auditoria.

### Qualidade

Execute `npm run typecheck`, `npm run lint`, `npm test` e `npm run build` antes de publicar. Os próximos gates são testes pgTAP das políticas RLS e Playwright para OTP, lançamentos e gestão de usuários.

## Próximos módulos sugeridos

- Administração de usuários, papéis e convites
- Cadastro e edição de rubricas
- Importação/conciliação de extrato CSV/OFX
- Associados e mensalidades
- Anexos de comprovantes em bucket privado
- Fechamento mensal e trilha de auditoria
