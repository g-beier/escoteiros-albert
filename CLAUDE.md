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

## financeiro

- Supabase Auth passwordless, restricted to `@escoteirosalbert.com.br`; RLS per group.
- Money stored as integer cents (`lib/money.ts`).
- Migrations in `supabase/migrations/`.

## CI/CD

No GitHub Actions workflows currently. Deploys are manual.
