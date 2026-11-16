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

async function httpText(url: string, timeout = 5500): Promise<{ status: number; text: string }> {
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
      const kb = await httpText(`https://api.kinobox.tv/api/players?${q.join('&')}`, 3800);
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
          const srcLower = `${String(p.source || '')} ${rawUrl}`.toLowerCase();

          if (!result && srcLower.includes('ashdi')) {
            result = {
              id: 'ua-ashdi',
              name: '🇺🇦 UA • Ashdi VIP (UAKino Український дубляж)',
              badge: '🇺🇦 UA #1',
              url: rawUrl,
              mode: 'embed',
              langs: ['UA', 'UK'],
            };
          } else if (
            srcLower.includes('voidboost') ||
            srcLower.includes('rezka')
          ) {
            extraLiveServers.push({
              id: 'ua-voidboost-live',
              name: '🎬 HDRezka Direct VIP (Живе дзеркало • Усі озвучки)',
              badge: 'VIP Multi',
              url: rawUrl,
              mode: 'embed',
              langs: ['UA', 'MULTI', 'EN', 'RU', 'SUB'],
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
          3400
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
            const page = await httpText(pageUrl, 3400);
            const m =
              page.text.match(/https:\/\/(?:ashdi\.vip|uakino\.[a-z]+)\/(?:vod|serial|embed)?\/\d+/i) ||
              page.text.match(/iframe[^>]+src=["'](https?:\/\/[^"']*(?:ashdi|uakino)[^"']*)["']/i);
            if (m) {
              const embedUrl = m[1] || m[0];
              result = {
                id: 'ua-ashdi',
                name: '🇺🇦 UA • Ashdi VIP (UAKino Український дубляж)',
                badge: '🇺🇦 UA #1',
                url: embedUrl.startsWith('//') ? `https:${embedUrl}` : embedUrl,
                mode: 'embed',
                langs: ['UA', 'UK'],
              };
            }
          }
          if (urls.length > 0) break; // Mirror responded cleanly
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
 * Ordered Multi-Language Provider Catalogue with ISP-block bypass mirrors:
 * 1) Ukrainian (🇺🇦 UA) & Multi-Audio 4K channels (Videasy 4K, Ashdi, HDRezka + Namy + Embess mirrors, AutoEmbed, Kinobox)
 * 2) English (🇬🇧 EN) 4K HDR & 1080p channels (VidLink 4K, VidSrc PRO, Embed.su, VidFast, VidSrc XYZ)
 * 3) Polski (🇵🇱 PL) channels (Videasy PL, VidLink PL, SuperEmbed PL, AutoEmbed PL)
 * 4) Español (🇪🇸 ES) channels (Videasy ES, VidLink ES, SuperEmbed ES, AutoEmbed ES)
 * 5) Multi-Audio / Studio (🌐 MULTI / RU) channels & global failovers
 */
