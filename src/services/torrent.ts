import { MediaItem, TorrentItem } from '../types/movie';
import { httpGetJson } from './tmdb';
import { ensureIds, isSeriesLike } from './servers';

const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://open.demonii.com:1337/announce',
]
  .map((t) => `&tr=${encodeURIComponent(t)}`)
  .join('');

const magnetFor = (hash: string, name: string) =>
  `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}${TRACKERS}`;

const fmtSize = (bytes: number): string => {
  if (!bytes || bytes <= 0) return '—';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(gb >= 10 ? 1 : 2)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
};

function qualityFromName(name: string): string {
  const n = name.toLowerCase();
  if (/2160p|\b4k\b|uhd/.test(n)) return /hdr|dv|dolby/.test(n) ? '4K HDR' : '4K';
  if (/1080p/.test(n)) return '1080p';
  if (/720p/.test(n)) return '720p';
  if (/480p|dvdrip/.test(n)) return '480p';
  if (/bdrip|bluray|blu-ray/.test(n)) return 'BDRip';
  if (/web-?dl|webrip/.test(n)) return 'WEB-DL';
  return 'SD';
}

function audioHint(name: string): string {
  const n = name.toLowerCase();
  const tags: string[] = [];
  if (/ukr|ukrainian|\bua\b|укр/.test(n)) tags.push('UA');
  if (/multi|dual/.test(n)) tags.push('MULTI');
  if (/rus|\bru\b/.test(n)) tags.push('RU');
  if (/atmos/.test(n)) tags.push('Atmos');
  else if (/ddp5|dd5|5\.1|dts/.test(n)) tags.push('5.1');
  if (/\bsubs?\b|esub/.test(n)) tags.push('SUB');
  return tags.length > 0 ? tags.join(' • ') : 'EN';
}

const QUALITY_RANK: Record<string, number> = {
  '4K HDR': 0,
  '4K': 1,
  '1080p': 2,
  '720p': 3,
  BDRip: 4,
  'WEB-DL': 5,
  '480p': 6,
  SD: 7,
};

async function fromApibay(query: string, series: boolean): Promise<TorrentItem[]> {
  void series;
  for (const host of ['https://apibay.org', 'https://apibay.ru']) {
    const data = await httpGetJson(`${host}/q.php?q=${encodeURIComponent(query)}&cat=0`);
    if (Array.isArray(data)) return mapTpb(data);
  }
  return [];
}

function mapTpb(list: any[]): TorrentItem[] {
  return list
    .filter((t) => t.info_hash && !/^0+$/.test(t.info_hash))
    .map((t): TorrentItem => {
      const name = String(t.name || 'Torrent');
      const added = Number(t.added);
      return {
        id: `tpb-${t.id}`,
        title: name,
        tracker: 'ThePirateBay',
        size: fmtSize(Number(t.size)),
        seeds: Number(t.seeders) || 0,
        peers: Number(t.leechers) || 0,
        magnet: magnetFor(String(t.info_hash), name),
        quality: qualityFromName(name),
        audio: audioHint(name),
        dateAdded: added ? new Date(added * 1000).toISOString().slice(0, 10) : '',
      };
    });
}

async function fromYts(imdb: string): Promise<TorrentItem[]> {
  for (const host of ['https://yts.lt', 'https://yts.am', 'https://yts.mx']) {
    const data = await httpGetJson(`${host}/api/v2/list_movies.json?query_term=${imdb}&limit=1`);
    const movie = data?.data?.movies?.[0];
    if (!movie || !Array.isArray(movie.torrents)) continue;
    return movie.torrents.map((t: any): TorrentItem => {
      const name = `${movie.title_long} [${t.quality}] [${t.type}] [YTS]`;
      return {
        id: `yts-${t.hash}`,
        title: name,
        tracker: 'YTS',
        size: t.size || fmtSize(t.size_bytes),
        seeds: Number(t.seeds) || 0,
        peers: Number(t.peers) || 0,
        magnet: magnetFor(t.hash, name),
        quality: qualityFromName(`${t.quality} ${t.type}`),
        audio: 'EN • 5.1',
        dateAdded: t.date_uploaded ? String(t.date_uploaded).slice(0, 10) : '',
      };
    });
  }
  return [];
}

async function fromEztv(imdb: string, season?: number, episode?: number): Promise<TorrentItem[]> {
  const numeric = imdb.replace(/^tt/, '');
  for (const host of ['https://eztvx.to', 'https://eztv.wf']) {
    const data = await httpGetJson(`${host}/api/get-torrents?imdb_id=${numeric}&limit=100`);
    const list: any[] = Array.isArray(data?.torrents) ? data.torrents : [];
    if (list.length === 0) continue;
    return list
      .filter((t) => {
        if (!season) return true;
        if (Number(t.season) !== season) return false;
        return !episode || Number(t.episode) === episode || Number(t.episode) === 0;
      })
      .map((t): TorrentItem => {
        const name = String(t.title || t.filename || 'Episode');
        return {
          id: `eztv-${t.id}`,
          title: name,
          tracker: 'EZTV',
          size: fmtSize(Number(t.size_bytes)),
          seeds: Number(t.seeds) || 0,
          peers: Number(t.peers) || 0,
          magnet: t.magnet_url || magnetFor(String(t.hash), name),
          quality: qualityFromName(name),
          audio: audioHint(name),
          dateAdded: t.date_released_unix ? new Date(t.date_released_unix * 1000).toISOString().slice(0, 10) : '',
        };
      });
  }
  return [];
}

export const torrentService = {
  /** Real torrent search: ThePirateBay + YTS (movies) + EZTV (series), merged & sorted by quality then seeders. */
  async searchTorrents(
    media: MediaItem,
    seasonNumber?: number,
    episodeNumber?: number
  ): Promise<TorrentItem[]> {
    const series = isSeriesLike(media);
    const ids = await ensureIds(media);
    const title = media.originalTitle || media.title;
    const tasks: Promise<TorrentItem[]>[] = [];

    if (ids.imdb) {
      if (series) {
        tasks.push(fromEztv(ids.imdb, seasonNumber, episodeNumber));
        const sTag = seasonNumber ? ` S${String(seasonNumber).padStart(2, '0')}` : '';
        tasks.push(fromApibay(`${title}${sTag}`, true));
      } else {
        tasks.push(fromYts(ids.imdb));
        tasks.push(fromApibay(ids.imdb, false));
      }
    } else {
      tasks.push(fromApibay(`${title} ${media.year}`, series));
    }

    const results = (await Promise.all(tasks.map((p) => p.catch(() => [] as TorrentItem[])))).flat();

    const seen = new Set<string>();
    const unique = results.filter((t) => {
      const m = t.magnet.match(/btih:([a-z0-9]+)/i);
      const key = (m ? m[1] : t.id).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return unique
      .filter((t) => t.seeds > 0)
      .sort((a, b) => {
        const q = (QUALITY_RANK[a.quality] ?? 9) - (QUALITY_RANK[b.quality] ?? 9);
        return q !== 0 ? q : b.seeds - a.seeds;
      })
      .slice(0, 30);
  },
};
