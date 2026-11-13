# GEAS Financeiro

MVP de gestão financeira para grupo escoteiro. Um lançamento representa uma movimentação da conta (histórico, forma de pagamento, total), pertence a uma **conta** (corrente, poupança, caixa…) e contém um ou mais rateios por rubrica. A aplicação oferece as visões “Movimentações” (um lançamento por linha), “Detalhamento” (um rateio por linha) e “Realizado”. Glossário em [`docs/modelo.md`](docs/modelo.md).

Modelo principal: `accounts` (contas, com saldo inicial), `payment_methods` (com conta padrão), `ledger_entries` (linha do extrato, com `account_id`) e `entry_splits` (rateio). A importação de extrato grava `import_profiles` (perfil por banco/formato), `statement_imports` e `statement_lines` (linhas abertas, deduplicadas por impressão digital); a conciliação (`013_reconciliation.sql`) grava `reconciliation_links` (conjuntos 1:1, 1:N ou N:1 cujas somas batem) e `reconciliation_rejections` (sugestões recusadas); lançamentos podem ser marcados como fora do extrato. Plano completo em `docs/importacao-conciliacao.md`. A contabilidade (`014_accounting.sql`) acrescenta a **conta contábil** (`ledger_code`, máscara `0.0.0.0.0000`) em rubricas e contas, os campos do OFX nas linhas do extrato e o ID OFX (`external_ids`) nas visões de lançamentos; ver `docs/contabilidade.md`.

## Arquitetura

- Next.js (App Router e Server Actions)
- Supabase Auth passwordless com código único por e-mail e sessão em cookies
- Gestão de usuários por convite, restrita a `@escoteirosalbert.com.br`
- PostgreSQL/Supabase com Row Level Security por grupo
- Valores monetários armazenados como centavos inteiros
- Criação do lançamento e seus rateios em uma única transação SQL

## Telas

Rotas: o item do menu é o 1º segmento, a aba do cabeçalho é o 2º (`/lancamentos/detalhamento`, `/extrato/importar`, `/configuracoes/rubricas`); a query string guarda só filtros e modos de exibição (`de`, `ate`, `conta`, `ano`, `agrupar`…). A raiz de cada área (`/lancamentos`, `/extrato`, `/configuracoes`) leva à primeira aba.

Navegação: **Início · Lançamentos · Extrato · Mensalidades** no menu principal; **Configurações** (engrenagem) com as abas Contas, Rubricas, Formas de pagamento, Associados e Mensalidades; menu da pessoa (iniciais) com email, papel, **Usuários** (administração) e Sair. Extrato tem as abas **Conciliar** (`/extrato/conciliar`) e **Importar** (`/extrato/importar`), que levam a conta de uma para a outra. Exportar fica em Lançamentos. Todas as telas usam o mesmo cabeçalho (`components/nav/page-header.tsx`).

