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

/** Fast fallback lookup via IMDb global CDN suggestion endpoint */
async function lookupImdbCdn(title: string, year?: number): Promise<string | undefined> {
  try {
    const clean = title.trim();
    if (!clean) return undefined;
    const res = await fetch(
      `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(clean)}.json`
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    const list: any[] = Array.isArray(data?.d) ? data.d : [];
    const titles = list.filter((item) => typeof item?.id === 'string' && item.id.startsWith('tt'));
    if (titles.length === 0) return undefined;
    if (year) {
      const exactYear = titles.find((item) => Math.abs(Number(item.y || 0) - year) <= 1);
      if (exactYear) return exactYear.id;
    }
    return titles[0].id;
  } catch {
    return undefined;
  }
}

/** Makes sure both IMDb and TMDB ids are known (Cinemeta lookup / IMDb CDN / title search). */
export async function ensureIds(media: MediaItem): Promise<ResolvedIds> {
  const key = media.id.toString();
  const cached = idCache.get(key);
  if (cached?.imdb && cached?.tmdb) return cached;

  let imdb = cached?.imdb || media.imdbId;
  let tmdb = cached?.tmdb || (!isForeignTmdb(media) ? media.tmdbId : undefined);

  try {
    const searchTitle = media.originalTitle || media.title;
    if (!imdb) {
      imdb = await findImdbIdByTitle(searchTitle, media.year, isSeriesLike(media));
    }
    if (!imdb) {
      imdb = await lookupImdbCdn(searchTitle, media.year);
    }
    if (!imdb && media.title && media.title !== searchTitle) {
      imdb = await lookupImdbCdn(media.title, media.year);
    }
    if (imdb && !tmdb) {
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

async function httpText(url: string, timeout = 7000): Promise<{ status: number; text: string }> {
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
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      return { status: res.status, text: await res.text() };
    } finally {
      clearTimeout(timer);
    }
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
            name: '🇺🇦 UA • Ashdi (UAKino Дубляж)',
            badge: '🇺🇦 UA #1',
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

// ───────────────────────────── Multi-Language Provider Catalogue ─────────────────────────────

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
 * Ordered Multi-Language Provider Catalogue:
 * 1) Multiple Ukrainian (🇺🇦 UA) channels first!
 * 2) English (🇬🇧 EN) 4K & 1080p channels
 * 3) Polski (🇵🇱 PL) channels
 * 4) Español (🇪🇸 ES) channels
 * 5) Multi-Audio / Studio (🌐 MULTI / RU) channels & global failovers
 */
