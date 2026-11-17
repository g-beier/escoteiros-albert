# Saída do Supabase: avaliação e plano de migração

Status: **avaliação** (nada implementado). Data: 2026-11-16.

> **Atualização de 2026-11-17: consolidação feita.** Financeiro e inventário são agora `apps/gestao`, e todo
> acesso ao banco passa por `apps/gestao/lib/server/` (`docs/consolidacao-gestao.md`). A hospedagem não será
> Vercel. Com isso, as seções 4.2 a 4.4 abaixo ficaram assim:
>
> - **4.2 Dados:** em vez de converter ~170 chamadas espalhadas, reimplementar `lib/server/supabase/*` e os
>   módulos de `lib/server/{finance,inventory}/*` sobre o driver Postgres, mantendo as assinaturas (`Db`, tipos de
>   domínio, `DataError`). Telas e actions não mudam, e o ESLint impede `@supabase/*` fora de `lib/server`.
>   As consultas do Financeiro movidas como estavam usam `untyped(db)` e o PostgREST (selects embutidos,
>   `count`, `fetchPaged`): são as que mais pedem SQL novo.
> - **4.3 Auth:** trocar `lib/server/auth.ts` (código, link, logout, renovação no `proxy.ts`) e a tela de login.
>   A sessão (`lib/server/session.ts`) só usa `currentUser()`.
> - **4.4 Storage:** trocar `lib/server/files.ts` (URLs assinadas de envio e leitura, remoção). Só os comprovantes
>   (`lib/server/finance/attachments.ts`) usam.
> - **Chave de serviço:** só `lib/server/users.ts` (Auth admin e `memberships`) e `scripts/export-transparency.ts`.
>
> Funções SQL e tabelas/visões por módulo (o que cada reimplementação precisa cobrir):
>
> | Módulo (`lib/server/…`) | Funções SQL | Tabelas e visões lidas |
> |---|---|---|
> | `finance/registry` | create/update_account, set_account_active, create/update_payment_method, set_payment_method_active, set_payment_method_default_account, save_category_tree, rename/delete_import_profile | accounts, payment_methods, categories, associates, statement_imports |
> | `finance/associates` | import_associates, create/update_section, create/update_patrol | associate_rows, associates (insert/update direto), sections, patrols |
> | `finance/entries` | create/update/delete_ledger_entry, set_entry_document_filed, move_ledger_entries_account, ledger_entry_history | ledger_entries, ledger_entry_rows, entry_split_rows, entry_attachments, categories, reconciliation_link_rows |
> | `finance/attachments` + `files` | add/delete_entry_attachment | entry_attachments, ledger_entries; bucket `comprovantes` |
> | `finance/reconciliation` | link/unlink_reconciliation, reject_reconciliation_suggestion, ignore_statement_line(s), reopen_statement_line, set_ledger_entry_outside_statement, set_ledger_entry_account, create_entry_from_statement_line, create_entries_from_statement_lines | statement_lines, ledger_entry_rows, reconciliation_link_rows, reconciliation_rejections, statement_imports, accounts, payment_methods |
> | `finance/statements` | save_import_profile, import_statement_lines, preview_statement_lines, delete_statement_import, account_balance_before | statement_imports, statement_lines, import_profiles, accounts |
> | `finance/fees` + `debts` | set_fee_record, confirm_fee_suggestions, set_fee_exemption, set_fee_settings, set_fee_year_settings, set_fee_associate_price, add/delete_associate_movement, debt_rows, save/delete_debt, pay_debts | fee_* , associate_movements, associate_rows, fee_split_candidates, ledger_entries, entry_split_rows, debt_payments |
> | `finance/reports` + `home` | realized_by_month, account_balance_before | categories, ledger_entries, ledger_entry_rows, entry_split_rows, accounts, statement_lines, groups |
> | `inventory/*` | inventory_save_location, inventory_place_location, inventory_save_family, inventory_save_material, inventory_add_lot/unit, inventory_transfer_lot/unit, inventory_set_lot/unit_condition, inventory_adjust_lot, inventory_write_off_lot/unit, inventory_update_lot/unit, inventory_next_tag | inventory_locations, inventory_location_paths, inventory_families, inventory_materials, inventory_material_rows, inventory_stock_by_location, inventory_lots, inventory_units, inventory_counts, inventory_movements |
> | `users` | record_user_invite, admin_change_member_role, admin_change_inventory_role, admin_remove_member | memberships; Auth admin (convite, lista, bloqueio) |