const PROVIDERS: ProviderDef[] = [
  // ──────── 1. UKRAINIAN (🇺🇦 UA) & MULTI-AUDIO PRIMARY BALANCERS ────────
  {
    id: 'ua-videasy',
    name: '🇺🇦 UA • Videasy 4K Українська (Без блокувань)',
    badge: '🇺🇦 4K UA',
    langs: ['UA', 'UK', 'MULTI', 'EN', 'SUB'],
    build: (c) =>
      c.tmdb
        ? c.series
          ? `https://player.videasy.net/tv/${c.tmdb}/${c.s}/${c.e}?color=e50914&lang=uk`
          : `https://player.videasy.net/movie/${c.tmdb}?color=e50914&lang=uk`
        : null,
  },
  {
    id: 'kinobox-multi',
    name: '🇺🇦 UA / Multi • Kinobox Aggregator (Ashdi • Voidboost • Alloha)',
    badge: '7-in-1 UA',
    langs: ['UA', 'MULTI', 'RU', 'EN'],
    build: (c) => {
      if (!c.imdb && !c.tmdb) return null;
      const q: string[] = [];
      if (c.imdb) q.push(`imdb=${encodeURIComponent(c.imdb)}`);
      if (c.tmdb) q.push(`tmdb=${encodeURIComponent(String(c.tmdb))}`);
      if (c.title) q.push(`title=${encodeURIComponent(c.title)}`);
      if (c.series) {
        q.push(`season=${c.s}`);
        q.push(`episode=${c.e}`);
      }
      return `/kinobox-player.html?${q.join('&')}`;
    },
  },
  {
    id: 'ua-autoembed',
    name: '🇺🇦 UA • AutoEmbed Pro Українська',
    badge: '🇺🇦 UA HD',
    langs: ['UA', 'MULTI', 'EN'],
    build: (c) => {
      const id = c.tmdb ? String(c.tmdb) : c.imdb || '';
      if (!id) return null;
      return c.series
        ? `https://player.autoembed.cc/embed/tv/${id}/${c.s}/${c.e}?lang=uk`
        : `https://player.autoembed.cc/embed/movie/${id}?lang=uk`;
    },
  },
  {
    id: 'multiembed-vip',
    name: '🇺🇦/🌐 SuperEmbed VIP Direct (Multi-Audio)',
    badge: 'VIP Multi',
    langs: ['UA', 'MULTI', 'EN', 'PL', 'ES', 'RU'],
    build: (c) => {
      if (c.tmdb) {
        return c.series
          ? `https://multiembed.mov/directstream.php?video_id=${c.tmdb}&tmdb=1&s=${c.s}&e=${c.e}`
          : `https://multiembed.mov/directstream.php?video_id=${c.tmdb}&tmdb=1`;
      }
      if (c.imdb) {
        return c.series
          ? `https://multiembed.mov/directstream.php?video_id=${c.imdb}&s=${c.s}&e=${c.e}`
          : `https://multiembed.mov/directstream.php?video_id=${c.imdb}`;
      }
      return null;
    },
  },

  // ──────── 2. ENGLISH CHANNELS (🇬🇧 EN) ────────
  {
    id: 'vidlink',
    name: '🇬🇧 EN • VidLink 4K HDR (Ultra Fast)',
    badge: '4K HDR',
    langs: ['EN', 'SUB', 'MULTI'],
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
    id: 'embed-su',
    name: '🇬🇧 EN • Embed.su 4K Ultra',
    badge: '🇬🇧 4K CDN',
    langs: ['EN', 'MULTI', 'SUB'],
    build: (c) => {
      const id = c.tmdb ? String(c.tmdb) : c.imdb || '';
      if (!id) return null;
      return c.series
        ? `https://embed.su/embed/tv/${id}/${c.s}/${c.e}`
        : `https://embed.su/embed/movie/${id}`;
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
  {
    id: 'vidsrc-xyz',
    name: '🇬🇧 EN • VidSrc XYZ Mirror',
    badge: '🇬🇧 Mirror',
    langs: ['EN', 'SUB'],
    build: (c) => {
      const id = c.imdb || (c.tmdb ? String(c.tmdb) : '');
      if (!id) return null;
      return c.series
        ? `https://vidsrc.xyz/embed/tv?imdb=${id}&season=${c.s}&episode=${c.e}`
        : `https://vidsrc.xyz/embed/movie?imdb=${id}`;
    },
  },

  // ──────── 3. POLISH CHANNELS (🇵🇱 PL) ────────
  {
    id: 'pl-videasy',
    name: '🇵🇱 PL • Videasy Polska 4K',
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
    id: 'pl-vidlink',
    name: '🇵🇱 PL • VidLink Polska HD',
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
  {
    id: 'pl-autoembed',
    name: '🇵🇱 PL • AutoEmbed Polska',
    badge: '🇵🇱 PL Mirror',
    langs: ['PL', 'MULTI'],
    build: (c) => {
      const id = c.tmdb ? String(c.tmdb) : c.imdb || '';
      if (!id) return null;
      return c.series
        ? `https://player.autoembed.cc/embed/tv/${id}/${c.s}/${c.e}?lang=pl`
        : `https://player.autoembed.cc/embed/movie/${id}?lang=pl`;
    },
  },

  // ──────── 4. SPANISH CHANNELS (🇪🇸 ES) ────────
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
    id: 'es-multiembed',
    name: '🇪🇸 ES • SuperEmbed Español',
    badge: '🇪🇸 ES HD',
    langs: ['ES', 'MULTI'],
    build: (c) => {
      if (c.tmdb) {
        return c.series
          ? `https://multiembed.mov/?video_id=${c.tmdb}&tmdb=1&s=${c.s}&e=${c.e}&lang=es`
          : `https://multiembed.mov/?video_id=${c.tmdb}&tmdb=1&lang=es`;
      }
      if (c.imdb) {
        return c.series
          ? `https://multiembed.mov/?video_id=${c.imdb}&s=${c.s}&e=${c.e}&lang=es`
          : `https://multiembed.mov/?video_id=${c.imdb}&lang=es`;
      }
      return null;
    },
  },
  {
    id: 'es-autoembed',
    name: '🇪🇸 ES • AutoEmbed Español',
    badge: '🇪🇸 ES Mirror',
    langs: ['ES', 'MULTI'],
    build: (c) => {
      const id = c.tmdb ? String(c.tmdb) : c.imdb || '';
      if (!id) return null;
      return c.series
        ? `https://player.autoembed.cc/embed/tv/${id}/${c.s}/${c.e}?lang=es`
        : `https://player.autoembed.cc/embed/movie/${id}?lang=es`;
    },
  },

  // ──────── 5. MULTI-AUDIO & STUDIO CHANNELS (🌐 MULTI / RU) ────────
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
    id: 'rezka-embess',
    name: '🎬 HDRezka Mirror (embess.ws • Резерв)',
    badge: 'Mirror #1',
    langs: ['MULTI', 'UA', 'UK', 'RU', 'EN'],
    build: (c) => {
      if (c.imdb) {
        return c.series
          ? `https://api.embess.ws/embed/imdb/${c.imdb}?season=${c.s}&episode=${c.e}`
          : `https://api.embess.ws/embed/imdb/${c.imdb}`;
      }
      if (c.tmdb) {
        return c.series
          ? `https://api.embess.ws/embed/tmdb/${c.tmdb}?season=${c.s}&episode=${c.e}`
          : `https://api.embess.ws/embed/tmdb/${c.tmdb}`;
      }
      return null;
    },
  },
  {
    id: 'rezka-namy',
    name: '🎬 HDRezka Mirror (namy.ws • Резерв)',
    badge: 'Mirror #2',
    langs: ['MULTI', 'UA', 'UK', 'RU', 'EN'],
    build: (c) => {
      if (c.imdb) {
        return c.series
          ? `https://api.namy.ws/embed/imdb/${c.imdb}?season=${c.s}&episode=${c.e}`
          : `https://api.namy.ws/embed/imdb/${c.imdb}`;
      }
      if (c.tmdb) {
        return c.series
          ? `https://api.namy.ws/embed/tmdb/${c.tmdb}?season=${c.s}&episode=${c.e}`
          : `https://api.namy.ws/embed/tmdb/${c.tmdb}`;
      }
      return null;
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
    series: isSeriesLike(media),
    s: season || 1,
    e: episode || 1,
  };

  const servers: StreamServer[] = [];

  // 1. Direct UAKino / Kinobox -> Ashdi VIP Ukrainian Dubbing (if already resolved)
  const ua = getCachedUaServer(media, ctx.s);
  if (ua && !servers.some((s) => s.id === ua.id)) {
    servers.push(ua);
  }

  // 1b. Direct live Voidboost / Alloha / Kodik URLs resolved from Kinobox API
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

  // 2. Build all configured multi-language providers in priority order
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

  // 3. Trailer channel
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
  /themeloadfailed|не удалось загрузить тему|змініть країну|недоступн|not available in your country|geo-?block|video not found|file not found|access denied|error code:\s*233011|this video file cannot be played/i;

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

export async function probeServer(url: string, timeoutMs: number = 4500): Promise<ServerHealth> {
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
        status = BLOCK_PAGE.test(body.slice(0, 2000)) && body.length < 3500 ? 'dead' : 'ok';
      } else {
        status = 'dead';
      }
    } else {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        // In Electron desktop, CORS headers are normalized so we can inspect actual status & body
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
        // Fallback no-cors connectivity check if browser environment restricts CORS
        const ctrl2 = new AbortController();
        const timer2 = setTimeout(() => ctrl2.abort(), 3000);
        try {
          await fetch(url, { mode: 'no-cors', signal: ctrl2.signal });
          status = 'ok';
        } catch {
          status = 'dead';
        } finally {
          clearTimeout(timer2);
        }
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
      const aUa = a.s.id.startsWith('ua-') || a.s.langs?.includes('UA') ? 0 : 1;
      const bUa = b.s.id.startsWith('ua-') || b.s.langs?.includes('UA') ? 0 : 1;
      if (aUa !== bUa) return aUa - bUa;

      return a.i - b.i;
    })
    .map((x) => x.s);
}
