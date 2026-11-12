# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo

npm workspaces (`apps/*`, `packages/*`) with a single root `package-lock.json`. Always run `npm install` from the root, never inside an app.

- `apps/institucional` (`@geas/institucional`) — public static site, Astro 6 + Tailwind CSS v4, `escoteirosalbert.com.br`.
- `apps/financeiro` (`@geas/financeiro`) — financial management app, Next.js (App Router, Server Actions) + Supabase. Needs a Node server; cannot be deployed as static files.

## Commands (from root)

```bash
npm run dev:institucional   # Astro dev server at localhost:4321
npm run dev:financeiro      # Next dev server at localhost:3000
npm run build               # build all apps
npm run lint                # lint all apps
npm test                    # vitest (financeiro)
npm run test:db             # pgTAP + SQL scripts (supabase test db, local Supabase)
npm run test:e2e            # Playwright, desktop Chromium, own next dev on :3210
npm run typecheck
npm run infra:start         # local Supabase (Docker) + writes apps/financeiro/.env.local
```

Per app: `npm run <script> --workspace=@geas/<app>`.

## institucional

- `src/pages/` — file-based routing; blog uses `[...blog]`; store routes exist but are disabled.
- `src/components/` — `blog/`, `common/`, `ui/`, `widgets/`, `store/`.
- `src/content/post/` — blog posts (Markdown/MDX); schema in `src/content.config.ts`.
- `src/config.yaml` — site config (SEO, i18n pt-BR, blog, store toggle, GA ID).
- `src/navigation.js` — header/footer menus.
- `vendor/` — custom `astrowind` integration. Path aliases: `~` → `src`, `@components`, `@layouts`.
- Google Analytics via Partytown.
- Transparência: Realizado from `src/data/prestacao-contas/*.json` (exported by financeiro, "Exportar para o site" → `/exportar/transparencia`), validated in `src/utils/financial-reports.ts`, rendered by `widgets/RealizedReport.astro`; without a file the page falls back to the Google Sheets iframe. Format shared with `apps/financeiro/lib/export/transparency.ts`.

## financeiro

- Supabase Auth passwordless, restricted to `@escoteirosalbert.com.br`; RLS per group.
- Money stored as integer cents (`lib/money.ts`).
- Migrations in `supabase/migrations/`.
- Model (glossary in `apps/financeiro/docs/modelo.md`): `ledger_entries` = entry (date, `name` shown as "Histórico", account, payment method, `document_filed`, total); `entry_splits` = per-category split with description and optional associate; `statement_lines` = imported OFX lines (`external_id` = FITID, "ID OFX"), linked to entries via `reconciliation_links`. `categories.ledger_code` / `accounts.ledger_code` = accounting chart code (domain `ledger_code`, mask `0.0.0.0.0000`, mirrored in `lib/ledger-code.ts`).
- All writes go through audited SQL functions (no direct write policies on catalogs, accounts, entries or statement tables). List views read `ledger_entry_rows` / `entry_split_rows` (security_invoker, with `external_ids` and `search_text`).
- Session/group lookup: `lib/session.ts` (`pageSession`, `pageMember`, `memberOrError`, `editorOrError`, `requireEditor`, `requireAdmin`); don't query `memberships` directly.
- Statement import is OFX-only; the CSV statement import code was removed for good (`lib/csv-reader.ts` is only the generic reader for the associates CSV import). Exports: column definitions in `lib/export/columns.ts`, rendered as XLSX or CSV; accounting CSV at `/exportar/contabil` (see `docs/contabilidade.md`).
- SQL tests: `supabase/tests/*.sql`, run inside a rolled-back transaction (see each file's header).
- Routes: menu item = 1st segment, header tab = 2nd segment (`/lancamentos/movimentacoes|detalhamento|realizado`, `/extrato/conciliar|importar`, `/configuracoes/<aba>`, `/configuracoes/associados`); query string only for filters and display modes. Area roots redirect to the first tab. Movimentações and Detalhamento share `app/lancamentos/entries-screen.tsx`; `voltar` carries the list path + filters (`listHref` in `lib/entries.ts`). The `rubrica` filter is compact (`id` = subtree, `-id` = excluded subtree; `encodeCategorySelection`).
- Screens: every page header uses `PageHeader` (`components/nav/page-header.tsx`: title, `SectionTabs` beside it, actions on the right, description, filter rows as children) inside `PageBody`/`PAGE_BODY`; never hand-roll an `<h1>` row. Every page except Início passes `crumbs` (path after Início, ending in the current page; `settingsCrumbs`/`extratoCrumbs` helpers); links back carry the filters. Breadcrumbs keep the title in the same place on every page; no separate "Voltar" link. Início has no breadcrumbs and a screen-reader-only title (`hideTitle`): only the actions row shows.
- Forms: every input, select and textarea has a visible label (`<Label htmlFor>`). Placeholders only show examples, never replace the label; `sr-only`/`aria-label` alone is not enough. Exception: search fields with the magnifier icon keep only `aria-label` and a placeholder. In editable table rows, the visible column header is the label (keep a specific `sr-only` label per row).
- UI: shadcn/ui (`base-mira`, Base UI primitives — not Radix) on Tailwind v4. Legacy CSS lives in `@layer legacy` in `app/globals.css`. Generated components import `cn` from `@/lib/utils` (not the `cn` npm package).
- `npx supabase migration up` applies new migrations without resetting local data.

## CI/CD

`.github/workflows/ci.yml` runs on push to `main` and on PRs: job `checks` (lint, typecheck incl. `astro check`, vitest, build) and job `db-e2e` (local Supabase via CLI 3.1.0, `supabase test db`, Playwright). CI only, no CD: the site is deployed by manual FTP to a host we don't own; don't add deploy steps or rely on host config files like `_redirects`.
