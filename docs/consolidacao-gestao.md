# Gestão: consolidação de financeiro e inventario e camada de dados

Status: **plano aprovado, não iniciado**. Data: 2026-11-17.

Objetivo: juntar `apps/financeiro` e `apps/inventario` num único app Next, **`apps/gestao`**
(`@geas/gestao`), com rotas por módulo, e isolar o Supabase atrás de uma camada de dados para que
a saída do Supabase (`docs/migracao-saida-supabase.md`) troque só a implementação dessa camada.

Fora do escopo: hospedagem e deploy. A hospedagem está em avaliação e **não será Vercel**. O CI só
tem os caminhos ajustados e não ganha nenhum passo de deploy.

## 1. Decisões

| Tema | Decisão |
|---|---|
| Nome | `apps/gestao`, pacote `@geas/gestao`, título "GEAS Gestão" |
| Rotas | módulo no 1º segmento: `/financeiro/...`, `/inventario/...`; `/`, `/login`, `/auth/*`, `/usuarios` ficam na raiz |
| Navegação | módulo = 1º segmento, menu = 2º, aba = 3º (ex.: `/financeiro/lancamentos/movimentacoes`) |
| Usuários | uma tela só, `/usuarios`, com uma coluna de papel por módulo |
| Login | um só, que vale para os dois módulos |
| Camada de dados | `lib/server/`: só ela conhece o Supabase, com regra de ESLint garantindo isso |
| Piloto | inventário: é pequeno (~2,3 mil linhas) e serve para testar o padrão antes do financeiro |
| Deploy | nada específico de host: sem `vercel.json`, sem `@vercel/*`, redirects em `next.config.ts`/`proxy.ts` |

## 2. Diagnóstico (2026-11-17)

- **Mesma base.** Os dois apps usam o mesmo projeto Supabase, a mesma tabela `memberships`, o
  mesmo login e o mesmo `@geas/ui`. O financeiro tem ~13,3 mil linhas, vitest e Playwright. O
  inventário tem ~2,3 mil linhas e nenhum teste.
- **Cópias simplificadas no inventário:** `lib/session.ts`, `lib/supabase/{server,proxy,env}.ts`,
  `proxy.ts`, `app/login/actions.ts`, `app/auth/confirm/route.ts`, `components/{app-header,brand,setup-needed}.tsx`,
  `app/layout.tsx` e o logout.
- **Divergências:**
  - `lib/money.ts`: no financeiro, `parseMoneyToCents` aceita negativo e não aceita `1.234,50`.
    No inventário, aceita `R$` e milhar, mas recusa negativo.
  - O login do inventário repete o domínio permitido em vez de usar `isAllowedEmail`
    (`@geas/ui/lib/roles`) e perdeu as mensagens de erro.
  - `next.config.ts` do inventário não tem os headers de segurança (HSTS, `X-Frame-Options` etc.).
  - O build do inventário usa `next build --webpack`; o do financeiro não.
  - A tela Usuários existe duas vezes: `/usuarios` no financeiro e `/configuracoes/usuarios` no
    inventário.
- **Acoplamento ao Supabase:** ~170 chamadas `.from`/`.rpc`/`.storage`/`.auth`, a maior parte em
  `app/` (páginas e actions montam a consulta PostgREST), e não em `lib/`. Outros pontos de
  acoplamento:
  - `ctx.supabase` circula por todo o código;
  - `SupabaseClient` aparece nos tipos de `lib/*-queries.ts`;
  - `{ data, error }` é tratado em cada chamada;
  - `lib/supabase/paged.ts` contorna o `max_rows` da API;
  - `packages/ui/src/lib/users.ts` usa a API admin.
- **As regras de negócio já estão fora do Supabase-cliente.** Estão nas funções SQL auditadas
  (RLS + `security definer`, testadas no pgTAP) e no TS puro (`fees.ts`, `reconciliation.ts`,
  `category-draft.ts` etc., testados no vitest). A camada, portanto, desacopla o **acesso**, não as
  regras.

