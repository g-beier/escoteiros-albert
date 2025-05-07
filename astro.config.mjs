// @ts-check
import { defineConfig } from 'astro/config';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import Sonda from 'sonda/astro';

import astrowind from './vendor/integration/index.mjs';

import {
  readingTimeRemarkPlugin,
  responsiveTablesRehypePlugin,
  lazyImagesRehypePlugin,
} from './src/utils/frontmatter.mjs';

import { fileURLToPath } from 'url';

import sitemap from '@astrojs/sitemap';

import mdx from '@astrojs/mdx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// https://astro.build/config

export default defineConfig({
  site: 'https://escoteirosalbert.com.br',
  output: 'static',
  integrations: [
    astrowind({ config: './src/config.yaml' }),
    icon(),
    sitemap(),
    mdx(),
    Sonda({ open: true, enabled: false }),
  ],
  markdown: {
    remarkPlugins: [readingTimeRemarkPlugin],
    // @ts-expect-error rehypePlugin
    rehypePlugins: [responsiveTablesRehypePlugin, lazyImagesRehypePlugin],
  },
  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
      },
    },
  },
});
