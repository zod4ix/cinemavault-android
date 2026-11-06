import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { MediaItem, StreamServer } from '../types/movie';
import { findImdbIdByTitle, getCinemetaMetaAny } from './cinemeta';

export type ServerHealth = 'ok' | 'dead' | 'unknown' | 'checking';

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

// ───────────────────────────── ID resolution (IMDb ⇄ TMDB) ─────────────────────────────

export interface ResolvedIds {
  imdb?: string;
  tmdb?: number;
}

const idCache = new Map<string, ResolvedIds>();

const isForeignTmdb = (media: MediaItem) => {
  const id = media.id.toString();
  return id.startsWith('itunes-') || id.startsWith('tvmaze-') || id.startsWith('jikan-');
};

export const isSeriesLike = (media: MediaItem) =>
  media.mediaType === 'tv' || media.mediaType === 'anime';

/** Synchronous best-known ids (cache → item fields). */
export function getCachedIds(media: MediaItem): ResolvedIds {
  const cached = idCache.get(media.id.toString());
  if (cached) return cached;
  return {
    imdb: media.imdbId,
    tmdb: !isForeignTmdb(media) ? media.tmdbId : undefined,
  };
}

/** Makes sure both IMDb and TMDB ids are known (Cinemeta lookup / title search). */
export async function ensureIds(media: MediaItem): Promise<ResolvedIds> {
  const key = media.id.toString();
  const cached = idCache.get(key);
  if (cached?.imdb && cached?.tmdb) return cached;

  let imdb = cached?.imdb || media.imdbId;
  let tmdb = cached?.tmdb || (!isForeignTmdb(media) ? media.tmdbId : undefined);

  try {
    if (!imdb) {
      imdb = await findImdbIdByTitle(
        media.originalTitle || media.title,
        media.year,
        isSeriesLike(media)
      );
    }
    if (imdb) {
      const found = await getCinemetaMetaAny(imdb, isSeriesLike(media));
      const real = found?.meta?.moviedb_id;
      if (typeof real === 'number') tmdb = real;
    }
  } catch {
    // keep what we have
  }

  const out = { imdb, tmdb };
  idCache.set(key, out);
  return out;
}

// ───────────────────────────── Ukrainian dubbing (UAKino → Ashdi) ─────────────────────────────

const uaCache = new Map<string, StreamServer | null>();

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function httpText(url: string, timeout = 8000): Promise<{ status: number; text: string }> {
  try {
    if (Capacitor.isNativePlatform()) {
      const r = await CapacitorHttp.get({
        url,
        headers: { 'User-Agent': MOBILE_UA, Accept: 'text/html,*/*' },
        connectTimeout: timeout,
        readTimeout: timeout,
        responseType: 'text',
      });
      return { status: r.status, text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? '') };
    }
    const res = await fetch(url);
    return { status: res.status, text: await res.text() };
  } catch {
    return { status: 0, text: '' };
  }
}

/** Looks the title up on UAKino and returns the Ashdi (Ukrainian dub) player if one exists. */
export async function resolveUaServer(
  media: MediaItem,
  season: number = 1
): Promise<StreamServer | null> {
  const title = media.originalTitle || media.title;
  const slug = slugify(title);
  if (!slug || !/[a-z]/.test(slug)) return null;
  const series = isSeriesLike(media) || media.mediaType === 'cartoon';
  const cacheKey = `${slug}-${media.year}-${season}`;
  if (uaCache.has(cacheKey)) return uaCache.get(cacheKey)!;

  let result: StreamServer | null = null;
  try {
    const search = await httpText(
      `https://uakino.eu/index.php?do=search&subaction=search&story=${encodeURIComponent(title)}`
    );
    if (search.status === 200 && search.text) {
      const urls = Array.from(
        new Set(
          [...search.text.matchAll(/https:\/\/uakino\.eu\/[a-z]+\/\d+-([a-z0-9-]+)\.html/g)].map(
            (m) => `${m[0]}|${m[1]}`
          )
        )
      );
      const candidates = urls
        .map((u) => {
          const [url, tail] = u.split('|');
          return { url, tail };
        })
        .filter(({ tail }) => {
          if (!tail.startsWith(slug)) return false;
          const rest = tail.slice(slug.length);
          // movie: -YYYY ; series/cartoon: -N-season-YYYY
          if (/^-\d{4}$/.test(rest)) return Math.abs(parseInt(rest.slice(1), 10) - media.year) <= 1;
          const m = rest.match(/^-(\d+)-season-(\d{4})$/);
          if (m) return parseInt(m[1], 10) === season;
          return false;
        });
      const pick =
        candidates.find((c) => (series ? c.tail.includes('-season-') : !c.tail.includes('-season-'))) ||
        candidates[0];

      if (pick) {
        const page = await httpText(pick.url);
        const m = page.text.match(/https:\/\/ashdi\.vip\/(?:vod|serial)\/\d+/);
        if (m) {
          result = {
            id: 'ua-ashdi',
            name: 'UA • Ashdi',
            badge: '🇺🇦',
            url: m[0],
            mode: 'embed',
            langs: ['UA'],
          };
        }
      }
    }
  } catch {
    result = null;
  }
  uaCache.set(cacheKey, result);
  return result;
}

