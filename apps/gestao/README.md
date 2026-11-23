# GEAS Gestão

App interno do grupo com os módulos **Financeiro** (`/financeiro/...`, descrito abaixo) e **Inventário** (`/inventario/...`, modelo em [`docs/inventario/modelo.md`](docs/inventario/modelo.md)). Acesso a dados só por `lib/server/` (ver o CLAUDE.md da raiz e `../../docs/consolidacao-gestao.md`). Início, login e Usuários ficam na raiz.

## Financeiro

MVP de gestão financeira para grupo escoteiro. Um lançamento representa uma movimentação da conta (histórico, forma de pagamento, total), pertence a uma **conta** (corrente, poupança, caixa…) e contém um ou mais rateios por rubrica. A aplicação oferece as visões “Movimentações” (um lançamento por linha), “Detalhamento” (um rateio por linha) e “Realizado”. Glossário em [`docs/modelo.md`](docs/modelo.md).

Modelo principal: `accounts` (contas, com saldo inicial), `payment_methods` (com conta padrão), `ledger_entries` (linha do extrato, com `account_id`) e `entry_splits` (rateio). A importação de extrato grava `import_profiles` (perfil por banco/formato), `statement_imports` e `statement_lines` (linhas abertas, deduplicadas por impressão digital); a conciliação (`db/migrations/001_schema.sql`) grava `reconciliation_links` (conjuntos 1:1, 1:N ou N:1 cujas somas batem) e `reconciliation_rejections` (sugestões recusadas); lançamentos podem ser marcados como fora do extrato. Plano completo em `docs/importacao-conciliacao.md`. A contabilidade (`db/migrations/001_schema.sql`) acrescenta a **conta contábil** (`ledger_code`, máscara `0.0.0.0.0000`) em rubricas e contas, os campos do OFX nas linhas do extrato e o ID OFX (`external_ids`) nas visões de lançamentos; ver `docs/contabilidade.md`.

## Arquitetura

- Next.js (App Router e Server Actions), um servidor Node (container)
- Login com Google (OpenID Connect, PKCE) para os e-mails cadastrados pelo administrador; sessão própria em cookie `httpOnly` (o banco guarda só o hash do token)
- PostgreSQL 17 (Azure Database for PostgreSQL em produção) com Row Level Security por grupo: cada consulta roda numa transação com o papel `authenticated` e o id do usuário (`lib/server/pg/db.ts`)
- Comprovantes no Azure Blob Storage (contêiner privado, URLs SAS curtas emitidas só depois da permissão no banco)
- Valores monetários armazenados como centavos inteiros
- Criação do lançamento e seus rateios em uma única transação SQL

## Telas

Rotas: o item do menu é o 1º segmento, a aba do cabeçalho é o 2º (`/financeiro/lancamentos/detalhamento`, `/financeiro/extrato/importar`, `/financeiro/configuracoes/rubricas`); a query string guarda só filtros e modos de exibição (`de`, `ate`, `conta`, `ano`, `agrupar`…). A raiz de cada área (`/financeiro/lancamentos`, `/financeiro/extrato`, `/financeiro/configuracoes`) leva à primeira aba.

Navegação: **Início · Lançamentos · Extrato · Mensalidades** no menu principal; **Configurações** (engrenagem) com as abas Contas, Rubricas, Formas de pagamento, Associados e Mensalidades; menu da pessoa (iniciais) com email, papel, **Usuários** (administração) e Sair. Extrato tem as abas **Conciliar** (`/financeiro/extrato/conciliar`) e **Importar** (`/financeiro/extrato/importar`), que levam a conta de uma para a outra. Exportar fica em Lançamentos. Todas as telas usam o mesmo cabeçalho (`components/finance/nav/page-header.tsx`).