## 3. Estrutura-alvo

```
apps/gestao/
  app/
    (gestao)/                 layout raiz: <html data-app="gestao">
      page.tsx                Início (blocos por módulo, conforme papel)
      login/  auth/confirm/  usuarios/
    (financeiro)/             layout raiz: <html data-app="financeiro">
      financeiro/
        lancamentos/  extrato/  mensalidades/  configuracoes/  exportar/
    (inventario)/             layout raiz: <html data-app="inventario">
      inventario/
        materiais/  movimentacoes/  configuracoes/{divisoes,familias}
  components/
    shell/                    header, marca, setup-needed (comuns)
    finance/                  componentes de hoje do financeiro
    inventory/                componentes de hoje do inventário
  lib/
    money.ts  format.ts       domínio puro comum
    finance/                  domínio puro do financeiro (lib/*.ts de hoje)
    inventory/                domínio puro do inventário
    routes.ts                 prefixos e construtores de rota (FIN, INV)
    server/                   camada de dados (seção 4)
      supabase/               ÚNICO lugar que importa @supabase/*
        client.ts  proxy.ts  service.ts  paged.ts  database.types.ts
      db.ts                   Db opaco, call(), DataError
      auth.ts                 currentUser, sendLoginCode, verifyLoginCode, verifyLink, signOut, refreshSession
      session.ts              getSession/pageSession/requireX (único que lê memberships)
      files.ts                upload/download assinados, remoção (anexos)
      users.ts                listar, cadastrar, papéis, remover (sai de @geas/ui)
      finance/                registry, entries, attachments, statements, fees, reports, home
      inventory/              materials, locations, families, movements
  supabase/                   migrations e tests (mesmo conteúdo de hoje)
  e2e/
```

**Um layout raiz por grupo** (route groups com `<html>` próprio). Assim, `data-app` continua no
`<html>`, e os seletores `:root[data-app="inventario"]` de `theme.css` e os portais de diálogo e
toast pegam a cor certa sem mudança. Custo: trocar de módulo recarrega a página inteira, o que é
aceitável. É preciso conferir como o Next 16 trata o 404 com vários layouts raiz
(`global-not-found`).

## 4. Camada de dados: regras

1. **Só `lib/server/supabase/**` importa `@supabase/*`.** Isso é garantido pelo ESLint
   (`no-restricted-imports`), que começa em `warn` e passa a `error` área por área. Exceções:
   `e2e/support` e `scripts/write-local-env.mjs`.
2. **Módulos de dados não dependem do Next.** `lib/server/{finance,inventory}/**`, `users.ts` e
   `files.ts` não importam `next/*` nem recebem `FormData`: a entrada é tipada e a saída é um tipo
   de domínio. Os scripts (transparência, importação da planilha) reutilizam os mesmos módulos.
   Só `lib/server/supabase/client.ts` usa `next/headers` (cookies).
3. **Uma função por caso de uso, com nome do domínio.** Por exemplo, `entries.list(db, filtros)`,
   `fees.setRecord(db, input)`, `materials.move(db, input)`. Não há repositório genérico, interface
   com várias implementações nem injeção de dependência: existe uma implementação por vez.
4. **Escritas continuam nas funções SQL auditadas.** A camada não reimplementa regra. Regra em TS
   fica no domínio puro (`lib/finance`, `lib/inventory`), com vitest.
5. **`Db` é opaco** fora de `lib/server/supabase`. Quem chama não consegue fazer `.from()`:
   ```ts
   // lib/server/db.ts
   declare const brand: unique symbol;
   export type Db = { readonly [brand]: true };
   export class DataError extends Error {
     constructor(message: string, readonly code?: string) { super(message); }
   }
   ```
