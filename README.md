# Gestão do Grupo Escoteiro Albert Schweitzer

Monorepo das aplicações do Grupo Escoteiro Albert Schweitzer, em Porto Alegre, Brasil.

## Aplicações

- `apps/institucional`: site público em Astro, publicado em [escoteirosalbert.com.br](https://escoteirosalbert.com.br).
- `apps/gestao`: aplicação interna "Gestão" em Next.js com PostgreSQL (Azure em produção) e login Google, com os módulos Financeiro (`/financeiro`), Inventário (`/inventario`) e Associados (`/associados`).
- `packages/ui`: interface compartilhada da aplicação interna (`@geas/ui`).

Mapa da arquitetura: [`docs/CODEBASE_MAP.md`](docs/CODEBASE_MAP.md).

## Desenvolvimento

```sh
npm install
npm run dev                    # gestão + site (a gestão precisa da infra local: npm run infra:start)
npm run dev:institucional      # somente o site Astro
npm run dev:gestao             # somente a gestão
npm run build                  # build de todas as aplicações
npm run lint
npm test
```

As dependências de todas as aplicações são instaladas a partir da raiz, com um único `package-lock.json`. Não rode `npm install` dentro de `apps/*`.

Os comandos usam npm workspaces e também podem ser executados diretamente por aplicação:

```sh
npm run build --workspace=@geas/institucional
npm run test --workspace=@geas/gestao
```

## Infra local da gestão (Docker: Postgres + Azurite)

```sh
npm run infra:start
npm run infra:status
npm run infra:reset
npm run infra:stop
```

O ambiente local é escrito em `apps/gestao/.env.local` e não é versionado. Detalhes em `apps/gestao/README.md` e `apps/gestao/db/README.md`.

## Conteúdo institucional

- Blog: `apps/institucional/src/content/post/`
- Navegação: `apps/institucional/src/navigation.js`
- Configuração: `apps/institucional/src/config.yaml`