- `/` — resumo do ano: receitas, despesas, saldo, documentos pendentes; mês a mês, últimos lançamentos e mensalidades atrasadas (do maior número de meses para o menor).
- `/mensalidades?ano=` — grade de mensalidades (março a dezembro) por associado: pago, atenção, atrasado (pelo vencimento configurado) e sugestões a partir dos rateios da rubrica de mensalidade; isenção por ano. Ver `docs/mensalidades.md`.
- `/lancamentos/movimentacoes` e `/lancamentos/detalhamento` — lançamentos: **Movimentações** (uma linha por lançamento; o ID OFX preenchido indica que está conciliado) e **Detalhamento** (um rateio por linha), mesma tela (`app/lancamentos/entries-screen.tsx`); trocar de aba leva os filtros, colunas Conta e **ID OFX**, filtros na URL (`de`, `ate`, `conta`, `forma`, `pasta` = documentos, `associado`, `rubrica`, `q`, `ofx`; `rubrica` é compacto: `id` vale pela rubrica e todas abaixo dela, `-id` tira a rubrica e as de baixo, e vale o item mais próximo, ver `encodeCategorySelection` em `lib/categories.ts`; sem `de`, começa em 1º de janeiro do ano atual, `de=tudo` mostra todos) e conferência rápida dos documentos.
- `/lancamentos/realizado?ano=` — terceira aba de Lançamentos: o Realizado do ano na tela (rubricas × meses, pais somando filhas, saldo), mesmo modelo da planilha (`lib/export/realized.ts`, `fetchRealizedModel`); grupos recolhíveis, cada valor abre o Detalhamento filtrado pela rubrica (um só ID na URL, que já inclui as filhas) e pelo mês ou ano; botão para baixar a planilha.
- `/exportar/fluxo` (XLSX ou CSV), `/exportar/realizado` (XLSX) e `/exportar/contabil` (CSV em partida dobrada para o sistema contábil).
- `/lancamentos/novo` — novo lançamento; com `?linha=<id>` ("Criar lançamento" na conciliação) vem preenchido pela linha do extrato e já sai conciliado.
- `/extrato/conciliar` — extrato × lançamentos de uma conta e período (`conta`, `de`, `ate`; padrão: primeira conta ativa, mês atual): sugestões por mesmo valor no mesmo dia ou até 3 dias depois/antes, lançamentos "A definir" como candidatos, vínculo manual com conferência das somas, criar lançamentos e ignorar linhas em massa, fora do extrato, trocar conta, desfazer e fechamento com o saldo do extrato. Somente leitura para consulta.
- `/lancamentos/[id]` — detalhes com o formulário completo (inclusive **Observações**, texto livre opcional por lançamento, que entra na busca) e as linhas do extrato vinculadas (com ID OFX); edição e exclusão para tesouraria/administração, somente leitura para consulta.
- `/configuracoes/associados` — Configurações › Associados (nome, ramo, seção, patrulha, ativo); única aba de Configurações para consulta. Cadastro **Seções e patrulhas** (Ramo › Seção › Patrulha, `028_sections.sql`): seção escolhida numa lista do ramo (pré-selecionada se o ramo tem uma só), patrulha opcional da seção. Visualizações **Lista** (editável) e **Por seção** (`agrupar=secao`, agrupada e em ordem de nome), filtro `secao`; importação em massa por CSV (`nome, ramo, seção, patrulha, status`, seção e patrulha precisam estar cadastradas; com modelo para baixar e conferência antes de gravar; `016_import_associates.sql`).
- `/extrato/importar` — importar extrato **OFX** numa conta (tesouraria e administração): a conta (banco) é escolhida em cada importação — vale para OFX convertidos —, o perfil de leitura da última importação da conta é aplicado sozinho (ajustes recolhidos), conferência com o que já existe na conta (novas, já importadas, suspeitas, órfãs), totais, saldos, TRNTYPE e ID OFX, e lista das importações recentes da conta com **desfazer** (`conta` na URL). Depois de importar, segue para `/extrato/conciliar?conta=…&de=…&ate=…`.
- `/configuracoes/contas|rubricas|formas|perfis|mensalidades` — Configurações (`app/configuracoes/[aba]`): contas (banco, agência, número, saldo inicial, conta contábil), rubricas com conta contábil, formas de pagamento com conta padrão e perfis de leitura do extrato OFX (contas em que foram usados, renomear, excluir) (tesouraria e administração).
- `/usuarios` — convites e papéis (administração).

## Componentes

shadcn/ui com o preset `b1D0eVNQ` (estilo `base-mira`, primitivas Base UI, ícones Tabler) sobre Tailwind CSS v4. Os componentes, o `cn` e o tema (tokens do shadcn mapeados para a paleta do grupo, camada `legacy`) ficam no pacote compartilhado `@geas/ui` (`packages/ui`), usado também pelo Inventário; `app/globals.css` só importa `@geas/ui/theme.css`. Adicione componentes com `npx shadcn@latest add <nome>` dentro de `packages/ui`.

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
- Mudanças de papel, remoções, convites, lançamentos, contas, rubricas, formas de pagamento, perfis de importação e importações de extrato geram eventos de auditoria.

### Qualidade

Execute `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`, `npm run test:e2e` e `npm run build` antes de publicar (todos a partir da raiz).

### Testes