6. **O RLS continua sendo a barreira.** O `Db` do usuário vem da sessão (`member.db`).
   `serviceDb()` (chave secreta) só aparece em `users.ts` e nos scripts, e a lista de usos é
   revisada na fase 4.
7. **Erros:** a camada lança `DataError` com a mensagem para o usuário. As actions usam um helper
   comum, `runAction`, que generaliza o `run()` de `inventario/app/materiais/actions.ts` e converte
   o erro em `ActionResult` para o `use-action-toast`. Uma leitura que hoje mostra erro na tela
   devolve o erro no próprio tipo de retorno (como `EntryPage.error`).
8. **Paginação:** o limite `max_rows` é resolvido dentro da camada (`paged.ts`). Quem chama pede
   "todas" ou "página N".
9. **Tipos:** `database.types.ts` é gerado (`npm run db:types` → `supabase gen types typescript --local`)
   e usado só dentro de `lib/server/supabase`. Na saída do Supabase, troca-se pelo gerador do driver
   novo, sem mexer em quem chama.
10. **Fica na action, não na camada:** validação da entrada (zod), `revalidatePath` e `redirect`.

Exemplo do formato:

```ts
// lib/server/inventory/materials.ts
export async function move(db: Db, input: MoveInput): Promise<void> {
  await call(db, "inventory_move_material", { p_material_id: input.materialId, /* ... */ });
}

// app/(inventario)/inventario/materiais/actions.ts
export async function moveMaterial(formData: FormData): Promise<ActionResult> {
  return runAction(requireInventoryEditor, async (member) => {
    const input = parseMove(formData);
    await materials.move(member.db, input);
    revalidatePath(INV.materials);
    return "Movimentação registrada.";
  });
}
```

Sessão unificada:

```ts
type Member = {
  db: Db; userId: string; email: string; groupId: string; isAdmin: boolean;
  finance: { role: GroupRole; canEdit: boolean };
  inventory: { role: InventoryRole; canEdit: boolean; canManage: boolean };
};
// guardas: pageMember, requireAdmin, requireFinanceEditor, requireInventoryEditor, requireInventoryManager
```

## 5. Método por área

Cada área (o inventário e cada módulo do financeiro) segue os mesmos passos, em PRs separados:

1. **Rede:** conferir que o E2E cobre os fluxos principais da área e escrever o que faltar
   **antes** de mexer.
2. **Converter:** criar `lib/server/<módulo>/<área>.ts` e trocar as chamadas em páginas, actions e
   `lib/*-queries.ts`.
3. **Fechar:** subir a regra de ESLint para `error` nos caminhos da área, com E2E, vitest e pgTAP
   verdes.

## 6. Fases

### Fase 0: rede de segurança (≈1 dia)

O E2E do financeiro já cobre:

- login;
- lançamentos: criar, filtrar, editar, excluir, mover de conta, anexos;
- rubricas;
- importar OFX e conciliar;
- devedores;
- Realizado;
- usuários.

Faltam, e entram aqui por serem rotas que a fase 1 muda:

- [x] Mensalidades › Controle (`e2e/fees.e2e.ts`): rubrica em Configurações › Mensalidades, sugestão vinda
  do lançamento, confirmar sugestões, marcar e limpar uma caixinha, isentar e remover a isenção.
- [x] Configurações (`e2e/settings.e2e.ts`): conta (cadastrar, editar, inativar), forma de pagamento
  (cadastrar, conta padrão, renomear, inativar) e importação de associados por CSV com linha de erro.
- [x] Exportações (`e2e/exports.e2e.ts`): fluxo XLSX e CSV, Realizado XLSX, contábil (422 sem conta
  contábil, CSV windows-1252) e transparência (JSON), conferindo tipo, nome do arquivo e conteúdo.

Pronto quando: os testes novos passam no app atual. **Concluída em 2026-11-17**: 22 testes E2E verdes.