export function getCachedUaServer(media: MediaItem, season: number = 1): StreamServer | null {
  const slug = slugify(media.originalTitle || media.title);
  return uaCache.get(`${slug}-${media.year}-${season}`) ?? null;
}

// ───────────────────────────── Provider catalogue ─────────────────────────────

interface Ctx {
  imdb?: string;
  tmdb?: number;
  series: boolean;
  s: number;
  e: number;
}

interface ProviderDef {
  id: string;
  name: string;
  badge: string;
  langs: string[];
  build: (c: Ctx) => string | null;
}

const anyId = (c: Ctx) => (c.tmdb ? String(c.tmdb) : c.imdb || '');

/**
 * Every endpoint below was verified to respond (HTTP 200) with the exact URL shape used here.
 * Order = default priority; the health probe reorders them at runtime so a working one is always first.
 */
const PROVIDERS: ProviderDef[] = [
  {
    id: 'loadbox',
    name: 'Rezka Multi',
    badge: 'Multi',
    langs: ['UA', 'MULTI', 'RU', 'EN', 'SUB'],
    build: (c) => {
      if (c.imdb) {
        return c.series
          ? `https://api.loadbox.ws/embed/imdb/${c.imdb}?season=${c.s}&episode=${c.e}`
          : `https://api.loadbox.ws/embed/imdb/${c.imdb}`;
      }
      return null;
    },
  },
  {
    id: 'videasy',
    name: 'Videasy',
    badge: '4K',
    langs: ['MULTI', 'UA', 'RU', 'EN', 'SUB'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://player.videasy.net/tv/${c.tmdb}/${c.s}/${c.e}?color=e50914`
          : `https://player.videasy.net/movie/${c.tmdb}?color=e50914`
        : null,
  },
  {
    id: 'vidlink',
    name: 'VidLink',
    badge: '4K',
    langs: ['EN', 'SUB'],
    build: (c) => {
      const id = anyId(c);
      if (!id) return null;
      if (c.series && !c.tmdb) return null;
      return c.series
        ? `https://vidlink.pro/tv/${id}/${c.s}/${c.e}?primaryColor=e50914&autoplay=true`
        : `https://vidlink.pro/movie/${id}?primaryColor=e50914&autoplay=true`;
    },
  },
  {
    id: 'vidfast',
    name: 'VidFast',
    badge: 'HD',
    langs: ['EN', 'SUB'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://vidfast.pro/tv/${c.tmdb}/${c.s}/${c.e}`
          : `https://vidfast.pro/movie/${c.tmdb}`
        : null,
  },
  {
    id: 'vidsrc-pm',
    name: 'VidSrc PM',
    badge: 'HD',
    langs: ['EN', 'SUB'],
    build: (c) => {
      const q = c.imdb ? `imdb=${c.imdb}` : c.tmdb ? `tmdb=${c.tmdb}` : '';
      if (!q) return null;
      return c.series
        ? `https://vidsrc.pm/embed/tv?${q}&season=${c.s}&episode=${c.e}`
        : `https://vidsrc.pm/embed/movie?${q}`;
    },
  },
  {
    id: 'vidsrc-me',
    name: 'VidSrc ME',
    badge: 'HD',
    langs: ['EN', 'SUB'],
    build: (c) => {
      const q = c.imdb ? `imdb=${c.imdb}` : c.tmdb ? `tmdb=${c.tmdb}` : '';
      if (!q) return null;
      return c.series
        ? `https://vidsrc.me/embed/tv?${q}&season=${c.s}&episode=${c.e}`
        : `https://vidsrc.me/embed/movie?${q}`;
    },
  },
  {
    id: 'vidsrc-su',
    name: 'VidSrc SU',
    badge: 'HD',
    langs: ['EN', 'SUB'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://vidsrc.su/embed/tv/${c.tmdb}/${c.s}/${c.e}`
          : `https://vidsrc.su/embed/movie/${c.tmdb}`
        : null,
  },
  {
    id: 'vidsrc-to',
    name: 'VidSrc TO',
    badge: 'HD',
    langs: ['EN', 'SUB'],
    build: (c) => {
      const id = anyId(c);
      if (!id) return null;
      return c.series
        ? `https://vidsrc.to/embed/tv/${id}/${c.s}/${c.e}`
        : `https://vidsrc.to/embed/movie/${id}`;
    },
  },
  {
    id: 'vidzee',
    name: 'VidZee',
    badge: 'HD',
    langs: ['EN', 'SUB'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://player.vidzee.wtf/embed/tv/${c.tmdb}/${c.s}/${c.e}`
          : `https://player.vidzee.wtf/embed/movie/${c.tmdb}`
        : null,
  },
  {
    id: 'autoembed',
    name: 'AutoEmbed',
    badge: 'Multi',
    langs: ['MULTI'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://autoembed.co/tv/tmdb/${c.tmdb}-${c.s}-${c.e}`
          : `https://autoembed.co/movie/tmdb/${c.tmdb}`
        : null,
  },
  {
    id: '2embed',
    name: '2Embed',
    badge: 'HD',
    langs: ['EN'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://www.2embed.cc/embedtv/${c.tmdb}&s=${c.s}&e=${c.e}`
          : `https://www.2embed.cc/embed/${c.tmdb}`
        : null,
  },
  {
    id: 'multiembed',
    name: 'SuperEmbed',
    badge: 'Backup',
    langs: ['MULTI'],
    build: (c) => {
      if (c.tmdb) {
        return c.series
          ? `https://multiembed.mov/?video_id=${c.tmdb}&tmdb=1&s=${c.s}&e=${c.e}`
          : `https://multiembed.mov/?video_id=${c.tmdb}&tmdb=1`;
      }
      if (c.imdb) {
        return c.series
          ? `https://multiembed.mov/?video_id=${c.imdb}&s=${c.s}&e=${c.e}`
          : `https://multiembed.mov/?video_id=${c.imdb}`;
      }
      return null;
    },
  },
  {
    id: 'vidsrc-dev',
    name: 'VidSrc DEV',
    badge: 'HD',
    langs: ['EN'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://vidsrc.dev/embed/tv/${c.tmdb}/${c.s}/${c.e}`
          : `https://vidsrc.dev/embed/movie/${c.tmdb}`
        : null,
  },
  {
    id: 'vidsrc-cc',
    name: 'VidSrc CC',
    badge: 'HD',
    langs: ['EN', 'SUB'],
    build: (c) => {
      const id = c.imdb || (c.tmdb ? String(c.tmdb) : '');
      if (!id) return null;
      return c.series
        ? `https://vidsrc.cc/v2/embed/tv/${id}/${c.s}/${c.e}?autoPlay=true`
        : `https://vidsrc.cc/v2/embed/movie/${id}?autoPlay=true`;
    },
  },
];

export function buildServers(
  media: MediaItem,
  season: number = 1,
  episode: number = 1
): StreamServer[] {
  const ids = getCachedIds(media);
  const ctx: Ctx = {
    imdb: ids.imdb,
    tmdb: ids.tmdb,
    series: isSeriesLike(media),
    s: season || 1,
    e: episode || 1,
  };

  const servers: StreamServer[] = [];

  const ua = getCachedUaServer(media, ctx.s);
  if (ua) servers.push(ua);

  if (!ids.imdb && /^\d+$/.test(String(media.id))) {
    const numId = String(media.id);
    const url = ctx.series
      ? `https://api.loadbox.ws/embed/kp/${numId}?season=${ctx.s}&episode=${ctx.e}`
      : `https://api.loadbox.ws/embed/movie/${numId}`;
    servers.push({
      id: 'loadbox',
      name: 'Rezka Multi',
      badge: 'Multi',
      url,
      mode: 'embed',
      langs: ['UA', 'MULTI', 'RU', 'EN'],
    });
  }

  for (const p of PROVIDERS) {
    const url = p.build(ctx);
    if (url) servers.push({ id: p.id, name: p.name, badge: p.badge, url, mode: 'embed', langs: p.langs });
  }

  servers.push(
    media.trailerYoutubeId
      ? {
          id: 'youtube-trailer',
          name: 'Trailer',
          badge: 'YouTube',
          url: `https://www.youtube-nocookie.com/embed/${media.trailerYoutubeId}?autoplay=1&rel=0&playsinline=1`,
          mode: 'trailer',
        }
      : {
          id: 'youtube-search',
          name: 'Trailer',
          badge: 'YouTube',
          url: `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(
            (media.originalTitle || media.title) + ' official trailer'
          )}`,
          mode: 'trailer',
        }
  );

  servers.push({
    id: 'custom-stream',
    name: 'M3U8 / MP4',
    badge: 'URL',
    url: '',
    mode: 'native',
  });

  return servers;
}

// ───────────────────────────── Health probing ─────────────────────────────

const BLOCK_PAGE =
  /змініть країну|недоступн|not available in your country|geo-?block|video not found|not found|file not found|access denied|just a moment|attention required/i;

const healthCache = new Map<string, { status: ServerHealth; at: number }>();
const HEALTH_TTL = 6 * 60 * 1000;

export function getCachedHealth(url: string): ServerHealth {
  const hit = healthCache.get(url);
  if (hit && Date.now() - hit.at < HEALTH_TTL) return hit.status;
  return 'checking';
}

export async function probeServer(url: string, timeoutMs: number = 6500): Promise<ServerHealth> {
  if (!url) return 'unknown';
  const cached = healthCache.get(url);
  if (cached && Date.now() - cached.at < HEALTH_TTL) return cached.status;

  let status: ServerHealth = 'unknown';
  try {
    if (Capacitor.isNativePlatform()) {
      const r = await CapacitorHttp.get({
        url,
        headers: { 'User-Agent': MOBILE_UA, Referer: 'https://localhost/', Accept: 'text/html,*/*' },
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
        responseType: 'text',
      });
      const body = typeof r.data === 'string' ? r.data : '';
      if (r.status === 403 || r.status === 429 || r.status === 503) {
        // Cloudflare-style challenge pages work in a real browser — keep selectable but not preferred
        status = 'unknown';
      } else if (r.status >= 200 && r.status < 400) {
        status = BLOCK_PAGE.test(body.slice(0, 1500)) && body.length < 2500 ? 'dead' : 'ok';
      } else {
        status = 'dead';
      }
    } else {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        await fetch(url, { mode: 'no-cors', signal: ctrl.signal });
        status = 'ok';
      } catch {
        status = 'dead';
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    status = 'dead';
  }
  healthCache.set(url, { status, at: Date.now() });
  return status;
}

/** Probes all embed servers in parallel, reporting each result as soon as it lands. */
export async function probeServers(
  servers: StreamServer[],
  onResult?: (server: StreamServer, health: ServerHealth) => void
): Promise<Map<string, ServerHealth>> {
  const out = new Map<string, ServerHealth>();
  await Promise.all(
    servers.map(async (srv) => {
      if (srv.mode !== 'embed') {
        out.set(srv.id, 'ok');
        return;
      }
      const h = await probeServer(srv.url);
      out.set(srv.id, h);
      onResult?.(srv, h);
    })
  );
  return out;
}

const rank = (h: ServerHealth | undefined) =>
  h === 'ok' ? 0 : h === 'unknown' || h === 'checking' || !h ? 1 : 2;

/** Stable sort: working first, then unknown, dead last (priority order preserved inside each group). */
export function orderByHealth(
  servers: StreamServer[],
  health: Map<string, ServerHealth> | Record<string, ServerHealth>
): StreamServer[] {
  const get = (id: string) => (health instanceof Map ? health.get(id) : health[id]);
  return servers
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      // keep trailer / custom at the end regardless
      const ae = a.s.mode === 'embed' ? 0 : 1;
      const be = b.s.mode === 'embed' ? 0 : 1;
      if (ae !== be) return ae - be;
      const d = rank(get(a.s.id)) - rank(get(b.s.id));
      return d !== 0 ? d : a.i - b.i;
    })
    .map((x) => x.s);
}