| Comando (raiz) | O quê | Precisa |
| --- | --- | --- |
| `npm test` | Vitest: funções de `lib/` (dinheiro, OFX, filtros, exportações…) | nada |
| `npm run test:db` | `supabase test db` (pgTAP via pg_prove) com tudo de `supabase/tests/` | Supabase local rodando |
| `npm run test:e2e` | Playwright (Chromium desktop) contra um `next dev` próprio na porta 3210 | Supabase local, Docker e `.env.local` |

**Banco (`supabase/tests/`).** Cada arquivo abre e desfaz a própria transação (`begin … rollback`), então rodar não altera o banco local; nunca é preciso `db reset`. O pg_prove pega todo `*.sql` da pasta:

- `rls_isolation.test.sql` — isolamento entre grupos: o admin de outro grupo não lê nem escreve (SELECT/INSERT/UPDATE/DELETE direto, funções auditadas e bucket `comprovantes`) lançamentos, rateios, extrato, rubricas, contas, associados, mensalidades (`fee_*`), anexos e auditoria;
- `rls_roles.test.sql` — papéis: consulta só lê; tesouraria escreve, mas não administra usuários nem lê `audit_events`; administração muda papéis, convida e remove (e quem sai perde o acesso);
- `rls_direct_writes.test.sql` — tabelas que só aceitam funções auditadas não têm escrita direta nem para admin/tesouraria do próprio grupo (associados são a exceção proposital);
- `sections.test.sql` — seções e patrulhas: só pelas funções auditadas, isolamento entre grupos e seção do mesmo ramo / patrulha da mesma seção no associado;
- `audit.test.sql` — as funções principais gravam `audit_events` com grupo, ação e autor;
- `_fixture.psql` — dados comuns desses quatro (incluído com `\ir`; a extensão `.psql` deixa o pg_prove de fora);
- os demais `*.sql` (contabilidade, conciliação, importação, mensalidades…) são scripts psql que terminam com `ok 1 - TUDO OK`: imprimem TAP mínimo (`1..1`), então rodam no `supabase test db` e também sozinhos, como diz o cabeçalho de cada um (`cat arquivo | docker exec -i supabase_db_geas-financeiro psql …`).

Para um arquivo só: `npm exec --package=supabase -- supabase test db supabase/tests/rls_roles.test.sql` (em `apps/financeiro`; `npx supabase` não funciona dentro do workspace).

**Navegador (`e2e/`).** Antes da primeira vez: `npx playwright install chromium` (em `apps/financeiro`). O projeto `setup` cria, se faltar, o usuário `e2e.admin@escoteirosalbert.com.br` (Auth, pela chave secreta do `.env.local`) e o grupo “Grupo E2E (testes automatizados)” (`admin_bootstrap_group` via `docker exec … psql`), com as contas “Conta E2E” e “Conta E2E 2”, e entra por OTP lendo o código no Mailpit (porta 54324, `[local_smtp]` do `config.toml`). Os testes cobrem login (código errado e certo), lançamentos (criar, buscar, filtrar por conta e rubrica, editar, excluir pela lista e pelos detalhes), usuários (convidar, mudar papel, remover), mover em lote, comprovantes, importação do `nubank.ofx` das fixtures com “Criar lançamento” na conciliação, filtro Conciliado e desfazer importação.

Tudo acontece no grupo E2E, com nomes únicos começando por `E2E`, e é desfeito pela interface; no começo e no fim, uma limpeza (como o admin E2E, pelas funções auditadas) desfaz importações, perfis e lançamentos `E2E …` que um teste interrompido tenha deixado, e os convidados (`e2e.convite.*`) são apagados do Auth. Os dados dos outros grupos não são tocados. O grupo E2E e seu admin ficam no banco entre execuções. Variáveis opcionais: `E2E_PORT`, `E2E_MAILPIT_URL`, `E2E_DB_CONTAINER`. Relatório em `playwright-report/` (`npx playwright show-report`).

## Próximos módulos sugeridos

- Administração de usuários, papéis e convites
- Cadastro e edição de rubricas
- Associados e mensalidades
- Anexos de comprovantes em bucket privado
- Fechamento mensal e trilha de auditoria