- `/` — resumo do ano: receitas, despesas, saldo, documentos pendentes; mês a mês, últimos lançamentos e mensalidades atrasadas (do maior número de meses para o menor).
- `/financeiro/mensalidades?ano=` — grade de mensalidades (março a dezembro) por associado: pago, atenção, atrasado (pelo vencimento configurado) e sugestões a partir dos rateios da rubrica de mensalidade; isenção por ano. Ver `docs/mensalidades.md`.
- `/financeiro/lancamentos/movimentacoes` e `/financeiro/lancamentos/detalhamento` — lançamentos: **Movimentações** (uma linha por lançamento; o ID OFX preenchido indica que está conciliado) e **Detalhamento** (um rateio por linha), mesma tela (`app/lancamentos/entries-screen.tsx`); trocar de aba leva os filtros, colunas Conta e **ID OFX**, filtros na URL (`de`, `ate`, `conta`, `forma`, `pasta` = documentos, `associado`, `rubrica`, `q`, `ofx`; `rubrica` é compacto: `id` vale pela rubrica e todas abaixo dela, `-id` tira a rubrica e as de baixo, e vale o item mais próximo, ver `encodeCategorySelection` em `lib/categories.ts`; sem `de`, começa em 1º de janeiro do ano atual, `de=tudo` mostra todos) e conferência rápida dos documentos.
- `/financeiro/lancamentos/realizado?ano=` — terceira aba de Lançamentos: o Realizado do ano na tela (rubricas × meses, pais somando filhas, saldo), mesmo modelo da planilha (`lib/export/realized.ts`, `fetchRealizedModel`); grupos recolhíveis, cada valor abre o Detalhamento filtrado pela rubrica (um só ID na URL, que já inclui as filhas) e pelo mês ou ano; botão para baixar a planilha.
- `/financeiro/exportar/fluxo` (XLSX ou CSV), `/financeiro/exportar/realizado` (XLSX) e `/financeiro/exportar/contabil` (CSV em partida dobrada para o sistema contábil).
- `/financeiro/lancamentos/novo` — novo lançamento; com `?linha=<id>` ("Criar lançamento" na conciliação) vem preenchido pela linha do extrato e já sai conciliado.
- `/financeiro/extrato/conciliar` — extrato × lançamentos de uma conta e período (`conta`, `de`, `ate`; padrão: primeira conta ativa, mês atual): sugestões por mesmo valor no mesmo dia ou até 3 dias depois/antes, lançamentos "A definir" como candidatos, vínculo manual com conferência das somas, criar lançamentos e ignorar linhas em massa, fora do extrato, trocar conta, desfazer e fechamento com o saldo do extrato. Somente leitura para consulta.
- `/financeiro/lancamentos/[id]` — detalhes com o formulário completo (inclusive **Observações**, texto livre opcional por lançamento, que entra na busca) e as linhas do extrato vinculadas (com ID OFX); edição e exclusão para tesouraria/administração, somente leitura para consulta.
- `/financeiro/configuracoes/associados` — Configurações › Associados (nome, ramo, seção, patrulha, ativo); única aba de Configurações para consulta. Cadastro **Seções e patrulhas** (Ramo › Seção › Patrulha, `db/migrations/001_schema.sql`): seção escolhida numa lista do ramo (pré-selecionada se o ramo tem uma só), patrulha opcional da seção. Visualizações **Lista** (editável) e **Por seção** (`agrupar=secao`, agrupada e em ordem de nome), filtro `secao`; importação em massa por CSV (`nome, ramo, seção, patrulha, status`, seção e patrulha precisam estar cadastradas; com modelo para baixar e conferência antes de gravar; `db/migrations/001_schema.sql`).
- `/financeiro/extrato/importar` — importar extrato **OFX** numa conta (tesouraria e administração): a conta (banco) é escolhida em cada importação — vale para OFX convertidos —, o perfil de leitura da última importação da conta é aplicado sozinho (ajustes recolhidos), conferência com o que já existe na conta (novas, já importadas, suspeitas, órfãs), totais, saldos, TRNTYPE e ID OFX, e lista das importações recentes da conta com **desfazer** (`conta` na URL). Depois de importar, segue para `/financeiro/extrato/conciliar?conta=…&de=…&ate=…`.
- `/financeiro/configuracoes/contas|rubricas|formas|perfis|mensalidades` — Configurações (`app/(financeiro)/financeiro/configuracoes/[aba]`): contas (banco, agência, número, saldo inicial, conta contábil), rubricas com conta contábil, formas de pagamento com conta padrão e perfis de leitura do extrato OFX (contas em que foram usados, renomear, excluir) (tesouraria e administração).
- `/usuarios` — cadastro de e-mails e papéis (administração).