Objetivo: deixar de depender do Supabase (banco, autenticação, storage, ferramentas de dev/CI) e hospedar
financeiro, inventario e (opcionalmente) o site institucional numa nuvem com custo zero ou mínimo.
Destinos avaliados: **Azure** (crédito Microsoft for Nonprofits de ~US$ 2.000/ano já ativo) e
**Google Cloud** (o grupo já usa Google Workspace; reunião com o Google marcada).

## 1. Resumo

- **A maior parte do trabalho não depende da nuvem escolhida.** Sair do Supabase significa trocar
  PostgREST (`supabase.from/rpc`), Supabase Auth e Supabase Storage por código próprio sobre
  Postgres padrão. Isso é ~80% do esforço e é idêntico para Azure e Google Cloud.
- **O banco continua Postgres.** As 39 migrations, as 154 funções `security definer`, o RLS e os
  testes pgTAP são preservados com um pequeno "shim" que recria `auth.uid()` e os papéis
  `anon`/`authenticated` (seção 4.1). Não há reescrita do modelo.
- **Login com Google Workspace** é a melhor troca para o Supabase Auth em qualquer nuvem: todos os
  usuários já são `@escoteirosalbert.com.br`, o consentimento OAuth "Interno" restringe à
  organização, e deixa de existir envio de e-mail com código.
- **Firebase não é recomendado** (seção 6): Firestore exigiria reescrever o modelo contábil
  inteiro e abandonar SQL, RLS e pgTAP.
- **Custo estimado:** ~US$ 15–25/mês na Azure (coberto pelo crédito: custo efetivo zero) ou
  ~US$ 10–15/mês no Google Cloud (custo real, a menos que o Google ofereça crédito equivalente).
- **Esforço estimado:** ~3–4 semanas de trabalho focado, em fases que podem ser feitas localmente
  antes de escolher a nuvem.

Recomendação: executar as fases neutras (2–5) contra um Postgres local em Docker, decidir a nuvem
depois da reunião com o Google e só então fazer infra e corte (fases 6–7). Sem crédito
Google equivalente, ficar na **Azure**, porque o crédito já ativo zera o custo.

## 2. O que usamos do Supabase hoje

Levantamento feito no código em 2026-11-16.

| Recurso | Uso | Onde |
|---|---|---|
| PostgREST (`.from`) | ~110 chamadas, inclusive selects embutidos (`entry_splits(...)`, `debts!inner(...)`, `usage:ledger_entries(count)`) e paginação por `max_rows = 1000` (`lib/supabase/paged.ts`) | ~45 arquivos em financeiro, inventario e `packages/ui` |
| RPC (`.rpc`) | ~63 chamadas às funções SQL auditadas | idem |
| Auth: código por e-mail | `signInWithOtp` + `verifyOtp` (código de 6 dígitos e link `token_hash`), template `supabase/templates/magic_link.html` | `app/login/actions.ts` e `app/auth/confirm/route.ts` nos dois apps; `AppLoginForm` em `@geas/ui` |
| Auth: sessão | cookies de `@supabase/ssr`, renovação em `proxy.ts` | `lib/supabase/{server,proxy}.ts` nos dois apps |
| Auth admin | `inviteUserByEmail`, `listUsers`, `createUser`, `updateUserById` (ban), `deleteUser` | `packages/ui/src/lib/users.ts`, `e2e/support/db.ts` |
| Hook de domínio | `restrict_auth_domain` (Before User Created) | migration `002` (grants para `supabase_auth_admin`) |
| `auth.uid()` | 130 usos em RLS e funções | migrations |
| `auth.users` | ~29 FKs (`references auth.users(id)`) e leituras de e-mail em funções | migrations |
| Papéis | 101 `to authenticated`, revokes de `anon`/`public` | migrations |
| Storage | bucket privado `comprovantes`: upload por URL assinada, download por URL assinada, `remove`; políticas em `storage.objects`; `add_entry_attachment` lê tamanho e tipo de `storage.objects` | migration `027`, `app/lancamentos/actions.ts`, `app/lancamentos/[id]/anexos/[anexoId]/route.ts` |
| Ferramentas | `supabase start/test db/db reset`, `write-local-env.mjs`, container `supabase_db*` usado por `e2e/support/db.ts` e `inventario/scripts/importar-planilha.mjs`, Mailpit para o código de login no E2E | `apps/financeiro/package.json`, CI `db-e2e` |
| Deploy de migrations | integração GitHub do Supabase aplica `supabase/migrations` no push para `main` | painel Supabase |
| Script de transparência | `export-transparency.ts` usa a chave secreta via API | `apps/financeiro/scripts`, `prebuild` do institucional |

