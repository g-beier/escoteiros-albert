# Gestão do Grupo Escoteiro Albert Schweitzer

Monorepo das aplicações do Grupo Escoteiro Albert Schweitzer, em Porto Alegre, Brasil.

## Aplicações

- `apps/institucional`: site público em Astro, publicado em [escoteirosalbert.com.br](https://escoteirosalbert.com.br).
- `apps/gestao`: app interno em Next.js + Supabase, com Financeiro (`/financeiro/...`) e Inventário (`/inventario/...`).

## Desenvolvimento

Precisa de **Node.js ≥ 22** e **Docker Desktop** aberto (os containers do Supabase local sobem por ele).

```sh
npm install
npm run infra:start            # Docker: sobe Postgres/Auth/Studio/Mailpit + gera apps/gestao/.env.local
npm run dev                    # gestao (:3000) + site (:4321)
npm run dev:institucional      # só o site Astro
npm run dev:gestao             # só a gestão (precisa do infra:start)
npm run build
npm run lint
npm test
npm run test:db
npm run test:e2e
```

As dependências de todas as aplicações são instaladas a partir da raiz, com um único `package-lock.json`. Não rode `npm install` dentro de `apps/*`.

Os comandos usam npm workspaces e também podem ser executados por aplicação:

```sh
npm run build --workspace=@geas/institucional
npm run test --workspace=@geas/gestao
```

## Supabase local (Docker)

Não há `docker compose` do projeto: a Supabase CLI sobe e derruba os containers.

```sh
npm run infra:start            # supabase start (Docker) + .env.local
npm run infra:status           # URLs e chaves locais
npm run infra:reset            # zera o banco e reaplica migrations
npm run infra:stop             # supabase stop (para os containers)
docker ps                      # conferir containers (supabase_*)
```

Serviços úteis depois do `infra:start`:

| Serviço | URL |
| --- | --- |
| Gestão | http://localhost:3000 |
| Site | http://localhost:4321 |
| Studio | http://localhost:54323 |
| Mailpit | http://localhost:54324 |

O ambiente local é escrito em `apps/gestao/.env.local` e não é versionado.

## Conteúdo institucional

- Blog: `apps/institucional/src/content/post/`
- Navegação: `apps/institucional/src/navigation.js`
- Configuração: `apps/institucional/src/config.yaml`