## Componentes

shadcn/ui com o preset `b1D0eVNQ` (estilo `base-mira`, primitivas Base UI, ícones Tabler) sobre Tailwind CSS v4. Os componentes, o `cn` e o tema (tokens do shadcn mapeados para a paleta do grupo, camada `legacy`) ficam no pacote compartilhado `@geas/ui` (`packages/ui`), usado também pelo Inventário; `app/globals.css` só importa `@geas/ui/theme.css`. Adicione componentes com `npx shadcn@latest add <nome>` dentro de `packages/ui`.

## Identidade visual

A interface usa a fonte Outfit (variável), escolhida por ter algarismos tabulares (`tnum`) para alinhar valores e datas; o site institucional continua em Poppins. Use a classe `num` em valores, datas e campos numéricos. A paleta segue a identidade do Grupo Escoteiro Albert Schweitzer: roxo para ações primárias, verde para suporte e sucesso, amarelo para foco e neutros quentes nas superfícies.

O navegador não fala com o banco: tudo passa pelo servidor. As políticas RLS e as funções transacionais validam novamente grupo, papel e fechamento do rateio no banco.

## Executar localmente

A infra local é um Docker Compose (`db/compose.yaml`) com PostgreSQL 17 (+ pgTAP) e o Azurite (emulador do Blob
Storage). É necessário ter Docker ativo e Node.js instalado. Todos os comandos rodam a partir da **raiz do monorepo**:

```bash
npm install              # instala todas as apps (nunca rode dentro de apps/gestao)
npm run infra:start      # sobe Postgres e Azurite, aplica as migrations e gera apps/gestao/.env.local
npm run dev:gestao       # aplicação em http://localhost:3000
```

### Serviços locais

| Serviço | Endereço | Para quê |
| --- | --- | --- |
| Aplicação | http://localhost:3000 | o Gestão |
| PostgreSQL | `postgresql://postgres:postgres@127.0.0.1:54330/geas` | `psql`, DBeaver etc. (dono dos objetos) |
| Azurite (Blob) | http://127.0.0.1:10000/devstoreaccount1 | comprovantes (contêiner `comprovantes`) |

O app conecta como `geas_app` (`DATABASE_URL`), um papel de login sem privilégios próprios que só troca para
`authenticated` ou `geas_auth` dentro de cada transação (`db/migrations/000_roles.sql`).

### Login com Google

1. No Google Cloud Console, crie um cliente OAuth do tipo **Aplicativo da Web** (tela de consentimento **Externo**,
   escopos `openid` e `email`) com o URI de redirecionamento `http://localhost:3000/auth/callback`.
2. Em `apps/gestao/.env.local`, acrescente `GOOGLE_CLIENT_ID=…` e `GOOGLE_CLIENT_SECRET=…` (o `infra:start`
   preserva as linhas `GOOGLE_*`). `APP_URL` vale `http://localhost:3000` por padrão fora de produção.

Entra quem tiver uma conta Google com o e-mail cadastrado em Usuários (qualquer domínio; o e-mail precisa estar
verificado no Google). No primeiro login a conta Google fica presa ao cadastro; para trocar de conta, remova e cadastre de novo. Para usar o app local sem Google,
rode o servidor com `E2E_LOGIN=1` (só em `next dev`): a tela de login mostra um campo "E-mail (teste)".