const PROVIDERS: ProviderDef[] = [
  // ──────── 1. UKRAINIAN CHANNELS (🇺🇦 UA) ────────
  {
    id: 'ua-kino-rezka',
    name: '🇺🇦 UA • КіноБаза (Українська)',
    badge: '🇺🇦 UA Dub',
    langs: ['UA', 'UK'],
    build: (c) => {
      if (c.imdb) {
        return c.series
          ? `https://api.loadbox.ws/embed/imdb/${c.imdb}?season=${c.s}&episode=${c.e}&language=uk&audio=ua`
          : `https://api.loadbox.ws/embed/imdb/${c.imdb}?language=uk&audio=ua`;
      }
      return null;
    },
  },
  {
    id: 'ua-videasy',
    name: '🇺🇦 UA • Videasy 4K Українська',
    badge: '🇺🇦 4K UA',
    langs: ['UA', 'UK', 'SUB'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://player.videasy.net/tv/${c.tmdb}/${c.s}/${c.e}?color=e50914&lang=uk`
          : `https://player.videasy.net/movie/${c.tmdb}?color=e50914&lang=uk`
        : null,
  },
  {
    id: 'ua-autoembed',
    name: '🇺🇦 UA • AutoEmbed Українська',
    badge: '🇺🇦 UA HD',
    langs: ['UA', 'MULTI'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://autoembed.co/tv/tmdb/${c.tmdb}-${c.s}-${c.e}?lang=uk`
          : `https://autoembed.co/movie/tmdb/${c.tmdb}?lang=uk`
        : null,
  },

  // ──────── 2. ENGLISH CHANNELS (🇬🇧 EN) ────────
  {
    id: 'vidlink',
    name: '🇬🇧 EN • VidLink 4K HDR',
    badge: '4K HDR',
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
    id: 'vidsrc-cc',
    name: '🇬🇧 EN • VidSrc PRO 1080p',
    badge: '🇬🇧 1080p',
    langs: ['EN', 'SUB'],
    build: (c) => {
      const id = c.imdb || (c.tmdb ? String(c.tmdb) : '');
      if (!id) return null;
      return c.series
        ? `https://vidsrc.cc/v2/embed/tv/${id}/${c.s}/${c.e}?autoPlay=true`
        : `https://vidsrc.cc/v2/embed/movie/${id}?autoPlay=true`;
    },
  },
  {
    id: 'vidfast',
    name: '🇬🇧 EN • VidFast Ultra',
    badge: '🇬🇧 Fast HD',
    langs: ['EN', 'SUB'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://vidfast.pro/tv/${c.tmdb}/${c.s}/${c.e}`
          : `https://vidfast.pro/movie/${c.tmdb}`
        : null,
  },

  // ──────── 3. POLISH CHANNELS (🇵🇱 PL) ────────
  {
    id: 'pl-videasy',
    name: '🇵🇱 PL • Videasy Polska',
    badge: '🇵🇱 Lektor/Sub',
    langs: ['PL', 'EN'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://player.videasy.net/tv/${c.tmdb}/${c.s}/${c.e}?color=e50914&lang=pl`
          : `https://player.videasy.net/movie/${c.tmdb}?color=e50914&lang=pl`
        : null,
  },
  {
    id: 'pl-multiembed',
    name: '🇵🇱 PL • SuperEmbed Polska',
    badge: '🇵🇱 PL HD',
    langs: ['PL', 'MULTI'],
    build: (c) => {
      if (c.tmdb) {
        return c.series
          ? `https://multiembed.mov/?video_id=${c.tmdb}&tmdb=1&s=${c.s}&e=${c.e}&lang=pl`
          : `https://multiembed.mov/?video_id=${c.tmdb}&tmdb=1&lang=pl`;
      }
      if (c.imdb) {
        return c.series
          ? `https://multiembed.mov/?video_id=${c.imdb}&s=${c.s}&e=${c.e}&lang=pl`
          : `https://multiembed.mov/?video_id=${c.imdb}&lang=pl`;
      }
      return null;
    },
  },

  // ──────── 4. SPANISH CHANNELS (🇪🇸 ES) ────────
  {
    id: 'es-vidlink',
    name: '🇪🇸 ES • VidLink Español',
    badge: '🇪🇸 Latino/ES',
    langs: ['ES', 'EN'],
    build: (c) => {
      const id = anyId(c);
      if (!id) return null;
      if (c.series && !c.tmdb) return null;
      return c.series
        ? `https://vidlink.pro/tv/${id}/${c.s}/${c.e}?primaryColor=e50914&lang=es`
        : `https://vidlink.pro/movie/${id}?primaryColor=e50914&lang=es`;
    },
  },
  {
    id: 'es-videasy',
    name: '🇪🇸 ES • Videasy Español 4K',
    badge: '🇪🇸 ES 4K',
    langs: ['ES', 'SUB'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://player.videasy.net/tv/${c.tmdb}/${c.s}/${c.e}?color=e50914&lang=es`
          : `https://player.videasy.net/movie/${c.tmdb}?color=e50914&lang=es`
        : null,
  },

  // ──────── 5. MULTI-AUDIO & STUDIO CHANNELS (🌐 MULTI / RU) ────────
  {
    id: 'loadbox',
    name: '🎭 Rezka Multi-Studio (UA/EN/RU)',
    badge: 'Multi Audio',
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
    name: '🌐 Videasy Global 4K (All Langs)',
    badge: '4K Multi',
    langs: ['MULTI', 'UA', 'EN', 'PL', 'ES', 'RU'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://player.videasy.net/tv/${c.tmdb}/${c.s}/${c.e}?color=e50914`
          : `https://player.videasy.net/movie/${c.tmdb}?color=e50914`
        : null,
  },
  {
    id: 'vidsrc-pm',
    name: '🌐 VidSrc PM (Multi Mirror)',
    badge: 'HD',
    langs: ['EN', 'MULTI', 'SUB'],
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
    name: '🌐 VidSrc ME (Global Backup)',
    badge: 'HD',
    langs: ['EN', 'MULTI', 'SUB'],
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
    name: '🌐 VidSrc SU (Fast CDN)',
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
    id: '2embed',
    name: '🌐 2Embed International',
    badge: 'Backup HD',
    langs: ['EN', 'MULTI'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://www.2embed.cc/embedtv/${c.tmdb}&s=${c.s}&e=${c.e}`
          : `https://www.2embed.cc/embed/${c.tmdb}`
        : null,
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

  // 1. Direct UAKino -> Ashdi VIP Ukrainian Dubbing (always #1 when available)
  const ua = getCachedUaServer(media, ctx.s);
  if (ua) servers.push(ua);

  // 2. Fallback numeric ID Ukrainian & Multi Rezka server if IMDb not resolved yet
  if (!ids.imdb && /^\d+$/.test(String(media.id))) {
    const numId = String(media.id);
    const uaUrl = ctx.series
      ? `https://api.loadbox.ws/embed/kp/${numId}?season=${ctx.s}&episode=${ctx.e}&language=uk`
      : `https://api.loadbox.ws/embed/movie/${numId}?language=uk`;
    servers.push({
      id: 'ua-kino-rezka',
      name: '🇺🇦 UA • КіноБаза (Українська)',
      badge: '🇺🇦 UA Dub',
      url: uaUrl,
      mode: 'embed',
      langs: ['UA', 'UK'],
    });

    const multiUrl = ctx.series
      ? `https://api.loadbox.ws/embed/kp/${numId}?season=${ctx.s}&episode=${ctx.e}`
      : `https://api.loadbox.ws/embed/movie/${numId}`;
    servers.push({
      id: 'loadbox',
      name: '🎭 Rezka Multi-Studio (UA/EN/RU)',
      badge: 'Multi Audio',
      url: multiUrl,
      mode: 'embed',
      langs: ['UA', 'MULTI', 'RU', 'EN'],
    });
  }

  // 3. Build all configured multi-language providers
  for (const p of PROVIDERS) {
    if (servers.some((s) => s.id === p.id)) continue;
    const url = p.build(ctx);
    if (url) {
      servers.push({
        id: p.id,
        name: p.name,
        badge: p.badge,
        url,
        mode: 'embed',
        langs: p.langs,
      });
    }
  }

  // 4. Trailer channel
  servers.push(
    media.trailerYoutubeId
      ? {
          id: 'youtube-trailer',
          name: '🎬 Трейлер (YouTube HD)',
          badge: 'YouTube',
          url: `https://www.youtube-nocookie.com/embed/${media.trailerYoutubeId}?autoplay=1&rel=0&playsinline=1`,
          mode: 'trailer',
        }
      : {
          id: 'youtube-search',
          name: '🎬 Трейлер (YouTube HD)',
          badge: 'YouTube',
          url: `https://www.youtube-nocookie.com/embed?listType=search&list=${encodeURIComponent(
            (media.originalTitle || media.title) + ' official trailer'
          )}`,
          mode: 'trailer',
        }
  );

  // 5. Custom direct M3U8 / MP4 stream channel
  servers.push({
    id: 'custom-stream',
    name: '📡 Прямий потік M3U8 / MP4',
    badge: 'HLS/MP4',
    url: media.streamUrl || '',
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

export async function probeServer(url: string, timeoutMs: number = 5500): Promise<ServerHealth> {
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

/**
 * Stable sort:
 * - Working Ukrainian (🇺🇦 UA) servers ALWAYS come first!
 * - Followed by other working embed servers in language order (EN, PL, ES, MULTI)
 * - Unknown next, dead last, and trailer/custom at the end.
 */
export function orderByHealth(
  servers: StreamServer[],
  health: Map<string, ServerHealth> | Record<string, ServerHealth>
): StreamServer[] {
  const get = (id: string) => (health instanceof Map ? health.get(id) : health[id]);
  return servers
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const ae = a.s.mode === 'embed' ? 0 : 1;
      const be = b.s.mode === 'embed' ? 0 : 1;
      if (ae !== be) return ae - be;

      const d = rank(get(a.s.id)) - rank(get(b.s.id));
      if (d !== 0) return d;

      // Within the same health tier, keep Ukrainian channels first
      const aUa = a.s.id.startsWith('ua-') ? 0 : 1;
      const bUa = b.s.id.startsWith('ua-') ? 0 : 1;
      if (aUa !== bUa) return aUa - bUa;

      return a.i - b.i;
    })
    .map((x) => x.s);
}
