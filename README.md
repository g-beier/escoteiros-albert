# Gestão do Grupo Escoteiro Albert Schweitzer

Monorepo das aplicações do Grupo Escoteiro Albert Schweitzer, em Porto Alegre, Brasil.

## Aplicações

- `apps/institucional`: site público em Astro, publicado em [escoteirosalbert.com.br](https://escoteirosalbert.com.br).
- `apps/gestao`: aplicação interna "Gestão" em Next.js com Supabase, com os módulos Financeiro (`/financeiro`) e Inventário (`/inventario`).
- `packages/ui`: interface compartilhada da aplicação interna (`@geas/ui`).

Mapa da arquitetura: [`docs/CODEBASE_MAP.md`](docs/CODEBASE_MAP.md).

## Desenvolvimento

```sh
npm install
npm run dev                    # gestão + site (a gestão precisa do Supabase local)
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

## Supabase local

```sh
npm run infra:start
npm run infra:status
npm run infra:reset
npm run infra:stop
```

O ambiente local é escrito em `apps/gestao/.env.local` e não é versionado.

## Conteúdo institucional

- Blog: `apps/institucional/src/content/post/`
- Navegação: `apps/institucional/src/navigation.js`
- Configuração: `apps/institucional/src/config.yaml`
