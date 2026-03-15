# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at localhost:4321
npm run build        # Production build (output: ./dist/)
npm run preview      # Preview production build locally
npm run lint:eslint  # Run ESLint
npm run format       # Format with Prettier
```

## Architecture

Static site for a Brazilian Scout group (Grupo Escoteiro Albert Schweitzer) built with **Astro 6** and **Tailwind CSS v4**, deployed to `escoteirosalbert.com.br`.

### Key Directories

- `src/pages/` — Astro file-based routing. Blog routes use `[...blog]` dynamic pattern; store routes exist but are disabled.
- `src/components/` — Astro components organized into `blog/`, `common/`, `ui/`, `widgets/`, and `store/` subdirectories.
- `src/layouts/` — Page layout templates (`Layout.astro`, `PageLayout.astro`, `LandingLayout.astro`, `MarkdownLayout.astro`).
- `src/content/` — Blog posts (Markdown in `post/`), testimonials, volunteers, and store data (JSON).
- `src/utils/` — Utilities for blog, images, permalinks, store, and frontmatter markdown plugins.
- `vendor/` — Custom Astro integration (`astrowind`) that wires together the site configuration.

### Configuration

- `src/config.yaml` — Primary site config: metadata, SEO defaults, i18n (pt-BR), blog settings (10 posts/page), store toggle (disabled), and Google Analytics ID.
- `src/navigation.js` — Navigation structure for header/footer menus.
- `astro.config.mjs` — Astro build config with integrations: astrowind (custom), icons (Tabler), sitemap, MDX, Partytown (for GA). Path aliases: `~` → `src`, `@components`, `@layouts`.

### Content System

Blog posts live in `src/content/post/` as Markdown/MDX with frontmatter. Content collection schema is defined in `src/content.config.ts`. The store is data-driven from `src/content/store.json` but currently disabled via `config.yaml`.

### Analytics

Google Analytics runs via Partytown (web worker) to avoid blocking the main thread. The GA script integration is configured in `astro.config.mjs` and the ID is in `src/config.yaml`.
