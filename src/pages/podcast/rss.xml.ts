import rss from '@astrojs/rss';
import type { APIRoute } from 'astro';
import fs from 'node:fs';
import path from 'node:path';

import { SITE, METADATA } from 'astrowind:config';
import { fetchEpisodes } from '~/utils/podcast';
import { getCanonical, getPermalink } from '~/utils/permalinks';

const AUDIO_MIME_TYPES: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
};

const getEnclosure = (audio: string) => {
  const ext = path.extname(audio).toLowerCase();
  const type = AUDIO_MIME_TYPES[ext] || 'audio/mpeg';

  if (audio.startsWith('http://') || audio.startsWith('https://')) {
    return { url: audio, length: 0, type };
  }

  const filePath = path.join(process.cwd(), 'public', audio);
  const length = fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;

  return { url: String(getCanonical(audio)), length, type };
};

export const GET: APIRoute = async ({ site }) => {
  const episodes = await fetchEpisodes();
  const coverUrl = String(getCanonical('/rss-album.jpeg'));
  const title = `Podcast — ${SITE.name}`;

  return rss({
    title,
    description: METADATA?.description || `Podcast do ${SITE.name}`,
    site: site as URL,
    xmlns: {
      itunes: 'http://www.itunes.com/dtds/podcast-1.0.dtd',
    },
    customData: `<language>pt-br</language><image><url>${coverUrl}</url><title>${title}</title><link>${String(
      getCanonical('/podcast')
    )}</link></image><itunes:image href="${coverUrl}" />`,
    items: episodes.map((episode) => ({
      title: episode.title,
      description: episode.summary,
      pubDate: episode.published,
      link: getPermalink(episode.permalink, 'episode'),
      enclosure: getEnclosure(episode.audio),
      customData: episode.duration ? `<itunes:duration>${episode.duration}</itunes:duration>` : undefined,
    })),
  });
};
