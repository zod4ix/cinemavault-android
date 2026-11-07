import { MediaItem, TorrentItem } from '../types/movie';
import { httpGetJson } from './tmdb';
import { ensureIds, isSeriesLike } from './servers';

// High-speed UDP + WebRTC WebSocket trackers for instant P2P streaming without buffering
const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://movies.zsw.ca:6969/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.cyberia.is:6969/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
  'wss://tracker.webtorrent.dev',
]
  .map((t) => `&tr=${encodeURIComponent(t)}`)
  .join('');

export const magnetFor = (hash: string, name: string) =>
  `magnet:?xt=urn:btih:${hash.toLowerCase()}&dn=${encodeURIComponent(name)}${TRACKERS}`;

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
  if (/bdrip|bluray|blu-ray|remux/.test(n)) return '1080p';
  if (/web-?dl|webrip/.test(n)) return 'WEB-DL';
  if (/480p|dvdrip/.test(n)) return '480p';
  return 'HD';
}

function audioHint(name: string): string {
  const n = name.toLowerCase();
  const tags: string[] = [];
  if (/🇺🇦|ukr|ukrainian|\bua\b|укр|толока|hurtom|ashdi|uakino/.test(n)) tags.push('🇺🇦 UA');
  if (/🇬🇧|🇺🇸|\beng\b|english/.test(n)) tags.push('🇬🇧 EN');
  if (/🇵🇱|\bpol\b|polish|lektor|napisy|\bpl\b/.test(n)) tags.push('🇵🇱 PL');
  if (/🇪🇸|🇲🇽|\besp\b|spanish|latino|castellano|\bes\b/.test(n)) tags.push('🇪🇸 ES');
  if (/multi|dual/.test(n)) tags.push('🌐 MULTI');
  if (/🇷🇺|rus|\bru\b|дубляж|lostfilm|hdrezka|rezka/.test(n)) tags.push('RU');
  if (/atmos/.test(n)) tags.push('Atmos');
  else if (/ddp5|dd5|5\.1|dts|truehd/.test(n)) tags.push('5.1');
  if (/\bsubs?\b|esub|mvo/.test(n)) tags.push('SUB');
  return tags.length > 0 ? Array.from(new Set(tags)).join(' • ') : '🇬🇧 EN • 🌐 MULTI';
}

const QUALITY_RANK: Record<string, number> = {
  '4K HDR': 0,
  '4K': 1,
  '1080p': 2,
  'WEB-DL': 3,
  '720p': 4,
  HD: 5,
  '480p': 6,
};

const torrentCache = new Map<string, { at: number; items: TorrentItem[] }>();
const CACHE_TTL = 10 * 60 * 1000;

/**
 * 1. Torrentio Global Multi-Tracker Indexer (1337x, TPB, RARBG, RuTracker, Rutor, Nyaa, TorrentGalaxy, YTS, EZTV)
 */
async function fromTorrentio(
  imdb: string,
  series: boolean,
  season?: number,
  episode?: number
): Promise<TorrentItem[]> {
  try {
    const cleanImdb = imdb.startsWith('tt') ? imdb : `tt${imdb}`;
    const path = series
      ? `series/${cleanImdb}:${season || 1}:${episode || 1}.json`
      : `movie/${cleanImdb}.json`;
    const data = await httpGetJson(`https://torrentio.strem.fun/stream/${path}`, 6500);
    const streams: any[] = Array.isArray(data?.streams) ? data.streams : [];
    if (streams.length === 0) return [];

    return streams
      .filter((s) => typeof s?.infoHash === 'string' && s.infoHash.length >= 32)
      .map((s, idx): TorrentItem => {
        const rawTitle = String(s.title || s.behaviorHints?.filename || 'Release');
        const rawName = String(s.name || 'Torrentio');
        const lines = rawTitle.split('\n').map((l) => l.trim()).filter(Boolean);
        const releaseTitle = lines[0] || rawTitle;
        const metaLine = lines.slice(1).join(' ');

        const seedsMatch = rawTitle.match(/👤\s*(\d+)/);
        const sizeMatch = rawTitle.match(/💾\s*([\d.]+\s*[GMKT]B)/i);
        const trackerMatch = rawTitle.match(/⚙️\s*([^\n\r]+)/);

        const seeds = seedsMatch ? parseInt(seedsMatch[1], 10) : 25;
        const size = sizeMatch ? sizeMatch[1] : '2.4 GB';
        const tracker = trackerMatch
          ? trackerMatch[1].trim().slice(0, 18)
          : rawName.replace(/Torrentio\s*/i, '').trim() || 'P2P Swarm';

        const combinedText = `${rawName} ${releaseTitle} ${metaLine}`;
        return {
          id: `tio-${s.infoHash}-${idx}`,
          title: releaseTitle,
          tracker,
          size,
          seeds,
          peers: Math.max(2, Math.round(seeds * 0.35)),
          magnet: magnetFor(s.infoHash, releaseTitle),
          quality: qualityFromName(combinedText),
          audio: audioHint(combinedText),
          dateAdded: '',
        };
      });
  } catch {
    return [];
  }
}

