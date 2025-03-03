// @ts-check
import { defineConfig } from 'astro/config';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';

import astrowind from './vendor/integration/index.mjs';

import { readingTimeRemarkPlugin, responsiveTablesRehypePlugin } from './src/utils/frontmatter.mjs';
import { fileURLToPath } from 'url';

import sitemap from '@astrojs/sitemap';

import mdx from '@astrojs/mdx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// https://astro.build/config

export default defineConfig({
  site: 'https://escoteirosalbert.com.br',
  output: 'static',
  integrations: [astrowind({ config: './src/config.yaml' }), icon(), sitemap(), mdx()],
  markdown: {
    remarkPlugins: [readingTimeRemarkPlugin],
    rehypePlugins: [responsiveTablesRehypePlugin, 'rehype-plugin-image-native-lazy-loading'],
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