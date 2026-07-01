import type { PaginateFunction } from 'astro';
import { getCollection, render } from 'astro:content';
import type { CollectionEntry } from 'astro:content';
import type { Episode } from '~/types';
import { APP_PODCAST } from 'astrowind:config';
import { cleanSlug, trimSlash, PODCAST_BASE, EPISODE_PERMALINK_PATTERN } from './permalinks';

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
export const isPodcastListRouteEnabled = APP_PODCAST.list.isEnabled;
export const isPodcastEpisodeRouteEnabled = APP_PODCAST.episode.isEnabled;

export const podcastListRobots = APP_PODCAST.list.robots;
export const podcastEpisodeRobots = APP_PODCAST.episode.robots;

export const podcastEpisodesPerPage = APP_PODCAST?.episodesPerPage;

/** */
export const fetchEpisodes = async (): Promise<Array<Episode>> => {
  if (!_episodes) {
    _episodes = await load();
  }

  return _episodes;
};

/** */
export const findLatestEpisodes = async ({ count }: { count?: number }): Promise<Array<Episode>> => {
  const _count = count || 4;
  const episodes = await fetchEpisodes();

  return episodes ? episodes.slice(0, _count) : [];
};

/** */
export const getStaticPathsPodcastList = async ({ paginate }: { paginate: PaginateFunction }) => {
  if (!isPodcastEnabled || !isPodcastListRouteEnabled) return [];
  return paginate(await fetchEpisodes(), {
    params: { podcast: PODCAST_BASE || undefined },
    pageSize: podcastEpisodesPerPage,
  });
};

/** */
export const getStaticPathsPodcastEpisode = async () => {
  if (!isPodcastEnabled || !isPodcastEpisodeRouteEnabled) return [];
  return (await fetchEpisodes()).flatMap((episode) => ({
    params: {
      podcast: episode.permalink,
    },
    props: { episode },
  }));
};