Achado: o `parseMoneyToCents` do financeiro recusa `1.234,56`. O formulário de conta volta vazio,
sem gravar. O teste usa `1234,56` por enquanto. A unificação do `money.ts` na fase 2 corrige isso
e devolve `1.234,56` ao teste de contas.

### Fase 1: esqueleto `apps/gestao` (≈2–3 dias)

Nesta fase o financeiro não muda de comportamento, só de endereço.

1. **Renomear:** `git mv apps/financeiro apps/gestao`; pacote `@geas/gestao`.
   - Na raiz: scripts `dev`, `dev:gestao` e os scripts `infra:*`, `test:*` apontando para `@geas/gestao`.
   - `ci.yml`: `working-directory` e caminhos de artefatos.
   - `prebuild` do institucional: `--workspace=@geas/gestao`.
   - Mensagens de `export-transparency.ts` (`apps/gestao/.env.local`).
2. **Domínio puro em subpastas:** mover os `lib/*.ts` do financeiro para `lib/finance/`, menos
   `money.ts` e `format.ts`, que são comuns. Os componentes vão para `components/finance/`. Fazer
   num commit mecânico só de `git mv` e imports.
3. **Rotas:**
   - Criar os grupos `(gestao)` e `(financeiro)`, cada um com seu layout raiz.
   - Mover lançamentos, extrato, mensalidades, configurações e exportar para `/financeiro/...`.
   - `lib/routes.ts` com os prefixos. Trocar os hrefs, `redirect`, `revalidatePath` e `listHref`
     escritos à mão.
4. **Redirects permanentes** em `next.config.ts` das rotas antigas (`/lancamentos/:path*` →
   `/financeiro/lancamentos/:path*` etc.) para não quebrar favoritos e links.
5. **Header (`@geas/ui` `AppHeader`):** seletor de módulo junto da marca (prop `modules`, visível
   conforme o papel). `/usuarios` sai do menu da conta. Atualizar `theme.css` e o comentário sobre
   `data-app` para incluir `gestao`.
6. **Sessão unificada** (`Member` da seção 4, ainda com o Supabase direto). Trocar `canEdit` por
   `member.finance.canEdit`.
7. **Supabase:**
   - A pasta continua `apps/gestao/supabase`.
   - ⚠ No mesmo merge, atualizar o caminho na integração GitHub do painel do Supabase. Se o
     caminho ficar errado, as migrations deixam de ser aplicadas (não há dano, mas a falha passa
     despercebida). Conferir no primeiro push.
   - Site URL e Redirect URLs do Auth no painel.
8. **Documentação:** juntar `AGENTS.md` e `README.md`. Atualizar o CLAUDE.md (seções financeiro,
   inventario, rotas) e o `modelo.md` de cada módulo (`docs/finance/`, `docs/inventory/`).

Pronto quando:

- lint, typecheck, vitest, pgTAP e E2E estão verdes, com o E2E já nas rotas novas;
- as rotas antigas redirecionam.

**Concluída em 2026-11-17** no branch `gestao/fase-1`:

- **Verificação:** lint, typecheck (todos os workspaces), vitest (254), pgTAP (483), E2E (25, com o novo
  `e2e/routes.e2e.ts`: redirects, raiz do módulo, `data-app` e 404) e `next build` verdes.
- **Desvios do plano:**
  - **Rotas:** os literais foram prefixados por codemod (`"/lancamentos` → `"/financeiro/lancamentos`)
    em vez de passar por um `lib/routes.ts`. O resultado é mais fácil de achar com grep e não exigiu
    trocar strings por templates. O `lib/routes.ts` só vale a pena se a fase 2 mostrar repetição.
  - **Header:** o seletor de módulo já existia (`AppBrand` do `@geas/ui`, com `financeiroHref` e
    `inventarioHref`). O link para o inventário continua sendo `NEXT_PUBLIC_INVENTARIO_URL` até a
    fase 2. Usuários continua no menu da conta, agora como tela comum aos módulos.
  - **Supabase local:** o `project_id` continua `geas-financeiro`, para não perder os volumes do
    Docker (o nome do container é usado no E2E).
  - **`modelo.md`:** continua em `apps/gestao/docs/`. A mudança para `docs/finance/` fica para quando
    o inventário trouxer o dele.
