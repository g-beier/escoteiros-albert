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

Detalhes em `apps/gestao/README.md` e `apps/gestao/db/README.md`.

## Ambiente local e segredos

Toda a configuração local fica em **`apps/gestao/.env.local`** (não versionado, permissão `600`). O modelo comentado,
com cada variável, é [`apps/gestao/.env.example`](apps/gestao/.env.example). O site institucional não tem `.env`
próprio: o build dele lê o mesmo arquivo para gerar a prestação de contas.

O arquivo tem duas partes:

1. **Bloco gerado** (entre os marcadores `>>> … <<<`): banco, Azurite e URL do site, reescrito a cada
   `npm run infra:start`. São valores locais fixos, iguais em toda máquina; não edite.
2. **Suas variáveis**, abaixo do bloco: segredos e opções de desenvolvimento. O `infra:start` mantém tudo o que estiver
   ali, como está, e avisa se nenhum login estiver configurado.

### Primeira vez

```sh
npm install
npm run infra:start              # Docker ativo; cria apps/gestao/.env.local com o bloco gerado
# edite apps/gestao/.env.local: login com Google (abaixo) ou, para começar, E2E_LOGIN=1
npm run dev:gestao               # http://localhost:3000
```

Depois cadastre o administrador e o grupo no banco local ("Primeiro acesso local" em `apps/gestao/README.md`).

### Login com Google (segredo)

1. No [Google Cloud Console](https://console.cloud.google.com/apis/credentials), num projeto de desenvolvimento,
   configure a tela de consentimento (**Externo**, escopos `openid` e `email`; em modo de teste, inclua a sua conta
   como usuário de teste).
2. Crie uma credencial **ID do cliente OAuth** do tipo **Aplicativo da Web** com o URI de redirecionamento
   `http://localhost:3000/auth/callback` (outra porta: acrescente o URI dela e defina `APP_URL`).
3. Em `apps/gestao/.env.local`, abaixo do bloco gerado:

   ```sh
   GOOGLE_CLIENT_ID=….apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-…
   ```

4. Reinicie o `npm run dev:gestao`. Entra quem tiver o e-mail cadastrado em Usuários.

Use um cliente só de desenvolvimento (seu ou o do grupo, repassado por canal privado), nunca o de produção. Não
versione o `.env.local` nem cole os segredos em issues, PRs, commits ou conversas; se vazar, gere outro segredo no
Console.

### Sem Google: login de teste

`E2E_LOGIN=1` em `.env.local` liga o campo "E-mail (teste)" na tela de login: entra qualquer e-mail cadastrado, sem
senha. Só funciona em `next dev` (um build de produção ignora a variável).

### O que cada tarefa precisa

| Tarefa | Docker (`infra:start`) | Em `apps/gestao/.env.local`, além do bloco gerado |
| --- | --- | --- |
| `npm run dev:institucional`, `npm test`, `npm run lint`, `npm run typecheck` | não | nada |
| `npm run dev:gestao` | sim | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, ou `E2E_LOGIN=1` |
| `npm run test:db` | sim | nada |
| `npm run test:e2e` | sim | nada (o Playwright liga `E2E_LOGIN=1` no servidor dele; antes da primeira vez, `npx playwright install chromium` em `apps/gestao`) |
| `npm run build` | não | nada com `TRANSPARENCY_SKIP=1 npm run build`; sem ela, o site tenta gerar a prestação de contas e, com o banco local, sai sem o Realizado |
| comprovantes | sim (Azurite) | `NEXT_PUBLIC_FEATURE_ATTACHMENTS=on` |

Portas ocupadas (54330 do Postgres, 10000 do Azurite): `GEAS_DB_PORT=… GEAS_BLOB_PORT=… npm run infra:start` (o bloco
gerado já sai com as portas novas). Outras opções no `.env.example`.

## Conteúdo institucional

- Blog: `apps/institucional/src/content/post/`
- Navegação: `apps/institucional/src/navigation.js`
- Configuração: `apps/institucional/src/config.yaml`
