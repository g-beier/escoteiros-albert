# Banco e infraestrutura do Gestão

- `migrations/`: `000_roles.sql` (papéis do cluster) e `001_schema.sql` (schema base consolidado em 2026-11-21). Mudanças
  novas em `002_nome.sql`, `003_…`, aplicadas em ordem por `scripts/db.mjs migrate`, cada uma numa transação,
  registradas em `geas_meta.migrations`. Enquanto não houver produção, o `001` ainda pode ser editado (local:
  `npm run infra:reset`); depois, só migrations novas.
- `tests/`: pgTAP e scripts psql (`npm run test:db`), sempre dentro de `begin … rollback`.
- `compose.yaml` + `docker/`: infra local (Postgres 17 com pgTAP, Azurite).

## Papéis

| Papel | Login | Para quê |
| --- | --- | --- |
| dono (local `postgres`; Azure: o administrador do servidor) | sim | aplica as migrations e é dono das tabelas e funções `security definer`; scripts de manutenção (`DATABASE_ADMIN_URL`) |
| `geas_app` | sim, `NOINHERIT` | conexão do app (`DATABASE_URL`). Sozinho não lê nada: cada transação troca para um dos papéis abaixo |
| `authenticated` | não | usuário logado: RLS e funções auditadas; `auth.uid()` vem de `request.jwt.claims` |
| `geas_auth` | não | login e sessões: só `auth.users` e `auth.sessions` |
| `anon` | não | sem acesso (existe porque as migrations revogam dele) |

`000_roles.sql` cria os papéis sem login; `001_schema.sql`, o schema `auth` (`users`, `sessions`, `auth.uid()`) e todo o `public`. O papel de login do app é criado à mão
(senha por ambiente) e recebe os papéis com `APP_DB_ROLE=geas_app` no `migrate`.

## Azure (estrutura mínima)

Ainda não existe. Serviços e preços: `docs/estimativa-azure.md` (raiz do repositório).

1. **Postgres:** Azure Database for PostgreSQL Flexible Server, versão 17, Burstable B1ms, mesma região do app.
   Autenticação PostgreSQL, TLS obrigatório (padrão). Rede: acesso privado na VNet do ambiente do Container Apps,
   sem endereço público. Por isso os passos 2, 3, 4 e o `pg_dump` rodam de dentro da VNet (Container Apps Job, ainda
   por criar). Nenhuma extensão é necessária.
2. **Banco e papel do app** (como o administrador do servidor, para que ele seja o dono):

   ```sql
   create database geas;
   \c geas
   create role geas_app login noinherit password '<senha forte>';
   ```

3. **Migrations** (pelo Job, dentro da VNet):

   ```bash
   DATABASE_ADMIN_URL='postgres://<admin>:<senha>@<servidor>.postgres.database.azure.com:5432/geas?sslmode=verify-full' \
   APP_DB_ROLE=geas_app npm run db:migrate --workspace=@geas/gestao
   ```

4. **Primeiro administrador:** `insert into auth.users(email) values ('…');` e
   `select public.admin_bootstrap_group('…', 'Grupo Escoteiro Albert Schweitzer');` como o dono.
5. **Armazenamento:** conta de armazenamento (StorageV2, LRS, acesso público a blobs desligado, TLS 1.2), contêiner
   privado `comprovantes`, CORS com a origem do app (`PUT`, `GET`, `HEAD`, `OPTIONS`; cabeçalhos `*`). O app usa
   identidade gerenciada com o papel **Storage Blob Data Contributor** na conta (sem chave guardada).
6. **App:** Container App (consumo, 0–1 réplica) com a imagem do Next (`output: "standalone"`, próxima etapa) e as
   variáveis do README do Gestão como segredos. HTTPS e domínio próprio pelo Container Apps.
7. **Google:** cliente OAuth "Aplicativo da Web" com o redirect `<APP_URL>/auth/callback`.
8. **Backups:** os automáticos do Flexible Server (7 dias por padrão); antes de mudanças grandes, `pg_dump` como o dono.

O export de transparência do site (`scripts/export-transparency.ts`) lê com `DATABASE_ADMIN_URL`, que no Azure
não é alcançável de fora da VNet: use "Exportar para o site" no Gestão e faça o build com `TRANSPARENCY_SKIP=1`.