- **Pendente fora do código, no merge para `main`:**
  - caminho das migrations na integração GitHub do Supabase;
  - Site URL e Redirect URLs do Auth;
  - decisão D1.

### Fase 2: inventário como piloto (≈3–4 dias)

Inclui a base da camada, a sessão, o login e os usuários, que os dois módulos usam.

1. **Base da camada:**
   - `lib/server/supabase/*`, `db.ts`, `auth.ts`, `session.ts`, `runAction`, `npm run db:types`;
   - regra de ESLint em `warn` para todo o app;
   - login, `auth/confirm`, logout e `proxy.ts` passam a usar `auth.ts`.
2. **Mover o inventário** para `(inventario)/inventario/...`, `components/inventory/` e
   `lib/inventory/`, ainda com as chamadas atuais.
   - Unificar `money.ts`: aceitar `R$`, milhar e negativo, com opção de recusar negativo onde o
     inventário exige. Escrever vitest cobrindo os casos dos dois apps.
   - Descartar as cópias (login, auth, proxy, header, brand, setup-needed).
   - Configurações do inventário: abas Divisões e Famílias. Usuários vai para `/usuarios`.
3. **E2E do inventário** (é a rede, antes de converter):
   - cadastrar material por unidade e por lote;
   - movimentar;
   - movimento de chefe nasce `pendente` e o gestor revisa;
   - criar divisão e família;
   - consulta não vê ações de edição.

   Usuários de teste com `inventory_role` em `e2e/support/db.ts`.
4. **Converter:**
   - `lib/server/inventory/{materials,locations,families,movements}.ts`;
   - `inventario/lib/locations.ts` e `components/materials/data.ts` deixam de consultar.
5. **Converter usuários:** `packages/ui/src/lib/users.ts` → `lib/server/users.ts` (com
   `serviceDb()`). O componente `users-manager` continua em `@geas/ui` e recebe as actions.
6. **Fechar:** ESLint em `error` para `app/(inventario)/**`, `lib/inventory/**`,
   `components/inventory/**`, `lib/server/{session,auth,users}.ts`.
7. **Remover `apps/inventario`** (pasta, scripts da raiz, `--webpack`). Os scripts
   `planilha-para-csv.mjs` e `importar-planilha.mjs` vão para `apps/gestao/scripts/inventory/`.
   O momento da remoção depende da decisão D1.
8. **Retrospectiva:** ajustar as regras da seção 4 com o que o piloto ensinou e registrar o padrão
   no CLAUDE.md antes da fase 3.

Pronto quando: nenhum `@supabase` aparece nos caminhos do inventário e o E2E do inventário está
verde.

**Concluída em 2026-11-17** no branch `gestao/fase-2`:

- **Verificação:** typecheck (todos os workspaces), vitest (271), E2E (29, com 4 novos do inventário:
  gestor, peça com etiqueta, chefe com movimento pendente, consulta) e `next build` verdes. Lint sem
  erros; os 16 avisos restantes são do financeiro, que é a fase 3.
- **`apps/inventario` removido.** A tela Usuários é só `/usuarios`. `@geas/ui` não tem mais código de
  banco nem depende de `@supabase/supabase-js`.
- **CI só manual** (`workflow_dispatch`) enquanto durar a consolidação.
- **Ficaram fora do Git, em `apps/inventario/`:** `.env.local`, `.next` e `node_modules`. Podem ser
  apagados à mão.

**Retrospectiva** (ajustes ao padrão da seção 4, já aplicados):

