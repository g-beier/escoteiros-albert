import { getCollection, render } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { Episode } from '~/types';
import { APP_PODCAST } from 'astrowind:config';
import { cleanSlug, trimSlash, EPISODE_PERMALINK_PATTERN } from './permalinks';

const generatePermalink = async ({ id, slug }: { id: string; slug: string }) => {
  const permalink = EPISODE_PERMALINK_PATTERN.replace('%slug%', slug).replace('%id%', id);

  return permalink
    .split('/')
    .map((el) => trimSlash(el))
    .filter((el) => !!el)
    .join('/');
};

const getNormalizedEpisode = async (episode: CollectionEntry<'podcast'>): Promise<Episode> => {
  const { id, data } = episode;
  const { Content } = await render(episode);

  const {
    published: rawPublished = new Date(),
    title,
    summary,
    image,
    audio,
    duration,
    episode: episodeNumber,
    draft = false,
    metadata = {},
    slug: rawSlug,
  } = data;

  const slug = cleanSlug(rawSlug || id);
  const published = new Date(rawPublished);

  return {
    id,
    slug,
    permalink: await generatePermalink({ id, slug }),

    episode: episodeNumber,
    published,
    duration,
    audio,

    title,
    summary,
    image,

    draft,
    metadata,

    Content,
  };
};

const load = async function (): Promise<Array<Episode>> {
  const episodes = await getCollection('podcast', (episode) => episode.data.draft != true);
  const normalizedEpisodes = episodes.map(async (episode) => await getNormalizedEpisode(episode));

  const results = (await Promise.all(normalizedEpisodes)).sort((a, b) => b.episode - a.episode);

  return results;
};

let _episodes: Array<Episode>;

/** */
export const isPodcastEnabled = APP_PODCAST.isEnabled;

/** */
export const fetchEpisodes = async (): Promise<Array<Episode>> => {
  if (!_episodes) {
    _episodes = await load();
  }

  return _episodes;
};