### Primeiro acesso local

1. **Cadastre o administrador e crie o grupo** (`psql` no banco local; troque o e-mail):

   ```sql
   insert into auth.users(email) values ('administrador@example.org');
   select public.admin_bootstrap_group('administrador@example.org', 'Grupo Escoteiro Albert Schweitzer');
   ```

   A função cria o grupo, torna o usuário administrador e cadastra rubricas e formas de pagamento iniciais.
   Só o dono do banco a executa, nunca a aplicação. Atalho: `docker compose -f apps/gestao/db/compose.yaml exec db psql -U postgres -d geas`.
2. **Entre** em http://localhost:3000/login com a conta Google desse e-mail (ou pelo login de teste).
3. **Cadastre as demais pessoas** em `/usuarios` (só administradores), com o papel em cada módulo:
   - **Administrador**: tudo, inclusive usuários;
   - **Tesoureiro**: lançamentos, associados e cadastros;
   - **Consulta**: somente leitura.

### Banco de dados local

```bash
npm run db:migrate --workspace=@geas/gestao   # aplica migrations novas sem apagar dados
npm run db:types --workspace=@geas/gestao     # regenera lib/server/pg/schema.ts depois de uma migration
npm run infra:reset                           # recria o banco do zero (apaga tudo; refaça o primeiro acesso)
npm run infra:status                          # migrations aplicadas e pendentes
npm run infra:stop                            # para os containers (os dados ficam nos volumes)
```

Consultas úteis:

```sql
-- quem tem acesso e com qual papel
select u.email, m.role, u.last_sign_in_at from public.memberships m join auth.users u on u.id = m.user_id;

-- trilha de auditoria mais recente
select created_at, action, entity_id, details from public.audit_events order by id desc limit 50;
```

### Produção (Azure)

Estrutura mínima: um Container App (o Next em container), um Azure Database for PostgreSQL Flexible Server e uma
conta de armazenamento com o contêiner privado `comprovantes`. Passo a passo, papéis do banco e variáveis em
[`db/README.md`](db/README.md). Variáveis do app:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | `postgres://geas_app:<senha>@<servidor>.postgres.database.azure.com:5432/geas?sslmode=verify-full` |
| `APP_URL` | origem pública, ex.: `https://gestao.escoteirosalbert.com.br` (cookies `Secure` e redirect do Google) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | cliente OAuth com o redirect `<APP_URL>/auth/callback` |
| `AZURE_STORAGE_ACCOUNT_URL` | `https://<conta>.blob.core.windows.net` (identidade gerenciada do app com "Storage Blob Data Contributor") |
| `NEXT_PUBLIC_FEATURE_*` | toggles de `lib/features.ts` (lidos no build) |

Nunca defina `E2E_LOGIN` em produção (de qualquer forma, ele não liga num build de produção).

### Segurança operacional

- O app não tem chave que ignore a RLS: usuários, papéis e remoções passam pelas funções auditadas como o administrador da sessão (`group_users`, `admin_add_member`, `admin_remove_member`).
- `admin_bootstrap_group` (criar grupo) só roda como o dono do banco, nunca pela aplicação.
- Remover um usuário tira o vínculo com o grupo; sem outro grupo, bloqueia o cadastro, solta a conta Google e derruba as sessões abertas. Lançamentos antigos preservam a autoria.
- Mudanças de papel, remoções, cadastros, lançamentos, contas, rubricas, formas de pagamento, perfis de importação e importações de extrato geram eventos de auditoria.

### Qualidade

Execute `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`, `npm run test:e2e` e `npm run build` antes de publicar (todos a partir da raiz).

### Testes

| Comando (raiz) | O quê | Precisa |
| --- | --- | --- |
| `npm test` | Vitest: funções de `lib/` (dinheiro, OFX, filtros, exportações…) | nada |
| `npm run test:db` | pgTAP (pg_prove dentro do container) com tudo de `db/tests/` | `npm run infra:start` |
| `npm run test:e2e` | Playwright (Chromium desktop) contra um `next dev` próprio na porta 3210, com `E2E_LOGIN=1` | infra local e `.env.local` |

