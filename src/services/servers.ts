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

// ───────────────────────────── Ukrainian dubbing (UAKino Mirrors + Kinobox → Ashdi) ─────────────────────────────

const uaCache = new Map<string, StreamServer | null>();
const kinoboxLiveCache = new Map<string, StreamServer[]>();

const UAKINO_MIRRORS = [
  'https://uakino.best',
  'https://uakino.me',
  'https://uakino.eu',
  'https://uakino.club',
];

const translitUk = (text: string) => {
  const map: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e', 'є': 'ye',
    'ж': 'zh', 'з': 'z', 'и': 'y', 'і': 'i', 'ї': 'yi', 'й': 'y', 'к': 'k', 'л': 'l',
    'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
    'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ь': '', 'ю': 'yu', 'я': 'ya'
  };
  return text
    .toLowerCase()
    .split('')
    .map((c) => map[c] ?? c)
    .join('');
};

const slugify = (s: string) =>
  translitUk(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

async function httpText(url: string, timeout = 4500): Promise<{ status: number; text: string }> {
  try {
    if (Capacitor.isNativePlatform()) {
      const r = await CapacitorHttp.get({
        url,
        headers: { 'User-Agent': MOBILE_UA, Accept: 'text/html,application/json,*/*' },
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

/**
 * Looks the title up via Kinobox API (Ashdi/Voidboost) and multiple UAKino mirrors
 * (`uakino.best`, `uakino.me`, `uakino.eu`, `uakino.club`) to bypass ISP domain blocks.
 */
export async function resolveUaServer(
  media: MediaItem,
  season: number = 1
): Promise<StreamServer | null> {
  const primaryTitle = media.title || media.originalTitle || '';
  const origTitle = media.originalTitle || '';
  const slug = slugify(primaryTitle);
  const origSlug = slugify(origTitle);
  const series = isSeriesLike(media) || media.mediaType === 'cartoon';
  const cacheKey = `${media.id}-${slug || origSlug}-${media.year}-${season}`;
  if (uaCache.has(cacheKey)) return uaCache.get(cacheKey)!;

  let result: StreamServer | null = null;
  const extraLiveServers: StreamServer[] = [];
  const ids = await ensureIds(media);

  // 1. Fast direct lookup via Kinobox Players API for Ashdi + Voidboost + Alloha + Kodik
  if (ids.imdb || ids.tmdb) {
    try {
      const q: string[] = [];
      if (ids.imdb) q.push(`imdb=${encodeURIComponent(ids.imdb)}`);
      if (ids.tmdb) q.push(`tmdb=${encodeURIComponent(String(ids.tmdb))}`);
      const kb = await httpText(`https://api.kinobox.tv/api/players?${q.join('&')}`, 2500);
      if (kb.status === 200 && kb.text) {
        const parsed = JSON.parse(kb.text);
        const list: any[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.data)
          ? parsed.data
          : [];
        for (const p of list) {
          if (!p?.iframeUrl || typeof p.iframeUrl !== 'string') continue;
          const rawUrl = p.iframeUrl.startsWith('//') ? `https:${p.iframeUrl}` : String(p.iframeUrl);
          const srcLower = `${String(p.type || p.source || '')} ${rawUrl}`.toLowerCase();

          if (!result && srcLower.includes('ashdi')) {
            result = {
              id: 'ua-ashdi',
              name: '🇺🇦 UA • Ashdi VIP (UAKino Український дубляж)',
              badge: '🇺🇦 UA VIP',
              url: rawUrl,
              mode: 'embed',
              langs: ['UA', 'UK'],
            };
          } else if (
            srcLower.includes('voidboost') ||
            srcLower.includes('rezka')
          ) {
            extraLiveServers.push({
              id: 'rezka-voidboost-live',
              name: '🎬 HDRezka Direct VIP (Живе дзеркало • Укр та всі студії)',
              badge: '🇺🇦 HDRezka VIP',
              url: rawUrl,
              mode: 'embed',
              langs: ['UA', 'MULTI', 'EN', 'RU', 'SUB'],
            });
          } else if (srcLower.includes('veoveo')) {
            extraLiveServers.push({
              id: 'ua-veoveo-live',
              name: '🇺🇦 UA / Multi • Veoveo Direct HD (Багатозвучка)',
              badge: 'Veoveo HD',
              url: rawUrl,
              mode: 'embed',
              langs: ['UA', 'MULTI', 'EN', 'RU'],
            });
          } else if (srcLower.includes('alloha')) {
            extraLiveServers.push({
              id: 'ua-alloha-live',
              name: '🇺🇦 UA / Multi • Alloha VIP (Дубляж та Студії)',
              badge: 'Alloha HD',
              url: rawUrl,
              mode: 'embed',
              langs: ['UA', 'MULTI', 'EN', 'RU'],
            });
          } else if (srcLower.includes('kodik')) {
            extraLiveServers.push({
              id: 'ua-kodik-live',
              name: '🌐 Kodik Direct HD (Серіали та Аніме)',
              badge: 'Kodik HD',
              url: rawUrl,
              mode: 'embed',
              langs: ['UA', 'MULTI', 'RU'],
            });
          }
        }
        if (extraLiveServers.length > 0) {
          kinoboxLiveCache.set(cacheKey, extraLiveServers);
        }
      }
    } catch {
      // Fallback to UAKino mirror search below
    }
  }

  // 2. Multi-mirror UAKino search (uakino.best, uakino.me, uakino.eu, uakino.club)
  const searchQueries = Array.from(new Set([primaryTitle, origTitle].filter(Boolean)));

  for (const query of searchQueries) {
    if (result) break;
    for (const mirrorBase of UAKINO_MIRRORS) {
      if (result) break;
      try {
        const search = await httpText(
          `${mirrorBase}/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`,
          2800
        );
        if (search.status === 200 && search.text) {
          const urls = Array.from(
            new Set(
              [
                ...search.text.matchAll(
                  /https?:\/\/uakino\.[a-z]+\/[a-z0-9-]+\/\d+-([a-z0-9-]+)\.html/gi
                ),
              ].map((m) => `${m[0]}|${m[1]}`)
            )
          );

          const candidates = urls.map((u) => {
            const [url, tail] = u.split('|');
            return { url, tail };
          });

          const scored = candidates.map((c) => {
            let score = 0;
            if (slug && c.tail.includes(slug)) score += 50;
            if (origSlug && c.tail.includes(origSlug)) score += 40;
            if (series && c.tail.includes(`-${season}-season-`)) score += 60;
            else if (!series && !c.tail.includes('-season-')) score += 30;
            if (media.year && c.tail.includes(String(media.year))) score += 25;
            return { ...c, score };
          });

          scored.sort((a, b) => b.score - a.score);
          const pick = scored[0];

          if (pick && (pick.score > 20 || candidates.length === 1)) {
            const pageUrl = pick.url.replace(/^https?:\/\/uakino\.[a-z]+/i, mirrorBase);
            const page = await httpText(pageUrl, 2800);
            const m =
              page.text.match(/https:\/\/(?:ashdi\.vip|uakino\.[a-z]+)\/(?:vod|serial|embed)?\/\d+/i) ||
              page.text.match(/iframe[^>]+src=["'](https?:\/\/[^"']*(?:ashdi|uakino)[^"']*)["']/i);
            if (m) {
              const embedUrl = m[1] || m[0];
              result = {
                id: 'ua-ashdi',
                name: '🇺🇦 UA • Ashdi VIP (UAKino Український дубляж)',
                badge: '🇺🇦 UA VIP',
                url: embedUrl.startsWith('//') ? `https:${embedUrl}` : embedUrl,
                mode: 'embed',
                langs: ['UA', 'UK'],
              };
            }
          }
          if (urls.length > 0) break;
        }
      } catch {
        // Try next UAKino mirror
      }
    }
  }

  uaCache.set(cacheKey, result);
  return result;
}

export function getCachedUaServer(media: MediaItem, season: number = 1): StreamServer | null {
  const primaryTitle = media.title || media.originalTitle || '';
  const origTitle = media.originalTitle || '';
  const slug = slugify(primaryTitle);
  const origSlug = slugify(origTitle);
  const k1 = `${media.id}-${slug || origSlug}-${media.year}-${season}`;
  if (uaCache.has(k1)) return uaCache.get(k1)!;
  const k2 = `${slug}-${media.year}-${season}`;
  if (uaCache.has(k2)) return uaCache.get(k2)!;
  const k3 = `${origSlug}-${media.year}-${season}`;
  if (origSlug && uaCache.has(k3)) return uaCache.get(k3)!;
  return null;
}

// ───────────────────────────── Multi-Language Provider Catalogue ─────────────────────────────

interface Ctx {
  imdb?: string;
  tmdb?: number;
  title?: string;
  year?: number;
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

function buildRezkaMirrorUrl(host: string, mirrorName: string, c: Ctx): string | null {
  if (c.imdb) {
    return c.series
      ? `https://${host}/embed/imdb/${c.imdb}?season=${c.s}&episode=${c.e}`
      : `https://${host}/embed/imdb/${c.imdb}`;
  }
  if (c.tmdb || c.title) {
    const q: string[] = [`mirror=${mirrorName}`];
    if (c.tmdb) q.push(`tmdb=${encodeURIComponent(String(c.tmdb))}`);
    if (c.title) q.push(`title=${encodeURIComponent(c.title)}`);
    if (c.year) q.push(`year=${encodeURIComponent(String(c.year))}`);
    if (c.series) {
      q.push(`season=${c.s}`);
      q.push(`episode=${c.e}`);
    }
    return `/kinobox-player.html?${q.join('&')}`;
  }
  return null;
}

/**
 * Strict Hierarchy Provider Catalogue (v3.7.2):
 * 1) HDRezka Primary Mirrors (#1 embess.ws, #2 namy.ws, #3 kinogram.best, #4 delivembd.ws) — Ukrainian priority + all voiceover studios
 * 2) Ukrainian (🇺🇦 UA) & Multi-Audio Balancers
 * 3) English (🇬🇧 EN) 4K HDR & 1080p Verified Fast CDNs (VidLink 4K, VidSrc SU, VidSrc TO, VidZee, 2Embed VIP)
 * 4) Polski (🇵🇱 PL) Verified Channels
 * 5) Español (🇪🇸 ES) Verified Channels
 */
const PROVIDERS: ProviderDef[] = [
  // ──────── 1. HDREZKA PRIMARY SERVERS (#1 IN HIERARCHY • UKRAINIAN PRIORITY) ────────
  {
    id: 'rezka-embess',
    name: '🎬 HDRezka #1 • Українська та всі студії (1080p FHD)',
    badge: '🇺🇦 HDRezka #1',
    langs: ['UA', 'UK', 'MULTI', 'EN', 'RU', 'SUB'],
    build: (c) => buildRezkaMirrorUrl('api.embess.ws', 'embess', c),
  },
  {
    id: 'rezka-namy',
    name: '🎬 HDRezka #2 • Пряме дзеркало (Укр / Дубляж / Студії)',
    badge: '🇺🇦 HDRezka #2',
    langs: ['UA', 'UK', 'MULTI', 'EN', 'RU', 'SUB'],
    build: (c) => buildRezkaMirrorUrl('api.namy.ws', 'namy', c),
  },
  {
    id: 'rezka-kinogram',
    name: '🎬 HDRezka #3 • Kinogram VIP (Укр / Багатозвучка 1080p)',
    badge: '🇺🇦 HDRezka #3',
    langs: ['UA', 'UK', 'MULTI', 'EN', 'RU'],
    build: (c) => buildRezkaMirrorUrl('api.kinogram.best', 'kinogram', c),
  },
  {
    id: 'rezka-delivembd',
    name: '🎬 HDRezka #4 • DelivEmbed CDN (Укр / Multi 1080p)',
    badge: 'HDRezka #4',
    langs: ['UA', 'UK', 'MULTI', 'EN', 'RU'],
    build: (c) => buildRezkaMirrorUrl('api.delivembd.ws', 'delivembd', c),
  },

  // ──────── 2. UKRAINIAN (🇺🇦 UA) & MULTI-BALANCER AGGREGATOR ────────
  {
    id: 'kinobox-multi',
    name: '🇺🇦 UA / Multi • Універсальний Балансер (HDRezka • Ashdi • VidLink)',
    badge: '🇺🇦 7-in-1 UA',
    langs: ['UA', 'UK', 'MULTI', 'EN', 'RU'],
    build: (c) => {
      if (!c.imdb && !c.tmdb && !c.title) return null;
      const q: string[] = [];
      if (c.imdb) q.push(`imdb=${encodeURIComponent(c.imdb)}`);
      if (c.tmdb) q.push(`tmdb=${encodeURIComponent(String(c.tmdb))}`);
      if (c.title) q.push(`title=${encodeURIComponent(c.title)}`);
      if (c.year) q.push(`year=${encodeURIComponent(String(c.year))}`);
      if (c.series) {
        q.push(`season=${c.s}`);
        q.push(`episode=${c.e}`);
      }
      return `/kinobox-player.html?${q.join('&')}`;
    },
  },

  // ──────── 3. VERIFIED 4K & 1080P GLOBAL / ENGLISH CHANNELS (🇬🇧 EN / MULTI) ────────
  {
    id: 'vidlink',
    name: '🇬🇧 EN / Multi • VidLink 4K HDR (Ultra Fast)',
    badge: '4K HDR',
    langs: ['EN', 'UA', 'SUB', 'MULTI'],
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
    id: 'vidsrc-su',
    name: '🇬🇧 EN • VidSrc SU 1080p (Fast Cloud CDN)',
    badge: '🇬🇧 1080p',
    langs: ['EN', 'SUB', 'MULTI'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://vidsrc.su/embed/tv/${c.tmdb}/${c.s}/${c.e}`
          : `https://vidsrc.su/embed/movie/${c.tmdb}`
        : null,
  },
  {
    id: 'vidsrc-to',
    name: '🇬🇧 EN • VidSrc TO PRO (1080p + Subtitles)',
    badge: '🇬🇧 PRO HD',
    langs: ['EN', 'SUB'],
    build: (c) => {
      const id = c.imdb || (c.tmdb ? String(c.tmdb) : '');
      if (!id) return null;
      return c.series
        ? `https://vidsrc.to/embed/tv/${id}/${c.s}/${c.e}`
        : `https://vidsrc.to/embed/movie/${id}`;
    },
  },
  {
    id: 'vidzee',
    name: '🇬🇧 EN • VidZee 4K Ultra CDN',
    badge: '🇬🇧 4K CDN',
    langs: ['EN', 'MULTI', 'SUB'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://player.vidzee.wtf/embed/tv/${c.tmdb}/${c.s}/${c.e}`
          : `https://player.vidzee.wtf/embed/movie/${c.tmdb}`
        : null,
  },
  {
    id: '2embed-vip',
    name: '🌐 Multi / EN • 2Embed Global Stream',
    badge: 'Global HD',
    langs: ['EN', 'MULTI', 'SUB'],
    build: (c) => {
      const id = c.imdb || (c.tmdb ? String(c.tmdb) : '');
      if (!id) return null;
      return c.series
        ? `https://www.2embed.cc/embedtv/${id}&s=${c.s}&e=${c.e}`
        : `https://www.2embed.cc/embed/${id}`;
    },
  },

  // ──────── 4. POLISH CHANNELS (🇵🇱 PL) ────────
  {
    id: 'pl-vidlink',
    name: '🇵🇱 PL • VidLink Polska 4K (Lektor / Napisy)',
    badge: '🇵🇱 PL 4K',
    langs: ['PL', 'EN'],
    build: (c) => {
      const id = anyId(c);
      if (!id) return null;
      if (c.series && !c.tmdb) return null;
      return c.series
        ? `https://vidlink.pro/tv/${id}/${c.s}/${c.e}?primaryColor=e50914&lang=pl`
        : `https://vidlink.pro/movie/${id}?primaryColor=e50914&lang=pl`;
    },
  },
  {
    id: 'pl-vidsrc-su',
    name: '🇵🇱 PL • VidSrc Polska HD',
    badge: '🇵🇱 PL HD',
    langs: ['PL', 'MULTI'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://vidsrc.su/embed/tv/${c.tmdb}/${c.s}/${c.e}?lang=pl`
          : `https://vidsrc.su/embed/movie/${c.tmdb}?lang=pl`
        : null,
  },
  {
    id: 'pl-vidsrc-to',
    name: '🇵🇱 PL • VidSrc TO Polska (Napisy PL)',
    badge: '🇵🇱 Napisy',
    langs: ['PL', 'EN'],
    build: (c) => {
      const id = c.imdb || (c.tmdb ? String(c.tmdb) : '');
      if (!id) return null;
      return c.series
        ? `https://vidsrc.to/embed/tv/${id}/${c.s}/${c.e}?sub.lang=pl`
        : `https://vidsrc.to/embed/movie/${id}?sub.lang=pl`;
    },
  },

  // ──────── 5. SPANISH CHANNELS (🇪🇸 ES) ────────
  {
    id: 'es-vidlink',
    name: '🇪🇸 ES • VidLink Español 4K (Latino / Castellano)',
    badge: '🇪🇸 ES 4K',
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
    id: 'es-vidsrc-su',
    name: '🇪🇸 ES • VidSrc Español HD',
    badge: '🇪🇸 ES HD',
    langs: ['ES', 'MULTI'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://vidsrc.su/embed/tv/${c.tmdb}/${c.s}/${c.e}?lang=es`
          : `https://vidsrc.su/embed/movie/${c.tmdb}?lang=es`
        : null,
  },
  {
    id: 'es-vidsrc-to',
    name: '🇪🇸 ES • VidSrc TO Español',
    badge: '🇪🇸 Sub ES',
    langs: ['ES', 'EN'],
    build: (c) => {
      const id = c.imdb || (c.tmdb ? String(c.tmdb) : '');
      if (!id) return null;
      return c.series
        ? `https://vidsrc.to/embed/tv/${id}/${c.s}/${c.e}?sub.lang=es`
        : `https://vidsrc.to/embed/movie/${id}?sub.lang=es`;
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
    title: media.originalTitle || media.title,
    year: media.year,
    series: isSeriesLike(media),
    s: season || 1,
    e: episode || 1,
  };

  const servers: StreamServer[] = [];

  // 1. Always place primary HDRezka mirrors FIRST (#1 & #2)
  const rezkaPrimaryIds = ['rezka-embess', 'rezka-namy', 'rezka-kinogram'];
  for (const rId of rezkaPrimaryIds) {
    const def = PROVIDERS.find((p) => p.id === rId);
    if (!def) continue;
    const url = def.build(ctx);
    if (url) {
      servers.push({
        id: def.id,
        name: def.name,
        badge: def.badge,
        url,
        mode: 'embed',
        langs: def.langs,
      });
    }
  }

  // 2. Direct UAKino / Kinobox -> Ashdi VIP Ukrainian Dubbing (right after HDRezka)
  const ua = getCachedUaServer(media, ctx.s);
  if (ua && !servers.some((s) => s.id === ua.id)) {
    servers.push(ua);
  }

  // 2b. Direct live Voidboost / Alloha / Kodik URLs resolved from Kinobox API
  const primaryTitle = media.title || media.originalTitle || '';
  const origTitle = media.originalTitle || '';
  const slug = slugify(primaryTitle);
  const origSlug = slugify(origTitle);
  const cacheKey = `${media.id}-${slug || origSlug}-${media.year}-${ctx.s}`;
  const liveExtras = kinoboxLiveCache.get(cacheKey);
  if (liveExtras && liveExtras.length > 0) {
    for (const ex of liveExtras) {
      if (!servers.some((s) => s.id === ex.id)) {
        servers.push(ex);
      }
    }
  }

  // 3. Build remaining configured multi-language providers in strict hierarchy order
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
  /themeloadfailed|не удалось загрузить тему|запрашиваемый контент не найден|змініть країну|недоступн|not available in your country|geo-?block|video not found|file not found|404 page not found|access denied|error code:\s*233011|this video file cannot be played/i;

const healthCache = new Map<string, { status: ServerHealth; at: number }>();
const HEALTH_TTL = 6 * 60 * 1000;

export function getCachedHealth(url: string): ServerHealth {
  const hit = healthCache.get(url);
  if (hit && Date.now() - hit.at < HEALTH_TTL) return hit.status;
  return 'checking';
}

export function markServerDead(url: string): void {
  if (!url) return;
  healthCache.set(url, { status: 'dead', at: Date.now() });
}

export async function probeServer(url: string, timeoutMs: number = 2800): Promise<ServerHealth> {
  if (!url) return 'unknown';
  if (url.startsWith('/')) return 'ok';
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
        status = BLOCK_PAGE.test(body.slice(0, 2000)) && body.length < 3500 ? 'dead' : 'ok';
      } else {
        status = 'dead';
      }
    } else {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        if (res.status === 404 || res.status === 410 || res.status >= 500) {
          status = 'dead';
        } else if (res.status >= 200 && res.status < 400) {
          const text = await res.text().catch(() => '');
          status = BLOCK_PAGE.test(text.slice(0, 2000)) && text.length < 3500 ? 'dead' : 'ok';
        } else {
          status = 'unknown';
        }
      } catch {
        status = 'unknown';
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    status = 'unknown';
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

const hierarchyTier = (s: StreamServer): number => {
  if (s.id === 'rezka-embess') return 0;
  if (s.id.startsWith('rezka-')) return 1;
  if (s.id === 'ua-ashdi' || s.id.startsWith('ua-')) return 2;
  if (s.langs?.includes('UA')) return 3;
  return 4;
};

/**
 * Stable hierarchy sort:
 * 1) Working HDRezka servers ALWAYS come first (#1 in hierarchy)!
 * 2) Followed by Ukrainian (🇺🇦 UA) servers
 * 3) Followed by other working embed servers in language order (EN, PL, ES, MULTI)
 * 4) Dead servers last, and trailer/custom at the end.
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

      const aDead = rank(get(a.s.id)) === 2 ? 1 : 0;
      const bDead = rank(get(b.s.id)) === 2 ? 1 : 0;
      if (aDead !== bDead) return aDead - bDead;

      const tDiff = hierarchyTier(a.s) - hierarchyTier(b.s);
      if (tDiff !== 0) return tDiff;

      const d = rank(get(a.s.id)) - rank(get(b.s.id));
      if (d !== 0) return d;

      return a.i - b.i;
    })
    .map((x) => x.s);
}
