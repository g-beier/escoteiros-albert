# GEAS Financeiro

MVP de gestão financeira para grupo escoteiro. Um lançamento representa uma linha do extrato e contém um ou mais rateios por rubrica. A aplicação oferece as visões “Por extrato” e “Por rubrica”.

## Arquitetura

- Next.js (App Router e Server Actions)
- Supabase Auth passwordless com código único por e-mail e sessão em cookies
- Gestão de usuários por convite, restrita a `@escoteirosalbert.com.br`
- PostgreSQL/Supabase com Row Level Security por grupo
- Valores monetários armazenados como centavos inteiros
- Criação do lançamento e seus rateios em uma única transação SQL

## Telas

- `/` — lançamentos: visões **Por extrato** (uma linha por lançamento) e **Por rubrica** (um rateio por linha), filtros na URL (`de`, `ate`, `forma`, `pasta`, `associado`, `rubrica`, `q`) e conferência rápida da pasta.
- `/lancamentos/novo` — novo lançamento.
- `/lancamentos/[id]` — detalhes com o formulário completo; edição e exclusão para tesouraria/administração, somente leitura para consulta.
- `/associados` — associados (nome, ramo, seção, ativo).
- `/cadastros` — rubricas e formas de pagamento (tesouraria e administração).
- `/usuarios` — convites e papéis (administração).

## Componentes

shadcn/ui com o preset `b1D0eVNQ` (estilo `base-mira`, primitivas Base UI, ícones Tabler) sobre Tailwind CSS v4. Os tokens semânticos do shadcn são mapeados para a paleta do grupo em `app/globals.css`. Estilos anteriores ao shadcn ficam em `@layer legacy`, abaixo de `components`/`utilities`, para não sobrescrever os utilitários. Adicione componentes com `npx shadcn@latest add <nome>` dentro de `apps/financeiro` e troque eventuais imports de `cn` do pacote `cn` por `@/lib/utils`.

## Identidade visual

A interface usa a fonte Outfit (variável), escolhida por ter algarismos tabulares (`tnum`) para alinhar valores e datas; o site institucional continua em Poppins. Use a classe `num` em valores, datas e campos numéricos. A paleta segue a identidade do Grupo Escoteiro Albert Schweitzer: roxo para ações primárias, verde para suporte e sucesso, amarelo para foco e neutros quentes nas superfícies.

O navegador recebe somente a chave publicável do Supabase. As políticas RLS e as funções transacionais validam novamente grupo, papel e fechamento do rateio no banco.

## Executar localmente

O ambiente de desenvolvimento usa a Supabase CLI para executar PostgreSQL, Auth,
Studio, Mailpit e os demais serviços em containers Docker. É necessário ter Docker
ativo e Node.js instalado. Na primeira execução, `npx` baixa a CLI do Supabase.

Todos os comandos rodam a partir da **raiz do monorepo**:

```bash
npm install              # instala todas as apps (nunca rode dentro de apps/financeiro)
npm run infra:start      # sobe o Supabase local e gera apps/financeiro/.env.local
npm run dev:financeiro   # aplicação em http://localhost:3000
```

### Serviços locais

| Serviço | URL | Para quê |
| --- | --- | --- |
| Aplicação | http://localhost:3000 | o financeiro |
| Supabase Studio | http://localhost:54323 | tabelas, SQL Editor, usuários de Auth |
| Mailpit | http://localhost:54324 | caixa de e-mails local: códigos de acesso e convites |
| API Supabase | http://localhost:54321 | REST/Auth usados pela aplicação |
| PostgreSQL | `postgresql://postgres:postgres@localhost:54322/postgres` | acesso direto via `psql` |

Nenhum e-mail real é disparado localmente: tudo chega no Mailpit.

### Primeiro acesso local

1. **Crie o usuário administrador** no Studio → *Authentication* → *Users* → *Add user* → *Create new user*.
   Use um e-mail `@escoteirosalbert.com.br` (outros domínios são bloqueados pelo hook `restrict_auth_domain`)
   e marque *Auto Confirm User*. A senha é irrelevante: o login é por código.
2. **Crie o grupo** no Studio → *SQL Editor*, trocando o e-mail pelo do passo 1:

   ```sql
   select public.admin_bootstrap_group(
     'administrador@escoteirosalbert.com.br',
     'Grupo Escoteiro Albert Schweitzer'
   );
   ```

   A função cria o grupo, torna o usuário administrador e cadastra rubricas e formas de pagamento iniciais.
   Ela só pode ser executada pelo papel `postgres` (SQL Editor), nunca pela aplicação.
3. **Entre na aplicação** em http://localhost:3000/login com o e-mail do passo 1.
   O código de 6 dígitos chega no Mailpit (http://localhost:54324).
4. **Convide as demais pessoas** em `/usuarios` (menu *Usuários*, só para administradores), escolhendo o papel:
   - **Administrador**: tudo, inclusive usuários;
   - **Tesoureiro**: lançamentos, associados e cadastros;
   - **Consulta**: somente leitura.

   O convite também chega no Mailpit; a pessoa convidada entra pelo link ou pedindo um código em `/login`.

### Banco de dados local

```bash
npx supabase migration up   # (em apps/financeiro) aplica migrations novas sem apagar dados
npm run infra:reset         # recria o banco do zero e reaplica todas as migrations (apaga tudo; refaça o primeiro acesso)
npm run infra:status        # mostra serviços, URLs e chaves
npm run infra:stop          # encerra os containers (os dados são preservados)
npm run infra:env --workspace=@geas/financeiro   # regenera somente o .env.local
```

Consultas úteis no SQL Editor:

```sql
-- quem tem acesso e com qual papel
select u.email, m.role from public.memberships m join auth.users u on u.id = m.user_id;

-- trilha de auditoria mais recente
select created_at, action, entity_id, details from public.audit_events order by id desc limit 50;
```

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
