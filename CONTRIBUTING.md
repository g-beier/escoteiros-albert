# Contribuindo

Como as mudanças chegam à `main` e o que o GitHub e o repositório verificam.

## Fluxo

- Contribuições externas: fork → branch → pull request para `main`.
- Mantenedores (admin) podem dar push direto na `main`; para mudanças maiores ou que outra pessoa
  deva revisar, prefira PR.
- PRs entram **só por squash**: o título do PR vira o commit na `main` e o corpo do PR, a
  descrição. O branch é apagado depois do merge.
- A `main` nunca recebe force-push nem é apagada, e o histórico é linear (sem merge commits).

## Mensagens de commit

[Conventional Commits](https://www.conventionalcommits.org/), em inglês, verificadas pelo
commitlint (`commitlint.config.mjs`):

```
<tipo>(<escopo opcional>): <resumo no imperativo, minúsculo, sem ponto final>

<corpo opcional: por quê, não o quê>
```

- **Tipos:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`, `perf`, `style`,
  `revert`.
- **Escopos:** `gestao`, `financeiro`, `inventario`, `ui`, `institucional`, `db`, `e2e`, `deps`.
  Sem escopo quando a mudança atravessa várias áreas.
- Cabeçalho com até 100 caracteres.

Exemplos: `feat(inventario): drag divisions to reorder`, `fix(financeiro): keep filters on back
link`, `docs: hosting options for gestao`.

O `npm install` na raiz instala o hook `commit-msg` (husky), que recusa a mensagem antes do
commit. Para testar uma mensagem: `echo "feat(ui): x" | npx commitlint`.

## Verificações (GitHub)

Rulesets da `main` (Settings → Rules):

| Ruleset | Regras | Bypass |
|---|---|---|
| **main: integridade** | bloqueia exclusão e force-push; exige histórico linear | ninguém |
| **main: PR e checks** | exige PR (merge só por squash) e os checks abaixo verdes | admin |

Checks obrigatórios (nomes dos jobs; renomear um job exige atualizar o ruleset):

| Check | Workflow | O que roda |
|---|---|---|
| `Lint, types, unit tests, build` | `ci.yml` | `npm run lint`, `typecheck`, `test`, `build` |
| `SQL tests (pgTAP) and e2e (Playwright)` | `ci.yml` | Supabase local, `supabase test db`, Playwright |
| `Commit messages` | `commits.yml` | commitlint no título do PR (ou nos commits de um push na `main`) |

Nada faz deploy a partir do GitHub: o site sobe por FTP manual e migrations de produção são
aplicadas à mão.

## Antes de abrir o PR

```bash
npm run lint && npm run typecheck && npm test
npm run test:db     # se mexeu em migrations ou SQL
npm run test:e2e    # se mexeu em fluxo coberto pelos testes e2e
```