- **`rpc(db, fn, args)` tipado** pelos tipos gerados (`npm run db:types`). Pega erro de nome de
  parâmetro em tempo de compilação. O gerador não marca parâmetro anulável, então o `rpc()` aceita
  `null` em todos.
- **Views geradas com colunas anuláveis.** As leituras convertem para os tipos de domínio de
  `lib/inventory/model.ts`, que são os que as telas usam.
- **`unwrap`/`rowsOf` tipam pela resposta inteira do PostgREST**, que é uma união de sucesso e erro.
- **Leituras que falham lançam `DataError`.** Antes, a tela mostrava lista vazia em silêncio. Cada
  módulo ganha um `error.tsx` (o inventário já tem).
- **`SessionUser { id, email }`** no lugar do `User` do Supabase. As telas só usavam esses dois campos.
- **A regra de ESLint funciona com os grupos de rota** (`app/(inventario)/**`): foi testada e dá erro.
  A lista `CONVERTED` em `eslint.config.mjs` cresce a cada área convertida.
- **Validação continua nas actions.** As funções de dados recebem entrada já tipada. É o que permite
  reutilizá-las em scripts na fase 3.5.
- **Dinheiro:** `parseMoneyToCents` agora é um só (milhar, `R$`, `allowNegative`). O bug achado na fase 0
  está corrigido e o teste de contas voltou a usar `1.234,56`.

### Fase 3: financeiro, área por área (≈6–9 dias)

A ordem segue as dependências: primeiro quem é lido por todos, por último quem agrega tudo.

| # | Área | Conteúdo | Por que nesta posição | Rede E2E |
|---|---|---|---|---|
| 3.1 | **Cadastros** (`finance/registry.ts`) | Configurações: contas, rubricas (`save_category_tree`), formas, perfis OFX, regra de mensalidades, seções; associados e importação CSV; opções de `lancamentos/context.ts` | Todas as outras áreas leem esses catálogos. São leituras simples e de baixo risco, e fixam o padrão de leitura | rubricas (existe) + fase 0 |
| 3.2 | **Lançamentos** (`finance/entries.ts`, `attachments.ts`, `files.ts`) | Movimentações, Detalhamento, `[id]`, novo, ações em lote, anexos (Storage), `entry-queries.ts`, `paged.ts` para dentro da camada | É o núcleo: extrato e mensalidades dependem de lançamentos e rateios. É a área com mais chamadas e onde entram Storage e paginação | existe (completo) |
| 3.3 | **Extrato** (`finance/statements.ts`) | Importar OFX, perfis, saldo inicial, desfazer importação, conciliar, `import-queries.ts` | Depende de lançamentos (a conciliação cria e vincula lançamentos) | existe |
| 3.4 | **Mensalidades e devedores** (`finance/fees.ts`, `debts.ts`) | Controle, sugestões, isenções, devedores, `fee-queries.ts` | Depende de rateios e associados | devedores (existe) + controle (fase 0) |
| 3.5 | **Relatórios e exportações** (`finance/reports.ts`) | Realizado, `/financeiro/exportar/*`, `lib/finance/export/queries.ts`, `scripts/export-transparency.ts` com `serviceDb()` | Lê tudo o que veio antes. O script do `prebuild` do institucional passa a usar a camada | Realizado (existe) + exportações (fase 0) |
| 3.6 | **Início** (`finance/home.ts` + resumo do inventário) | Dashboard (`app/page.tsx`): totais por mês, pendências, mensalidades em atraso; bloco do inventário (pendentes de revisão) para quem tem papel | Agrega todas as áreas, então fica por último. Vira o Início do Gestão | criar smoke do Início |

Cada linha é um PR e segue o método da seção 5.