/**
 * 2. Apibay (ThePirateBay DHT Index) — supports IMDb ID, English Title, and Ukrainian/Localized Title
 */
async function fromApibay(query: string): Promise<TorrentItem[]> {
  if (!query || query.trim().length < 2) return [];
  for (const host of ['https://apibay.org', 'https://apibay.ru']) {
    try {
      const data = await httpGetJson(`${host}/q.php?q=${encodeURIComponent(query.trim())}&cat=0`, 5500);
      if (Array.isArray(data) && data.length > 0) {
        const mapped = mapTpb(data);
        if (mapped.length > 0) return mapped;
      }
    } catch {
      // try next mirror
    }
  }
  return [];
}

function mapTpb(list: any[]): TorrentItem[] {
  return list
    .filter((t) => t.info_hash && !/^0+$/.test(t.info_hash) && t.name !== 'No results returned')
    .map((t): TorrentItem => {
      const name = String(t.name || 'Torrent');
      const added = Number(t.added);
      return {
        id: `tpb-${t.id || t.info_hash}`,
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

/**
 * 3. YTS Official API (High-speed 4K / 1080p MP4 streams ideal for Webtor / mobile playback)
 */
async function fromYts(queryTerm: string): Promise<TorrentItem[]> {
  if (!queryTerm) return [];
  for (const host of ['https://yts.mx', 'https://yts.lt', 'https://yts.am']) {
    try {
      const data = await httpGetJson(
        `${host}/api/v2/list_movies.json?query_term=${encodeURIComponent(queryTerm)}&limit=5`,
        5500
      );
      const movies: any[] = data?.data?.movies;
      if (!Array.isArray(movies) || movies.length === 0) continue;
      const items: TorrentItem[] = [];
      for (const movie of movies) {
        if (!Array.isArray(movie.torrents)) continue;
        for (const t of movie.torrents) {
          if (!t.hash) continue;
          const name = `${movie.title_long || movie.title} [${t.quality}] [${t.type || 'WEB'}] [YTS]`;
          items.push({
            id: `yts-${t.hash}`,
            title: name,
            tracker: 'YTS Fast',
            size: t.size || fmtSize(t.size_bytes),
            seeds: Number(t.seeds) || 15,
            peers: Number(t.peers) || 5,
            magnet: magnetFor(t.hash, name),
            quality: qualityFromName(`${t.quality} ${t.type}`),
            audio: '🇬🇧 EN • 5.1 • SUB',
            dateAdded: t.date_uploaded ? String(t.date_uploaded).slice(0, 10) : '',
          });
        }
      }
      if (items.length > 0) return items;
    } catch {
      // try next mirror
    }
  }
  return [];
}

/**
 * 4. EZTV Series API
 */
async function fromEztv(imdb: string, season?: number, episode?: number): Promise<TorrentItem[]> {
  const numeric = imdb.replace(/^tt/, '');
  if (!numeric) return [];
  for (const host of ['https://eztvx.to', 'https://eztv.wf']) {
    try {
      const data = await httpGetJson(`${host}/api/get-torrents?imdb_id=${numeric}&limit=100`, 5500);
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
            id: `eztv-${t.id || t.hash}`,
            title: name,
            tracker: 'EZTV',
            size: fmtSize(Number(t.size_bytes)),
            seeds: Number(t.seeds) || 0,
            peers: Number(t.peers) || 0,
            magnet: t.hash ? magnetFor(String(t.hash), name) : t.magnet_url,
            quality: qualityFromName(name),
            audio: audioHint(name),
            dateAdded: t.date_released_unix
              ? new Date(t.date_released_unix * 1000).toISOString().slice(0, 10)
              : '',
          };
        });
    } catch {
      // try next
    }
  }
  return [];
}

export const torrentService = {
  /**
   * Multi-Engine P2P Torrent Search:
   * Combines Torrentio (1337x/RARBG/RuTracker/Hurtom/Nyaa) + ThePirateBay + YTS + EZTV.
   * Prioritizes Ukrainian (🇺🇦 UA) and multi-language high-seed streams.
   */
  async searchTorrents(
    media: MediaItem,
    seasonNumber?: number,
    episodeNumber?: number
  ): Promise<TorrentItem[]> {
    const cacheKey = `${media.id}-s${seasonNumber || 0}e${episodeNumber || 0}`;
    const hit = torrentCache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL && hit.items.length > 0) {
      return hit.items;
    }

    const series = isSeriesLike(media);
    const ids = await ensureIds(media);
    const origTitle = (media.originalTitle || media.title || '').trim();
    const localTitle = (media.title || '').trim();
    const sTag = series && seasonNumber ? ` S${String(seasonNumber).padStart(2, '0')}` : '';
    const epTag =
      series && seasonNumber && episodeNumber
        ? ` S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`
        : sTag;

    const tasks: Promise<TorrentItem[]>[] = [];

    if (ids.imdb) {
      // 1. Torrentio multi-tracker (includes UA, EN, PL, ES, RU, Anime Nyaa)
      tasks.push(fromTorrentio(ids.imdb, series, seasonNumber, episodeNumber));

      if (series) {
        tasks.push(fromEztv(ids.imdb, seasonNumber, episodeNumber));
        tasks.push(fromApibay(`${origTitle}${epTag}`));
        if (sTag && epTag !== sTag) {
          tasks.push(fromApibay(`${origTitle}${sTag}`));
        }
      } else {
        tasks.push(fromYts(ids.imdb));
        tasks.push(fromApibay(ids.imdb));
        tasks.push(fromApibay(`${origTitle} ${media.year || ''}`));
      }
    } else {
      if (!series) {
        tasks.push(fromYts(origTitle));
      }
      tasks.push(fromApibay(`${origTitle}${series ? sTag : ` ${media.year || ''}`}`));
    }

    // Also search Ukrainian / localized releases specifically
    if (localTitle && localTitle.toLowerCase() !== origTitle.toLowerCase()) {
      tasks.push(fromApibay(`${localTitle} ${media.year || ''}`));
    }
    if (origTitle) {
      tasks.push(fromApibay(`${origTitle} ukr`));
    }

    const results = (await Promise.all(tasks.map((p) => p.catch(() => [] as TorrentItem[])))).flat();

    const seen = new Set<string>();
    const unique = results.filter((t) => {
      if (!t || !t.magnet) return false;
      const m = t.magnet.match(/btih:([a-z0-9]+)/i);
      const key = (m ? m[1] : t.id).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const sorted = unique
      .filter((t) => t.seeds > 0)
      .sort((a, b) => {
        // 1. Prioritize Ukrainian audio releases at the top!
        const aUa = a.audio.includes('🇺🇦') ? 0 : 1;
        const bUa = b.audio.includes('🇺🇦') ? 0 : 1;
        if (aUa !== bUa) return aUa - bUa;

        // 2. Prioritize healthy seeders (>= 5 seeds) over very low seeders
        const aHealthy = a.seeds >= 5 ? 0 : 1;
        const bHealthy = b.seeds >= 5 ? 0 : 1;
        if (aHealthy !== bHealthy) return aHealthy - bHealthy;

        // 3. Quality rank
        const q = (QUALITY_RANK[a.quality] ?? 5) - (QUALITY_RANK[b.quality] ?? 5);
        if (q !== 0) return q;

        // 4. Higher seeders
        return b.seeds - a.seeds;
      })
      .slice(0, 45);

    if (sorted.length > 0) {
      torrentCache.set(cacheKey, { at: Date.now(), items: sorted });
    }
    return sorted;
  },
};
