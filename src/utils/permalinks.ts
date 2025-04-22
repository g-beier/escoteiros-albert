import slugify from 'limax';

import { SITE, APP_BLOG, APP_STORE } from 'astrowind:config';

import { trim } from '~/utils/utils';

/** Describes the object-based href options */
interface LinkDescriptor {
  type: 'home' | 'blog' | 'store' | 'asset' | 'category' | 'tag' | 'post' | 'product' | 'page';
  url?: string;
}

export const trimSlash = (s: string) => trim(trim(s, '/'));
const createPath = (...params: string[]) => {
  const paths = params
    .map((el) => trimSlash(el))
    .filter((el) => !!el)
    .join('/');
  return '/' + paths + (SITE.trailingSlash && paths ? '/' : '');
};

const BASE_PATHNAME = SITE.base || '/';

export const cleanSlug = (text = '') =>
  trimSlash(text)
    .split('/')
    .map((slug) => slugify(slug))
    .join('/');

export const BLOG_BASE = cleanSlug(APP_BLOG?.list?.pathname);
export const STORE_BASE = cleanSlug(APP_STORE?.list?.pathname);
export const CATEGORY_BASE = cleanSlug(APP_BLOG?.category?.pathname);
export const TAG_BASE = cleanSlug(APP_BLOG?.tag?.pathname) || 'tag';

export const POST_PERMALINK_PATTERN = trimSlash(APP_BLOG?.post?.permalink || `${BLOG_BASE}/%slug%`);
export const STORE_PERMALINK_PATTERN = trimSlash(APP_STORE?.post?.permalink || `${STORE_BASE}/%slug%`);

/** */
export const getCanonical = (path = ''): string | URL => {
  const url = String(new URL(path, SITE.site));
  if (SITE.trailingSlash == false && path && url.endsWith('/')) {
    return url.slice(0, -1);
  } else if (SITE.trailingSlash == true && path && !url.endsWith('/')) {
    return url + '/';
  }
  return url;
};

/** */
export const getPermalink = (slug = '', type = 'page'): string => {
  let permalink: string;

  if (
    slug.startsWith('https://') ||
    slug.startsWith('http://') ||
    slug.startsWith('://') ||
    slug.startsWith('#') ||
    slug.startsWith('javascript:')
  ) {
    return slug;
  }

  switch (type) {
    case 'home':
      permalink = getHomePermalink();
      break;

    case 'blog':
      permalink = getBlogPermalink();
      break;

    case 'store':
      permalink = getStorePermalink();
      break;

    case 'asset':
      permalink = getAsset(slug);
      break;

    case 'category':
      permalink = createPath(CATEGORY_BASE, trimSlash(slug));
      break;

    case 'tag':
      permalink = createPath(TAG_BASE, trimSlash(slug));
      break;

    case 'post':
      permalink = createPath(trimSlash(slug));
      break;

    case 'product':
      permalink = createPath(trimSlash(slug));
      break;

    case 'page':
    default:
      permalink = createPath(slug);
      break;
  }

  return definitivePermalink(permalink);
};

/** */
export const getHomePermalink = (): string => getPermalink('/');

/** */
export const getBlogPermalink = (): string => getPermalink(BLOG_BASE);
/** */
export const getStorePermalink = (): string => getPermalink(STORE_BASE);

/** */
export const getAsset = (path: string): string =>
  '/' +
  [BASE_PATHNAME, path]
    .map((el) => trimSlash(el))
    .filter((el) => !!el)
    .join('/');

/** */
const definitivePermalink = (permalink: string): string => createPath(BASE_PATHNAME, permalink);

/** Type‐guard for plain objects we can recurse into */
function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Type‐guard for our LinkDescriptor shape */
function isLinkDescriptor(o: unknown): o is LinkDescriptor {
  if (!isRecord(o)) return false;
  return typeof o.type === 'string';
}

/** Resolve a single href entry (string or LinkDescriptor) to its final URL */
function resolveHref(raw: unknown): string {
  if (typeof raw === 'string') {
    return getPermalink(raw);
  }
  if (isLinkDescriptor(raw)) {
    switch (raw.type) {
      case 'home':
        return getHomePermalink();
      case 'blog':
        return getBlogPermalink();
      case 'store':
        return getStorePermalink();
      case 'asset':
        return getAsset(raw.url ?? '');
      default:
        return getPermalink(raw.url ?? '', raw.type);
    }
  }
  // Fallback: stringify anything unexpected
  return String(raw);
}

/**
 * Recursively walks any value of type T, looks for `href` keys,
 * and replaces their values via our permalink helpers.
 */
export function applyGetPermalinks<T>(menu: T): T {
  // Arrays: map each element
  if (Array.isArray(menu)) {
    return menu
      .map((item) => applyGetPermalinks(item))
      .filter(() => true) // keep TS happy
      .map((v) => v) as unknown as T;
  }

  // Plain objects: rebuild key by key
  if (isRecord(menu)) {
    const output: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(menu)) {
      if (key === 'href') {
        output.href = resolveHref(value);
      } else {
        output[key] = applyGetPermalinks(value);
      }
    }

    return output as T;
  }

  // Primitives (string, number, boolean, etc.): pass through
  return menu;
}