**Banco (`db/tests/`).** Cada arquivo abre e desfaz a própria transação (`begin … rollback`), então rodar não altera o banco local; nunca é preciso `infra:reset`. O pgTAP fica no schema `extensions`, só no banco local. O pg_prove pega todo `*.sql` da pasta:

- `rls_isolation.test.sql` — isolamento entre grupos: o admin de outro grupo não lê nem escreve (SELECT/INSERT/UPDATE/DELETE direto, funções auditadas e permissões dos comprovantes) lançamentos, rateios, extrato, rubricas, contas, associados, mensalidades (`fee_*`), anexos e auditoria;
- `rls_roles.test.sql` — papéis: consulta só lê; tesouraria escreve, mas não administra usuários nem lê `audit_events`; administração muda papéis, cadastra e remove (e quem sai perde o acesso);
- `rls_direct_writes.test.sql` — tabelas que só aceitam funções auditadas não têm escrita direta nem para admin/tesouraria do próprio grupo (associados são a exceção proposital);
- `sections.test.sql` — seções e patrulhas: só pelas funções auditadas, isolamento entre grupos e seção do mesmo ramo / patrulha da mesma seção no associado;
- `audit.test.sql` — as funções principais gravam `audit_events` com grupo, ação e autor;
- `_fixture.psql` — dados comuns desses quatro (incluído com `\ir`; a extensão `.psql` deixa o pg_prove de fora);
- os demais `*.sql` (contabilidade, conciliação, importação, mensalidades…) são scripts psql que terminam com `ok 1 - TUDO OK`: imprimem TAP mínimo (`1..1`), então rodam no pg_prove e também sozinhos, como diz o cabeçalho de cada um.

Para um arquivo só (em `apps/gestao`): `docker compose -f db/compose.yaml exec -T -w /tests -e PGOPTIONS='-c search_path=public,extensions' db pg_prove -U postgres -d geas /tests/rls_roles.test.sql`.

**Navegador (`e2e/`).** Antes da primeira vez: `npx playwright install chromium` (em `apps/gestao`). O projeto `setup` cadastra, se faltar, `e2e.admin@example.org` e o grupo “Grupo E2E (testes automatizados)” (`admin_bootstrap_group`, por `psql` no container), com as contas “Conta E2E” e “Conta E2E 2”, e entra pelo login de teste (`/auth/e2e`, ligado pelo Playwright com `E2E_LOGIN=1`). Os testes cobrem login (redirecionamento, e-mail sem cadastro, cookie inventado), lançamentos (criar, buscar, filtrar por conta e rubrica, editar, excluir pela lista e pelos detalhes), usuários (cadastrar, mudar papel, remover), mover em lote, comprovantes, importação do `nubank.ofx` das fixtures com “Criar lançamento” na conciliação, filtro Conciliado e desfazer importação.

Tudo acontece no grupo E2E, com nomes únicos começando por `E2E`, e é desfeito pela interface; no começo e no fim, uma limpeza (como o admin E2E, pelas funções auditadas) desfaz importações, perfis e lançamentos `E2E …` que um teste interrompido tenha deixado, e os cadastrados pelos testes (`e2e.convite.*`) são apagados. Os dados dos outros grupos não são tocados. O grupo E2E e seu admin ficam no banco entre execuções. Variável opcional: `E2E_PORT` (com `E2E_PORT=3000`, o servidor que já está rodando precisa de `E2E_LOGIN=1`). Relatório em `playwright-report/` (`npx playwright show-report`).

## Próximos módulos sugeridos

- Administração de usuários, papéis e convites
- Cadastro e edição de rubricas
- Associados e mensalidades
- Anexos de comprovantes em bucket privado
- Fechamento mensal e trilha de auditoria