Não usados: Realtime, Edge Functions, GraphQL, Vault, pg_cron. Única extensão: `pgcrypto`
(disponível na Azure e no Cloud SQL).

## 3. Arquitetura-alvo

Comum às duas nuvens:

- **Postgres 17 gerenciado**, com papéis `anon`/`authenticated` e o schema `auth` do shim.
- **Apps Next** em container (`output: "standalone"`), escalando a zero quando ociosos.
- **Login Google** (Workspace) com sessão em cookie, guardada no Postgres.
- **Acesso a dados** só no servidor, por um driver Postgres (sem API HTTP pública do banco).
- **Arquivos** em object storage com URLs assinadas.
- **Migrations** aplicadas por um job do GitHub Actions no push para `main`, depois do CI.

| Peça | Azure | Google Cloud |
|---|---|---|
| Postgres | Azure Database for PostgreSQL Flexible, B1ms (~US$ 12–15/mês + armazenamento) | Cloud SQL for PostgreSQL, db-f1-micro (~US$ 8–9/mês + SSD; núcleo compartilhado sem SLA) |
| Apps Next | Container Apps, plano de consumo (franquia mensal de 180 mil vCPU-s, 360 mil GiB-s e 2 milhões de requisições) | Cloud Run (mesma franquia em regiões Tier 1; menor em Tier 2, como São Paulo) |
| Imagens | GitHub Container Registry (grátis) | Artifact Registry (0,5 GB grátis) ou GHCR |
| Arquivos | Blob Storage + SAS de delegação de usuário | Cloud Storage + URL assinada V4 |
| Site estático | Static Web Apps, plano Free | Firebase Hosting, plano gratuito |
| Segredos | Key Vault ou secrets do Container Apps | Secret Manager |
| Deploy pelo GitHub | OIDC (federated credentials) | Workload Identity Federation |
| Crédito | Microsoft for Nonprofits, ~US$ 2.000/ano, **já ativo** | Google for Nonprofits: crédito Cloud **não confirmado** (perguntar na reunião) |

Os preços são indicativos (fontes de terceiros e páginas oficiais em US$/us-east ou
us-central). Regiões no Brasil costumam ser mais caras. Conferir na calculadora de cada nuvem.

O site institucional pode ficar no FTP atual: movê-lo é opcional e independente do resto.

### 3.1 Alternativa no Google Cloud: uma VM (Compute Engine)

Em vez de Cloud Run + Cloud SQL, tudo roda numa VM só: o app `gestao`, o Postgres e o proxy HTTPS,
com os comprovantes no Cloud Storage. O trabalho da seção 4 é o mesmo. Muda só a infra (fase 6).

**Por que considerar:** o grupo tem poucos usuários e carga baixa. Uma VM sai mais barata que o
Cloud SQL mais o Cloud Run, e tem uma conta só e uma instância só, o que simplifica o cache do Next
(4.6). Também não tem partida a frio. **Custo da escolha:** atualizações do SO e do Postgres e
backups ficam por nossa conta, e não há alta disponibilidade (uma falha da VM tira o app do ar até
ela voltar). Para o uso do grupo isso é aceitável.

#### Máquina: recomendado, mínimo e justificativas