**3.6 adiantada em 2026-11-17** (`62329c4`): `/` virou o Início geral, com o que precisa de atenção nos dois
módulos e um cartão por módulo. O Resumo do financeiro foi para `/financeiro`, agora com o saldo das contas.
Os dados vêm de `lib/server/finance/home.ts` e `lib/server/inventory/overview.ts`. As mensalidades atrasadas
ainda passam por `fetchFeeYear` (de `lib/finance/fee-queries.ts`), que será convertido na 3.4.

### Fase 4: fechamento (≈1 dia)

- ESLint `error` no app inteiro. `rg "@supabase" apps/gestao --glob '!lib/server/supabase/**' --glob '!e2e/**'`
  não retorna nada.
- Revisar os usos de `serviceDb()`.
- Remover `@supabase/*` das dependências de `@geas/ui`.
- Atualizar `docs/migracao-saida-supabase.md`: a seção 4.2 passa a ser "reimplementar
  `lib/server/supabase/*`, `auth.ts` e `files.ts`". Listar as funções SQL usadas por módulo.
- CLAUDE.md: consolidar as seções em "gestao" e registrar as regras da camada.

**Total estimado:** 13–18 dias de trabalho focado.

## 7. Relação com a saída do Supabase

Depois da fase 4, os passos do plano de saída ficam assim:

| Peça | Antes deste plano | Depois |
|---|---|---|
| Acesso a dados (4.2) | converter ~170 chamadas em ~45 arquivos | reimplementar os módulos de `lib/server/` mantendo as assinaturas |
| Auth (4.3) | 2 apps, login duplicado | trocar `lib/server/auth.ts` e a tela de login, uma vez |
| Storage (4.4) | chamadas em 3 arquivos | trocar `lib/server/files.ts` |
| Hospedagem (4.6) | 2 apps, 2 imagens, 2 domínios | 1 app, 1 imagem |

Os testes E2E escritos aqui são a comparação antes/depois que o plano de saída pede (seção 8 do
plano de saída).

## 8. Decisões abertas

- **D1. Produção durante a transição.** Os projetos atuais de deploy apontam para
  `apps/financeiro` e `apps/inventario`. Depois do merge da fase 1, o build do financeiro falha e
  a produção fica congelada na última versão boa. As migrations continuam sendo aplicadas se o
  caminho no painel do Supabase for atualizado. Opções:
  - **(a)** apontar temporariamente o projeto do financeiro para `apps/gestao` e deixar o do
    inventário congelado até a nova hospedagem;
  - **(b)** trabalhar num branch longo `gestao` até a hospedagem estar definida. É mais seguro
    para a produção, mas tem risco de conflito se houver migrations novas em `main` nesse tempo;
  - **(c)** aceitar o congelamento da produção enquanto a hospedagem é decidida.
- **D2. `@geas/ui` continua pacote?** Com um app só, perde o motivo de existir. Recomendação:
  manter por enquanto (mover tudo para dentro do app é ruído sem ganho agora) e reavaliar depois
  da fase 4.
- **D3. Domínio antigo do inventário:** redirecionar para `/inventario` pelo `Host` no
  `proxy.ts`, o que funciona em qualquer host. Decidir junto com a hospedagem.

## 9. Riscos

- **Troca de rotas (fase 1):** links escritos à mão e caminhos em `revalidatePath` passam
  despercebidos. Mitigação: `lib/routes.ts`, uma busca por `"/lancamentos`, `"/extrato` e
  `"/mensalidades` e o E2E.
- **Camada furada:** quem chama acaba recebendo um objeto do Supabase. Mitigação: `Db` opaco,
  ESLint e tipos de retorno de domínio, sem `PostgrestResponse`.
- **Abstração demais:** uma interface genérica de repositório imitando o PostgREST. A regra 3 da
  seção 4 proíbe isso.
- **Integração GitHub do Supabase:** caminho das migrations alterado sem atualizar o painel
  (fase 1, item 7).
- **Vários layouts raiz:** o comportamento do 404 e a recarga ao trocar de módulo precisam ser
  validados no Next 16 logo no início da fase 1.
