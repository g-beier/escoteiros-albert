import { z, defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';

const metadataDefinition = () =>
  z
    .object({
      title: z.string().optional(),
      ignoreTitleTemplate: z.boolean().optional(),

      canonical: z.string().url().optional(),

      robots: z
        .object({
          index: z.boolean().optional(),
          follow: z.boolean().optional(),
        })
        .optional(),

      description: z.string().optional(),

      openGraph: z
        .object({
          url: z.string().optional(),
          siteName: z.string().optional(),
          images: z
            .array(
              z.object({
                url: z.string(),
                width: z.number().optional(),
                height: z.number().optional(),
              })
            )
            .optional(),
          locale: z.string().optional(),
          type: z.string().optional(),
        })
        .optional(),

      twitter: z
        .object({
          handle: z.string().optional(),
          site: z.string().optional(),
          cardType: z.string().optional(),
        })
        .optional(),
    })
    .optional();

const postCollection = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/post' }),
  schema: ({ image }) =>
    z.object({
      publishDate: z.date().optional(),
      updateDate: z.date().optional(),
      draft: z.boolean().optional(),

      title: z.string(),
      image: image().optional(),
      excerpt: z.string().optional(),
      slug: z.string().optional(),

      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      author: z.string().optional(),

      metadata: metadataDefinition(),
    }),
});

const storeCollection = defineCollection({
  loader: file('./src/content/store.json'),
  schema: ({ image }) =>
    z.object({
      slug: z.string(),
      available: z.boolean().default(true),
      title: z.string(),
      description: z.string(),
      image: image().optional(),
      price: z.number(),

      metadata: metadataDefinition(),
    }),
});

const volunteerCollection = defineCollection({
  loader: file('./src/content/volunteers.json'),
  schema: ({ image }) =>
    z.object({
      id: z.number(),
      name: z.string(),
      title: z.string(),
      image: image().optional(),
      tags: z.enum(['diretoria', 'alcatéia', 'tropa-escoteira', 'tropa-sênior', 'clã-pioneiro']).array(),
    }),
});

export const collections = {
  post: postCollection,
  store: storeCollection,
  volunteers: volunteerCollection,
};
