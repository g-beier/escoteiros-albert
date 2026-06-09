// @ts-check
import { defineConfig } from 'astro/config';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';

import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import astrowind from './src/integration/index.mjs';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';

const siteConfig = /** @type {any} */ (yaml.load(fs.readFileSync('./src/config.yaml', 'utf8')));
const blogConfig = siteConfig?.apps?.blog;

// Collect URL path prefixes that are marked noindex in config.yaml — exclude from sitemap
const noindexPathPrefixes = [
  blogConfig?.tag?.robots?.index === false ? `/${blogConfig.tag.pathname}/` : null,
  blogConfig?.category?.robots?.index === false ? `/${blogConfig.category.pathname}/` : null,
].filter((p) => p !== null);

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
    sitemap({
      filter: (page) => !noindexPathPrefixes.some((prefix) => new URL(page).pathname.startsWith(prefix)),
      serialize(item) {
        return { ...item, lastmod: new Date().toISOString().split('T')[0] };
      },
    }),
    mdx(),
    partytown({ config: { forward: ['dataLayer.push'] } }),
  ],
  markdown: {
    processor: unified({
      remarkPlugins: [readingTimeRemarkPlugin],
      // @ts-expect-error rehypePlugin
      rehypePlugins: [responsiveTablesRehypePlugin, lazyImagesRehypePlugin],
    }),
  },
  vite: {
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