| Item | Recomendado | Mínimo | Justificativa |
|---|---|---|---|
| Tipo | **e2-small** (2 vCPU compartilhadas, 2 GB) | **e2-micro** (2 vCPU compartilhadas, 1 GB) + 2 GB de swap | Em uso, o Next standalone ocupa ~250–350 MB, o Postgres ajustado ~300–500 MB, o Caddy ~30 MB e o SO ~200 MB. 2 GB dá folga para exportações XLSX (`exceljs`) e importação de OFX. 1 GB funciona, mas depende de swap e fica lento em picos. O build não roda na VM em nenhum dos dois casos. |
| Região | **`southamerica-east1`** (São Paulo) | `us-central1`, `us-east1` ou `us-west1` | São Paulo tem latência de ~10–30 ms para os usuários, contra ~150 ms nos EUA, e os dados ficam no Brasil. Só as três regiões dos EUA entram na camada sempre gratuita (1 e2-micro + 30 GB de disco padrão). |
| SO | **Debian 12** ou Ubuntu 24.04 LTS, com `unattended-upgrades` | idem | São LTS com atualização de segurança automática e Docker oficial. Container-Optimized OS também serve, mas complica o cron de backup e as ferramentas de diagnóstico. |
| Disco | **30 GB pd-balanced** | 20 GB pd-standard (30 GB na camada gratuita) | O banco atual tem poucas centenas de MB. O resto é imagens Docker, logs e WAL. O pd-balanced dá latência estável ao Postgres, e o pd-standard (HDD) basta para o volume baixo. |
| IP | **IPv4 externo estático** | idem | O DNS de `gestao.escoteirosalbert.com.br` aponta para ele, e o Let's Encrypt precisa do IP fixo. Um IP externo em uso é cobrado por hora, inclusive na camada gratuita. |
| Backup do banco | **`pg_dump` diário** para bucket com lifecycle de 90 dias + **snapshot diário** do disco (7 dias) | `pg_dump` diário (30 dias) | O dump restaura em qualquer Postgres e serve de saída da VM. O snapshot volta a máquina inteira em minutos. Não há backup gerenciado como no Cloud SQL, então essa parte é obrigatória. |
| Comprovantes | **Cloud Storage** (bucket privado, Standard, mesma região) | idem | Fora da VM, o disco não cresce com os anexos e um snapshot não leva arquivos. A URL assinada V4 mantém o envio e o download direto do navegador (4.4). |
| Custo indicativo | ~US$ 20–30/mês | ~US$ 4–5/mês (IP + bucket) | Conferir na calculadora (fontes). São Paulo custa ~50% mais que os EUA. Sem crédito Google, é custo real. |

**Quando subir para e2-medium (4 GB):** quando houver memória sob pressão (swap em uso constante,
OOM no `dmesg`), quando precisar de mais de uma instância do app (por exemplo, o site
institucional na mesma VM com SSR) ou se a opção for rodar o Supabase self-hosted (seção 7). A
troca de tipo só precisa parar e religar a VM. O disco e o IP continuam os mesmos.

#### O que roda na VM (docker compose)

