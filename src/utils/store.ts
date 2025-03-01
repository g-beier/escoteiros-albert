import type { PaginateFunction } from 'astro';
import { getCollection, type CollectionEntry } from 'astro:content';
import type { Product } from '~/types';
import { cleanSlug, trimSlash, STORE_PERMALINK_PATTERN, STORE_BASE } from './permalinks';
import { APP_STORE } from 'astrowind:config';

const generatePermalink = async ({ id, slug }: { id: string; slug: string }) => {
  const permalink = STORE_PERMALINK_PATTERN.replace('%slug%', slug).replace('%id%', id);
  return permalink
    .split('/')
    .map((el) => trimSlash(el))
    .filter((el) => !!el)
    .join('/');
};

const getNormalizedProduct = async (item: CollectionEntry<'store'>): Promise<Product> => {
  const { id, data } = item;

  const { slug: rawSlug, available, title, description, metadata = {}, image, price } = data;

  const slug = cleanSlug(rawSlug);

  return {
    id,
    slug: slug,
    permalink: await generatePermalink({ id, slug }),
    title,
    available,
    description,
    metadata,
    image,
    price,
  };
};

export const load = async function (): Promise<Array<Product>> {
  const products = await getCollection('store', (product) => product.data.available == true);
  const normalizedProducts = products.map(async (product) => await getNormalizedProduct(product));

  const results = (await Promise.all(normalizedProducts)).sort((a, b) => a.slug.localeCompare(b.slug));

  return results;
};

let _store: Array<Product>;

/** */
export const isStoreEnabled = APP_STORE?.isEnabled;
export const isStoreListRouteEnabled = APP_STORE?.list?.isEnabled;
export const isStoreProductRouteEnabled = APP_STORE?.product?.isEnabled;

export const storeListRobots = APP_STORE?.list?.robots;
export const storeProductRobots = APP_STORE?.product?.robots;

export const productsPerPage = APP_STORE?.itemsPerPage;

/** */
export const fetchStore = async (): Promise<Array<Product>> => {
  if (!_store) {
    _store = await load();
  }

  return _store;
};

/** */
export const findProductsBySlugs = async (slugs: Array<string>): Promise<Array<Product>> => {
  if (!Array.isArray(slugs)) return [];

  const products = await fetchStore();

  return slugs.reduce(function (r: Array<Product>, slug: string) {
    products.some(function (product: Product) {
      return slug === product.slug && r.push(product);
    });
    return r;
  }, []);
};

/** */
export const findProductsByIds = async (ids: Array<string>): Promise<Array<Product>> => {
  if (!Array.isArray(ids)) return [];

  const products = await fetchStore();

  return ids.reduce(function (r: Array<Product>, id: string) {
    products.some(function (product: Product) {
      return id === product.id && r.push(product);
    });
    return r;
  }, []);
};

/** */
export const getStaticPathsStoreList = async ({ paginate }: { paginate: PaginateFunction }) => {
  if (!isStoreEnabled || !isStoreListRouteEnabled) return [];

  return paginate(await fetchStore(), { pageSize: productsPerPage, params: { store: STORE_BASE || undefined } });
};

/** */
export const getStaticPathsStoreProduct = async () => {
  if (!isStoreEnabled || !isStoreProductRouteEnabled) return [];
  return (await fetchStore()).flatMap((product) => ({
    params: {
      store: product.permalink,
    },
    props: { product },
  }));
};
