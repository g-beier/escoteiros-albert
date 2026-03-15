import { getImage } from 'astro:assets';
import type { ImageMetadata } from 'astro';

type ImageModule = { default: ImageMetadata };

export interface OpenGraphImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface OpenGraph {
  url?: string;
  site_name?: string;
  images?: OpenGraphImage[];
  locale?: string;
  type?: string;
}

const load = async () => {
  let images: Record<string, () => Promise<ImageModule>> | undefined = undefined;

  try {
    images = import.meta.glob<ImageModule>(
      '~/assets/images/**/*.{jpeg,jpg,png,tiff,webp,gif,svg,JPEG,JPG,PNG,TIFF,WEBP,GIF,SVG}'
    );
  } catch (e) {
    console.error(e);
  }

  return images;
};

let _images: Record<string, () => Promise<ImageModule>> | undefined;

/** */
export const fetchLocalImages = async () => {
  _images = _images || (await load());
  return _images;
};

/** */
export const findImage = async (
  imagePath?: string | ImageMetadata | null
): Promise<string | ImageMetadata | null | undefined> => {
  if (typeof imagePath !== 'string') {
    return imagePath;
  }

  // absolute URLs
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://') || imagePath.startsWith('/')) {
    return imagePath;
  }

  if (!imagePath.startsWith('~/assets/images')) {
    return imagePath;
  }

  const images = await fetchLocalImages();
  const key = imagePath.replace('~/', '/src/');

  if (images && typeof images[key] === 'function') {
    const mod = await images[key]();
    return mod.default;
  }

  return null;
};

/** */
export const adaptOpenGraphImages = async (
  openGraph: OpenGraph = {},
  astroSite: URL | undefined = new URL('')
): Promise<OpenGraph> => {
  if (!openGraph?.images?.length) {
    return openGraph;
  }

  const defaultWidth = 1200;
  const defaultHeight = 626;

  const adaptedImages: OpenGraphImage[] = await Promise.all(
    openGraph.images.map(async (image): Promise<OpenGraphImage> => {
      if (!image?.url) {
        return { url: '' };
      }

      const resolvedImage = (await findImage(image.url)) as ImageMetadata | string | null | undefined;

      if (!resolvedImage || typeof resolvedImage === 'string') {
        return { url: resolvedImage || '' };
      }

      const optimized = await getImage({
        src: resolvedImage,
        alt: image.alt ?? 'OpenGraph image',
        width: image.width || defaultWidth,
        height: image.height || defaultHeight,
      });

      return {
        url: String(new URL(optimized.src, astroSite)),
        width: optimized.attributes.width as number | undefined,
        height: optimized.attributes.height as number | undefined,
        alt: image.alt,
      };
    })
  );

  return {
    ...openGraph,
    images: adaptedImages,
  };
};