| Serviço | Imagem | Exposição | Justificativa |
|---|---|---|---|
| `caddy` | `caddy:2` | 80/443 públicas | O HTTPS é automático (Let's Encrypt) e a configuração cabe em 3 linhas. Dispensa o load balancer (~US$ 18/mês). |
| `gestao` | imagem própria (`output: "standalone"`), gerada no GitHub Actions e publicada no Artifact Registry ou no GHCR | só na rede interna | Um `next build` do monorepo não cabe com folga em 1–2 GB. Na VM só se faz pull. |
| `postgres` | `postgres:17` (com pgcrypto) | rede interna + `127.0.0.1:5432` da VM | O banco nunca fica acessível pela internet. O acesso administrativo (export, migrations) é por túnel IAP até o localhost da VM. |

Configuração do Postgres para 2 GB (1 GB entre parênteses): `shared_buffers=256MB` (128MB),
`effective_cache_size=768MB` (384MB), `work_mem=8MB` (4MB), `max_connections=30`. O pool do app
fica em 5 conexões.

#### Rede e segurança

- **Firewall:** só 80 e 443 abertas para `0.0.0.0/0`. A 22 só aceita o intervalo do IAP
  (`35.235.240.0/20`), e o SSH sempre passa por `gcloud compute ssh --tunnel-through-iap`. O login
  é pelo **OS Login**, com contas do Workspace e sem chaves SSH soltas.
- **Service account própria da VM** (não a padrão do Compute), com:
  - `roles/storage.objectAdmin` só no bucket `comprovantes` e `roles/storage.objectCreator` no
    bucket de backups;
  - `roles/iam.serviceAccountTokenCreator` sobre ela mesma, para assinar URLs V4 via `signBlob`
    sem chave JSON no disco.
- **Segredos** (`DATABASE_URL`, segredo do OAuth, chave de sessão): no Secret Manager, lidos na
  subida, ou num `.env` com permissão 600 fora do repositório.
- **Bucket de backups** com retenção bloqueada (bucket lock) curta, para que um invasor na VM não
  apague o histórico.
- **Login Google** (4.3): o OAuth client "Interno" fica no mesmo projeto GCP.
- **Monitoramento:** o Ops Agent mostra memória e disco no Cloud Monitoring. Um uptime check em
  `/login` avisa por e-mail. Somam-se os alertas de orçamento (seção 8).

#### O que muda no plano

- **4.5, export de transparência:** o prebuild do institucional acessa o banco por túnel
  (`gcloud compute ssh gestao --tunnel-through-iap -- -N -L 5432:localhost:5432`, com o Postgres
  publicando a porta só em `127.0.0.1` da VM). Não precisa liberar IP no firewall.
- **4.5, migrations em produção:** são aplicadas por `psql`/`dbmate` pelo mesmo túnel. A
  automação por GitHub Actions fica para quando a hospedagem estiver decidida.
- **4.6, cache e partida a frio:** com uma instância sempre ligada, `revalidatePath` funciona sem
  ressalva e não há partida a frio.
- **4.6, deploy:** `docker compose pull && docker compose up -d` na VM.
- **Corte (fase 7):** igual, com restore no Postgres da VM.

## 4. Trabalho necessário (independente da nuvem)

### 4.1 Banco: shim de compatibilidade e rebaseline

Estratégia: **manter os nomes do Supabase** para que RLS, funções e testes rodem sem mudança.

1. Criar papéis `anon` e `authenticated` (`NOLOGIN`) e um papel de login da aplicação
   (`geas_app`), membro de `authenticated`. Um papel separado aplica as migrations e é dono das
   funções `security definer` (nenhuma das duas nuvens dá superusuário).
2. Criar o schema `auth` com:
   - `auth.users(id uuid primary key, email text unique not null, created_at, last_sign_in_at, banned_until)`,
     **preservando os UUIDs atuais** para não mexer nas ~29 FKs.
   - `auth.uid()` lendo o mesmo setting do Supabase
     (`current_setting('request.jwt.claims', true)::jsonb ->> 'sub'`). Assim os 130 usos e o
     helper `tests.login()` (31 `set_config('request.jwt.claims', ...)` nos testes) continuam
     funcionando sem alteração.
3. **Storage:** remover a dependência de `storage.objects` e `storage.buckets`:
   - As políticas de `storage.objects` (027) deixam de existir. As funções
     `can_read/write/delete_attachment_object` continuam e passam a ser chamadas pelo servidor
     antes de emitir uma URL assinada.
   - `add_entry_attachment` passa a receber tamanho e tipo, que o servidor lê das propriedades
     do blob depois do upload, em vez de consultar `storage.objects`.
4. Remover o hook `restrict_auth_domain` e os grants para `supabase_auth_admin` (002). A regra de
   domínio passa para o login (4.3), com um `check` em `auth.users.email` como garantia.
5. **Rebaseline das migrations.** As migrations 001–039 não rodam num Postgres sem Supabase, porque
   referenciam `storage.*`, `supabase_auth_admin` e `auth.users`. Proposta:
   - gerar `000_baseline.sql` a partir do schema de produção já limpo (`pg_dump --schema-only`,
     revisado à mão);
   - arquivar 001–039 em `supabase/migrations/_arquivo/` (ou só no histórico do git);
   - novas migrations seguem a partir de `040`.

   Alternativa: manter o histórico e criar um `000_plataforma.sql` com stubs de `storage.*`. É
   mais frágil e não é recomendada.
6. **Pasta:** renomear `apps/financeiro/supabase/` para `apps/financeiro/db/`
   (`migrations/`, `tests/`). Atualizar CLAUDE.md, AGENTS.md e os docs.

### 4.2 Camada de dados (maior bloco)

- Criar `lib/db.ts`, compartilhado em `packages/ui` ou num novo `packages/db`, com:
  - pool `postgres` (porsager) ou `pg`;
  - `withUser(userId, fn)`: abre uma transação, faz `set local role authenticated` e
    `set_config('request.jwt.claims', json, true)`, e executa `fn`. Todo acesso de
    usuário passa por aqui, então o **RLS continua sendo a barreira**, como hoje.
  - `withService(fn)` para o que hoje usa a chave secreta (lista de usuários, script de
    transparência).
- Converter as chamadas:
  - **~63 `.rpc(...)`:** viram `select * from fn(...)`. Conversão mecânica.
  - **~110 `.from(...)`:** viram SQL. Os selects embutidos e as contagens viram `join` ou
    `json_agg` (ou passam a ler uma view). `.range()`/`fetchPaged`/`API_PAGE` desaparecem,
    porque não há mais `max_rows`.
  - **Erros:** o formato `{ data, error }` some. Padronizar exceções e o retorno de
    `ActionResult` (`use-action-toast`).
- **Tipos:** hoje vários resultados são `as string`. Avaliar um query builder tipado (Kysely com
  tipos gerados por `kysely-codegen`) se o ganho compensar. Recomendação: SQL direto com tipos
  declarados por consulta, para manter a migração mecânica.
- Arquivos afetados:
  - `lib/session.ts` dos dois apps (`ctx.supabase` vira `ctx.db`);
  - todas as `actions.ts`, `page.tsx` com consultas e `lib/*-queries.ts`;
  - `lib/export/queries.ts`;
  - `inventario/components/materials/data.ts` e `inventario/lib/locations.ts`;
  - `packages/ui/src/lib/users.ts`.
- **Conexões:** containers que escalam a zero e têm poucos usuários pedem um pool pequeno por
  instância (ex.: 5). Na Azure há PgBouncer embutido. No Cloud SQL, usar o conector Node do
  Cloud SQL. `set local` é compatível com pool em modo transação.

### 4.3 Autenticação e usuários

**Recomendado: login com Google (Workspace).** Biblioteca: Better Auth ou Auth.js.

- Escolher na implementação, conferindo o suporte ao Next 16. Requisitos: provedor Google, sessão
  no Postgres, UUID como id de usuário e hook antes de criar o usuário.
- OAuth client com consentimento **"Interno"** no Google Cloud do Workspace, o que restringe o
  login à organização. Verificar também no servidor o claim `hd` e o domínio do e-mail. O parâmetro
  `hd` sozinho não basta.
- **Primeiro login:** casar pelo e-mail com o `auth.users` existente, preservando o UUID e, com
  ele, todo o histórico e a auditoria. E-mail sem cadastro prévio é recusado, como hoje com
  `shouldCreateUser: false`.
- **Tela Usuários (`@geas/ui` `users-manager`):**
  - "Convidar" passa a ser "cadastrar e-mail + papéis": cria a linha em `auth.users` e
    `memberships`, e o próprio Google cuida do resto.
  - "Confirmado" vira "já entrou" (`last_sign_in_at`).
  - Bloquear e remover usam `banned_until` e exclusão, como hoje.
- `AppLoginForm` (`@geas/ui`): troca o fluxo de e-mail e código por um botão "Entrar com Google".
  Saem `app/auth/confirm` e `templates/magic_link.html`.
- `proxy.ts`: faz uma checagem otimista do cookie de sessão. A validação real fica em
  `pageSession`/`memberOrError`.
- **Sessão entre apps:** financeiro e inventario continuam com logins separados, a menos que
  compartilhem o domínio do cookie (decisão opcional).
- **⚠ Conferir antes:** todo usuário atual precisa ser uma *conta* Workspace, não um alias nem um
  Google Group como `tesouraria@`. Endereços que forem grupos não conseguem fazer login Google.
- **Plano B, se algum usuário não tiver conta Workspace:** manter o código por e-mail (plugin
  e-mail OTP do Better Auth), com envio por Azure Communication Services Email ou pela API Gmail
  do Workspace.

### 4.4 Storage (anexos de comprovantes)

- **Upload:**
  1. A Server Action valida com `can_write_attachment_object` e emite uma URL assinada de PUT (SAS
     ou V4) para `comprovantes/<grupo>/<lançamento>/<arquivo>`.
  2. O navegador envia o arquivo.
  3. A action lê tamanho e tipo do blob e chama `add_entry_attachment`.
- **Download** (`anexos/[anexoId]/route.ts`): URL assinada de leitura com
  `Content-Disposition` para o nome do arquivo.
- **Exclusão:** o servidor apaga o blob, como hoje o `remove`.
- **Bucket:** configurar CORS para os domínios dos apps, limite de 50 MiB e os tipos aceitos
  (PDF, JPG, PNG, HEIC), validados no servidor.
- **Cópia dos arquivos existentes:** script que lista o bucket do Supabase e envia cada objeto
  para o novo destino, mantendo os caminhos.
- **Dev local:** Azurite (Azure) ou fake-gcs-server (Google) no docker compose.

### 4.5 Dev local, testes, scripts e CI

- `infra:start/stop/reset`: `docker compose` com `postgres:17` + pgTAP + o emulador de storage,
  aplicando as migrations com um runner simples (`dbmate` ou script `psql`).
  `write-local-env.mjs` passa a gravar `DATABASE_URL` e as credenciais do storage.
- `test:db`: `pg_prove` sobre `db/tests`. Os testes não mudam graças ao shim (4.1).
- **E2E:** o login por código lido no Mailpit deixa de existir. Criar uma rota de login só para
  testes, habilitada apenas com `NODE_ENV !== "production"` e uma variável específica, que cria a
  sessão para o usuário E2E. `e2e/support/db.ts` passa a usar `DATABASE_URL` em vez do admin API
  e do `docker exec`.
- `inventario/scripts/importar-planilha.mjs`: trocar o nome do container `supabase_db*` e
  `NEXT_PUBLIC_SUPABASE_URL` por `DATABASE_URL`. Continua recusando banco não local.
- `export-transparency.ts` (prebuild do institucional):
  - conexão direta com `DATABASE_URL`;
  - a máquina que faz o build precisa alcançar o banco de produção: regra de firewall por IP na
    Azure, ou Cloud SQL Auth Proxy;
  - a recusa de banco local passa a olhar o host do `DATABASE_URL`.
- **CI (`ci.yml`):** o job `db-e2e` troca `supabase/setup-cli` + `supabase start` por um
  `services: postgres` com pgTAP (imagem própria ou instalação no job).
- **Migrations em produção:** novo job no push para `main`, **depois** de `checks` e `db-e2e`
  (hoje a integração do Supabase não espera o CI), autenticado por OIDC.
- **Dependências:** remover `@supabase/ssr` e `@supabase/supabase-js` dos dois apps e de `@geas/ui`.

### 4.6 Hospedagem dos apps Next

- `next.config.ts`: `output: "standalone"`. Criar um Dockerfile por app (build do workspace na
  raiz do monorepo, por causa de `@geas/ui`).
- **Cache:** `revalidatePath`/`revalidateTag` (12 arquivos) funcionam como esperado com uma
  instância. Fixar o máximo de instâncias em 1–2 ou aceitar caches por instância (volume baixo).
- **Partida a frio:** com escala a zero, o primeiro acesso depois de um tempo parado leva alguns
  segundos. Com o crédito Azure dá para manter 1 instância mínima, se incomodar.
- **Domínios:** subdomínios atuais (hoje na Vercel) apontados para Container Apps ou Cloud Run.
  No Cloud Run, usar Firebase Hosting como front com rewrite para o serviço, ou um load
  balancer, conforme a região.
- **Variáveis:** `DATABASE_URL`, segredos do auth, credenciais do storage e
  `NEXT_PUBLIC_SITE_URL`. Saem `NEXT_PUBLIC_SUPABASE_*` e `SUPABASE_SECRET_KEY`.

## 5. Fases e corte

| Fase | Conteúdo | Depende da nuvem? | Estimativa (dias focados) |
|---|---|---|---|
| 1 | Decisões abertas (seção 7) e conferência das contas Workspace | parcialmente | — |
| 2 | Shim + rebaseline + docker compose + pgTAP verde (4.1, parte de 4.5) | não | 2–3 |
| 3 | Camada de dados nos dois apps e `@geas/ui` (4.2) | não | 5–8 |
| 4 | Auth Google + tela Usuários + E2E (4.3, 4.5) | não | 3–4 |
| 5 | Storage com emulador (4.4) | pouco (SDK) | 1–2 |
| 6 | Infra: banco, containers, storage, segredos, CI/CD, domínios (4.6) | **sim** | 2–3 |
| 7 | Corte e acompanhamento | sim | 1 + 30 dias de observação |

Corte (fase 7):

1. Avisar os usuários. Congelar escritas: tirar os apps do ar na Vercel ou pôr em manutenção.
2. `pg_dump --data-only` de `public` mais as colunas necessárias de `auth.users` (id, email,
   created_at) do Supabase, e restaurar no novo banco.
3. Copiar os objetos do bucket `comprovantes`.
4. Conferir contagens por tabela, saldos de contas (`account_balance`) e o Realizado do ano contra
   o sistema antigo.
5. Trocar o DNS. Os usuários entram com Google.
6. Manter o projeto Supabase pausado/somente leitura por 30 dias como rollback. Depois, exportar
   um backup final e encerrar.

## 6. Firebase: por que não

| Opção | Avaliação |
|---|---|
| Firestore (banco NoSQL) | Exige reescrever o modelo inteiro: partidas contábeis, rubricas em árvore, conciliação, saldos e relatórios hoje em SQL. Perde transações SQL, RLS, funções auditadas e os testes pgTAP. Regras do Firestore não substituem as 154 funções `security definer`. **Não recomendado.** |
| Firebase Data Connect / SQL Connect | Usa Cloud SQL Postgres (mesmo custo do banco), mas expõe GraphQL com autorização própria, sem o modelo RLS + funções atual. Seria uma segunda reescrita sem ganho. |
| Firebase Auth / Identity Platform | Viável só como peça de login, mas o login Google direto via Better Auth/Auth.js é mais simples e não acopla à plataforma. |
| Firebase Hosting | **Útil:** hospeda o site estático de graça e pode servir de front para o Cloud Run. |

Se a reunião com o Google sugerir Firebase, o caminho compatível com este plano é
**Google Cloud (Cloud SQL + Cloud Run) com Firebase Hosting na frente**, não Firestore.

## 7. Decisões abertas

1. **Nuvem:** Azure (crédito já ativo) ou Google Cloud (depende de crédito na reunião).
2. **Login:** Google para todos? Confirmar que cada usuário tem conta Workspace (4.3).
3. **Migrations:** rebaseline (recomendado) ou stubs (4.1.5).
4. **Site institucional:** fica no FTP ou vai para Static Web Apps / Firebase Hosting.
5. **Instância mínima** dos apps: 0 (grátis, com partida a frio) ou 1.
6. **Região:** Brasil (latência menor, preço maior) ou EUA (franquia maior, mais barata).
7. **No Google Cloud:** VM única (3.1) ou Cloud Run + Cloud SQL. Uma VM com e2-medium também
   rodaria o Supabase self-hosted como passo intermediário. Isso tira o projeto do Supabase Cloud
   sem reescrever auth e storage, mas não é a saída completa do Supabase que é o objetivo deste plano.

### Perguntas para a reunião com o Google

- O Google for Nonprofits inclui **crédito Google Cloud** para organizações no Brasil? Qual valor
  anual e quais requisitos?
- O crédito cobre **Cloud SQL** e **Cloud Run**? Expira ou renova todo ano?
- Há desconto ou franquia do Cloud SQL para ONGs (a menor instância não tem SLA)?
- A região `southamerica-east1` (São Paulo) entra na franquia gratuita do Cloud Run?
- O OAuth com consentimento "Interno" no Workspace exige alguma verificação do app?

## 8. Riscos

- **Conversão das ~170 chamadas** é o maior risco de regressão. Mitigar com E2E, pgTAP, uma
  comparação de telas antes/depois e conversão por área (lançamentos, extrato, mensalidades,
  configurações, inventário).
- **RLS só protege se toda consulta de usuário passar por `withUser`.** Revisar que nenhum
  caminho de usuário use `withService`.
- **A instância de banco pequena** (B1ms / db-f1-micro) basta para o volume do grupo. Monitorar
  memória e conexões.
- **Rebaseline:** o schema gerado precisa bater exatamente com produção. Comparar com
  `migra`/`pg_dump` antes do corte.
- **Crédito:** renovação anual. Configurar alertas de orçamento (50/80/100%) para não depender
  de um crédito expirado.

## Fontes

- Azure Postgres no free account: https://learn.microsoft.com/azure/postgresql/flexible-server/how-to-deploy-on-azure-free-account
- Preço B1ms (indicativo): https://www.bytebase.com/dbcost/azure-flexible/instance/B1ms/
- Container Apps (franquia): https://azure.microsoft.com/pricing/details/container-apps/
- Microsoft Nonprofit Offers Guide: https://www.microsoft.com/content/dam/microsoft/msc/documents/presentations/nonprofits/pdfs/Microsoft-Nonprofit-Offers-Guide.pdf
- Cloud SQL db-f1-micro (indicativo): https://www.bytebase.com/dbcost/cloudsql/instance/db-f1-micro/
- Cloud Run (franquia): https://cloud.google.com/run/pricing
- Google for Nonprofits: https://support.google.com/nonprofits
- Compute Engine (preços por tipo de máquina e região): https://cloud.google.com/compute/vm-instance-pricing
- Camada sempre gratuita do Google Cloud (e2-micro): https://cloud.google.com/free/docs/free-cloud-features#compute
- Calculadora do Google Cloud: https://cloud.google.com/products/calculator
- SSH por IAP: https://cloud.google.com/iap/docs/using-tcp-forwarding
