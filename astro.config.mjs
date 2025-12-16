// @ts-check
import { defineConfig } from 'astro/config';
import path from 'path';

import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import astrowind from './vendor/integration/index.mjs';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

import {
  readingTimeRemarkPlugin,
  responsiveTablesRehypePlugin,
  lazyImagesRehypePlugin,
} from './src/utils/frontmatter.mjs';

import { fileURLToPath } from 'url';

import partytown from '@astrojs/partytown';

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
    partytown({ config: { forward: ['dataLayer.push'] } }),
  ],
  markdown: {
    remarkPlugins: [readingTimeRemarkPlugin],
    // @ts-expect-error rehypePlugin
    rehypePlugins: [responsiveTablesRehypePlugin, lazyImagesRehypePlugin],
  },
  vite: {
    // @ts-expect-error tailwindcss
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@layouts': path.resolve(__dirname, './src/layouts'),
      },
    },
  },
});
