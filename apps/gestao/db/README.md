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

## Azure

Ainda não existe (nada provisionado). Plano, custos e etapas: `.azure/deployment-plan.md` e `docs/estimativa-azure.md`
(raiz do repositório). Tudo é descrito em Bicep (`infra/`) e aplicado pelo azd (`azure.yaml`), nunca pelo CI.

- **Imagens** (`apps/gestao/Dockerfile`, contexto = raiz do monorepo, linux/amd64): `app` (Next standalone, usuário
  não root, porta 3000, heap de 512 MB) e `job` (Node + `pg_dump` 17 + `scripts/maintenance.mjs`, `db.mjs` e as
  migrations). Os toggles `NEXT_PUBLIC_*` entram no build da `app`.
- **Recursos** (`infra/resources.bicep`): VNet (`/27` do ambiente, `/28` do Postgres), Postgres Flexible 17 B1ms sem
  endereço público, Container Apps (0–1 réplica, 0,5 vCPU / 1 GiB), Container Apps Job manual, Storage sem chave
  compartilhada (contêineres `comprovantes` e `backups`, CORS só com a origem do app), ACR Basic, Key Vault (RBAC,
  purge protection), Log Analytics com teto diário e duas identidades gerenciadas: a do app lê só `database-url` e
  `google-client-secret`; a do Job lê a credencial de administrador e grava só em `backups`.
- **Senhas:** `postgresAdminPassword` e `appDbPassword` (≥ 16 caracteres) e `googleClientSecret` são pedidos pelo azd
  na primeira vez e gravados no Key Vault; a cópia local fica em `.azure/<ambiente>/` (fora do git).

### Primeira subida (etapa 3 do plano, exige login)

1. `azd provision --preview`, revisar; depois `azd provision`.
2. `azd deploy`: publica a imagem do app e, pelo hook `infra/hooks/job-image.sh`, a do Job.
3. Banco, pelo Job (de dentro da VNet), na ordem:

   ```bash
   eval "$(azd env get-values)"
   # troca o comando do Job e dispara uma execução (sem override no start, que substituiria as variáveis com segredos)
   job() {
     az containerapp job update -n "$AZURE_CONTAINER_JOB_NAME" -g "$AZURE_RESOURCE_GROUP" --args "$1" -o none &&
     az containerapp job start -n "$AZURE_CONTAINER_JOB_NAME" -g "$AZURE_RESOURCE_GROUP" -o none
   }
   job setup     # cria geas_app com a senha do Key Vault e aplica as migrations
   ```

   Primeiro administrador: `az containerapp job update … --set-env-vars BOOTSTRAP_ADMIN_EMAIL=<e-mail>`, `job bootstrap`
   e depois `--remove-env-vars BOOTSTRAP_ADMIN_EMAIL`. Recusa se já houver grupo; os demais usuários entram por
   `/usuarios`. Saída de cada execução: logs do Job no portal ou `az containerapp job logs show`.
4. **Google:** cliente OAuth "Aplicativo da Web" com o redirect `<APP_URL>/auth/callback` (`APP_URL` sai do
   `azd env get-values`); `GOOGLE_CLIENT_ID` com `azd env set` e novo `azd provision`.
5. **Domínio próprio** (etapa 5): `APP_URL_CUSTOM` com `azd env set`, certificado gerenciado no Container Apps.

### Rotina

- Migrations novas: `azd deploy` (nova imagem do Job) e `job migrate`. `job status` lista aplicadas e pendentes.
- Backups: os automáticos do Flexible Server (7 dias); antes de mudanças grandes, `job dump` (`pg_dump -Fc` no
  contêiner `backups`, apagado após 90 dias).
- Trocar a senha do app: novo `appDbPassword` no azd, `azd provision`, `job setup`, nova revisão do app.

O export de transparência do site (`scripts/export-transparency.ts`) lê com `DATABASE_ADMIN_URL`, que no Azure
não é alcançável de fora da VNet: use "Exportar para o site" no Gestão e faça o build com `TRANSPARENCY_SKIP=1`.
