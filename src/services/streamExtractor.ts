import { Capacitor, CapacitorHttp } from '@capacitor/core';

export interface ExtractedAudioTrack {
  index: number;
  name: string;
  isUkrainian: boolean;
}

export interface ExtractedSubtitle {
  url: string;
  name: string;
}

export interface ExtractedStreamResult {
  hlsUrl: string;
  audioTracks: ExtractedAudioTrack[];
  preferredAudioIndex: number;
  subtitles: ExtractedSubtitle[];
  title?: string;
  sourceHost: string;
}

const MOBILE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

const UKR_VOICE_REGEX =
  /(укр|ukr|ua\b|uateam|1\+1|новий|ictv|стб|цікава|незламн|двохголос.*укр|дубл.*укр|багатоголос.*укр|озвуч.*укр)/i;

const CACHE_TTL_MS = 20 * 60 * 1000;
const streamCache = new Map<string, { data: ExtractedStreamResult; at: number }>();
const inflightRequests = new Map<string, Promise<ExtractedStreamResult | null>>();

const STRMFREE_CACHE_TTL_MS = 45 * 1000;
const strmFreeCache = new Map<
  string,
  { data: { hlsUrl?: string; embedUrl: string } | null; at: number }
>();

const REZKA_MIRROR_HOSTS = [
  'api.embess.ws',
  'api.namy.ws',
  'api.kinogram.best',
  'api.delivembd.ws',
];

async function fetchHtmlOrJson(
  url: string,
  timeoutMs = 2600,
  extraHeaders: Record<string, string> = {}
): Promise<{ status: number; text: string }> {
  try {
    if (Capacitor.isNativePlatform()) {
      const r = await CapacitorHttp.get({
        url,
        headers: {
          'User-Agent': MOBILE_UA,
          Accept: 'text/html,application/json,*/*',
          ...extraHeaders,
        },
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
        responseType: 'text',
      });
      return {
        status: r.status,
        text: typeof r.data === 'string' ? r.data : JSON.stringify(r.data ?? ''),
      };
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          Accept: 'text/html,application/json,*/*',
          ...extraHeaders,
        },
      });
      return { status: res.status, text: await res.text() };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { status: 0, text: '' };
  }
}

function extractBalancedJsonArray(source: string, startIdx: number): string | null {
  if (startIdx < 0 || source[startIdx] !== '[') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < source.length; i++) {
    const ch = source[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) {
        return source.slice(startIdx, i + 1);
      }
    }
  }
  return null;
}

function extractBalancedJsonObject(source: string, startIdx: number): string | null {
  if (startIdx < 0 || source[startIdx] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = startIdx; i < source.length; i++) {
    const ch = source[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(startIdx, i + 1);
      }
    }
  }
  return null;
}

function mapAudioTracks(names: unknown): {
  audioTracks: ExtractedAudioTrack[];
  preferredAudioIndex: number;
} {
  if (!Array.isArray(names)) return { audioTracks: [], preferredAudioIndex: -1 };
  const audioTracks: ExtractedAudioTrack[] = names
    .map((raw, idx) => {
      const name = String(raw || `Track ${idx + 1}`).trim();
      return {
        index: idx,
        name,
        isUkrainian: UKR_VOICE_REGEX.test(name),
      };
    })
    .filter((t) => Boolean(t.name));

  const ukr = audioTracks.find((t) => t.isUkrainian);
  return {
    audioTracks,
    preferredAudioIndex: ukr ? ukr.index : -1,
  };
}

function mapSubtitles(cc: unknown): ExtractedSubtitle[] {
  if (!Array.isArray(cc)) return [];
  return cc
    .filter((c) => c && typeof c.url === 'string' && c.url.startsWith('http'))
    .map((c) => ({
      url: String(c.url),
      name: String(c.name || 'Subtitles').trim(),
    }));
}

function parseVenomPlayerHtml(
  html: string,
  host: string,
  imdbOrKey: string,
  targetSeason?: number,
  targetEpisode?: number
): ExtractedStreamResult | null {
  if (!html || html.length < 300) return null;
  const mkIdx = html.lastIndexOf('makePlayer(');
  if (mkIdx < 0) return null;
  const block = html.slice(mkIdx);

  if (/blocked:\s*true/i.test(block.slice(0, 600))) {
    return null;
  }

  // Case A: TV Series with `seasons: [...]` JSON array — cache ALL seasons/episodes at once!
  const seasonsKeyIdx = block.indexOf('seasons:');
  if (seasonsKeyIdx >= 0) {
    const arrStart = block.indexOf('[', seasonsKeyIdx);
    const jsonStr = extractBalancedJsonArray(block, arrStart);
    if (jsonStr) {
      try {
        const seasons = JSON.parse(jsonStr);
        if (Array.isArray(seasons) && seasons.length > 0) {
          let picked: ExtractedStreamResult | null = null;
          const wantS = targetSeason || 1;
          const wantE = targetEpisode || 1;

          for (const sObj of seasons) {
            const sNum = Number(sObj?.season);
            if (!Number.isFinite(sNum) || sObj?.blocked) continue;
            const eps = Array.isArray(sObj?.episodes) ? sObj.episodes : [];
            for (const ep of eps) {
              if (!ep || ep.blocked || typeof ep.hls !== 'string' || !ep.hls.startsWith('http')) {
                continue;
              }
              const eNum = Number(ep.episode);
              const { audioTracks, preferredAudioIndex } = mapAudioTracks(ep.audio?.names);
              const subtitles = mapSubtitles(ep.cc);
              const item: ExtractedStreamResult = {
                hlsUrl: ep.hls,
                audioTracks,
                preferredAudioIndex,
                subtitles,
                title: ep.title ? String(ep.title) : undefined,
                sourceHost: host,
              };
              const cacheKey = `${host}:${imdbOrKey}:s${sNum}e${eNum}`;
              streamCache.set(cacheKey, { data: item, at: Date.now() });
              if (sNum === wantS && eNum === wantE) {
                picked = item;
              }
            }
          }

          if (picked) return picked;
          // Fallback to first playable episode in requested season if episode number mismatched
          for (const sObj of seasons) {
            if (Number(sObj?.season) === wantS && Array.isArray(sObj?.episodes)) {
              const firstEp = sObj.episodes.find(
                (ep: any) => ep && !ep.blocked && typeof ep.hls === 'string' && ep.hls.startsWith('http')
              );
              if (firstEp) {
                const { audioTracks, preferredAudioIndex } = mapAudioTracks(firstEp.audio?.names);
                return {
                  hlsUrl: firstEp.hls,
                  audioTracks,
                  preferredAudioIndex,
                  subtitles: mapSubtitles(firstEp.cc),
                  title: firstEp.title ? String(firstEp.title) : undefined,
                  sourceHost: host,
                };
              }
            }
          }
        }
      } catch {
        // Fall through to single-source extraction
      }
    }
  }

  // Case B: Movie with `source: { hls: "...", audio: {...}, cc: [...] }`
  const hlsMatch = block.match(/hls:\s*"([^"]+\.m3u8[^"]*)"/);
  if (!hlsMatch || !hlsMatch[1] || !hlsMatch[1].startsWith('http')) {
    return null;
  }

  let audioNames: unknown = undefined;
  const audioIdx = block.indexOf('audio:');
  if (audioIdx >= 0) {
    const objStart = block.indexOf('{', audioIdx);
    const objStr = extractBalancedJsonObject(block, objStart);
    if (objStr) {
      try {
        audioNames = JSON.parse(objStr)?.names;
      } catch {
        // ignore
      }
    }
  }

  let subtitles: ExtractedSubtitle[] = [];
  const ccIdx = block.indexOf('cc:');
  if (ccIdx >= 0) {
    const arrStart = block.indexOf('[', ccIdx);
    const arrStr = extractBalancedJsonArray(block, arrStart);
    if (arrStr) {
      try {
        subtitles = mapSubtitles(JSON.parse(arrStr));
      } catch {
        // ignore
      }
    }
  }

  const titleMatch = block.match(/title:\s*"([^"]+)"/);
  const { audioTracks, preferredAudioIndex } = mapAudioTracks(audioNames);
  const res: ExtractedStreamResult = {
    hlsUrl: hlsMatch[1],
    audioTracks,
    preferredAudioIndex,
    subtitles,
    title: titleMatch?.[1],
    sourceHost: host,
  };

  const cacheKey = `${host}:${imdbOrKey}:s${targetSeason || 1}e${targetEpisode || 1}`;
  streamCache.set(cacheKey, { data: res, at: Date.now() });
  return res;
}

export function isRezkaDirectMirrorUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url, 'https://localhost').hostname.toLowerCase();
    return REZKA_MIRROR_HOSTS.includes(host);
  } catch {
    return false;
  }
}

export function getCachedExtractedStream(
  embedUrl: string,
  season = 1,
  episode = 1
): ExtractedStreamResult | null {
  try {
    const u = new URL(embedUrl, 'https://localhost');
    const host = u.hostname.toLowerCase();
    const imdbMatch = u.pathname.match(/\/embed\/imdb\/(tt\d+)/i);
    const keyPart = imdbMatch ? imdbMatch[1] : u.pathname;
    const cacheKey = `${host}:${keyPart}:s${season}e${episode}`;
    const hit = streamCache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Extracts direct master.m3u8 + audio tracks + VTT subtitles from HDRezka VenomPlayer mirrors
 * (`api.embess.ws`, `api.namy.ws`, `api.kinogram.best`, `api.delivembd.ws`).
 * Bypasses heavy iframe JS player, WebRTC P2P trackers, and VAST ads.
 */
export async function extractDirectStreamFromEmbedUrl(
  embedUrl: string,
  season = 1,
  episode = 1,
  timeoutMs = 2400
): Promise<ExtractedStreamResult | null> {
  if (!embedUrl || !embedUrl.startsWith('http')) return null;

  let host = '';
  let keyPart = '';
  try {
    const u = new URL(embedUrl);
    host = u.hostname.toLowerCase();
    if (!REZKA_MIRROR_HOSTS.includes(host)) return null;
    const imdbMatch = u.pathname.match(/\/embed\/imdb\/(tt\d+)/i);
    keyPart = imdbMatch ? imdbMatch[1] : u.pathname;
  } catch {
    return null;
  }

  const cacheKey = `${host}:${keyPart}:s${season}e${episode}`;
  const cached = streamCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data;
  }

  const pending = inflightRequests.get(cacheKey);
  if (pending) return pending;

  const task = (async () => {
    const res = await fetchHtmlOrJson(embedUrl, timeoutMs);
    if (res.status < 200 || res.status >= 400 || !res.text) return null;
    return parseVenomPlayerHtml(res.text, host, keyPart, season, episode);
  })();

  inflightRequests.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inflightRequests.delete(cacheKey);
  }
}

function raceFirstNonNull<T>(tasks: Array<Promise<T | null>>): Promise<T | null> {
  return new Promise((resolve) => {
    if (tasks.length === 0) {
      resolve(null);
      return;
    }
    let settled = false;
    let remaining = tasks.length;
    tasks.forEach((p) => {
      p.then((val) => {
        if (!settled && val) {
          settled = true;
          resolve(val);
          return;
        }
        remaining--;
        if (!settled && remaining <= 0) resolve(null);
      }).catch(() => {
        remaining--;
        if (!settled && remaining <= 0) resolve(null);
      });
    });
  });
}

/**
 * Extracts direct .m3u8 from any available HDRezka mirror by IMDb ID.
 * Tries primary mirror first, then races backups if primary fails.
 */
export async function extractDirectStreamByImdb(
  imdbId: string,
  season = 1,
  episode = 1,
  isSeries = false
): Promise<ExtractedStreamResult | null> {
  if (!imdbId || !imdbId.startsWith('tt')) return null;

  for (const host of REZKA_MIRROR_HOSTS) {
    const cached = streamCache.get(`${host}:${imdbId}:s${season}e${episode}`);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.data;
  }

  const buildUrl = (host: string) =>
    isSeries
      ? `https://${host}/embed/imdb/${imdbId}?season=${season}&episode=${episode}`
      : `https://${host}/embed/imdb/${imdbId}`;

  // Try #1 embess.ws first (fastest primary mirror)
  const primary = await extractDirectStreamFromEmbedUrl(
    buildUrl(REZKA_MIRROR_HOSTS[0]),
    season,
    episode,
    2200
  );
  if (primary) return primary;

  // Otherwise race remaining 3 mirrors and take the first valid stream
  return raceFirstNonNull(
    REZKA_MIRROR_HOSTS.slice(1).map((h) =>
      extractDirectStreamFromEmbedUrl(buildUrl(h), season, episode, 2400)
    )
  );
}

/**
 * Resolves a live StreamFree match to its verified live embed URL and direct `.m3u8` stream
 * using `/api/v1/sources/<key>` + `/get-stream-key/<key>` + `_0x[variant]`.
 * Returns `null` if the stream is NOT live yet (`sources: []`), preventing dead "Starting soon" iframes!
 */
export async function resolveStrmFreeLiveStream(
  streamKey: string
): Promise<{ hlsUrl?: string; embedUrl: string } | null> {
  if (!streamKey) return null;
  const cleanKey = streamKey.replace(/(1080p\d*|720p|540p)$/i, '');

  const cached = strmFreeCache.get(cleanKey);
  if (cached && Date.now() - cached.at < STRMFREE_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const srcRes = await fetchHtmlOrJson(
      `https://strmfree.st/api/v1/sources/${encodeURIComponent(cleanKey)}`,
      2200,
      { Referer: 'https://vinegret.net/' }
    );
    if (srcRes.status !== 200 || !srcRes.text) {
      strmFreeCache.set(cleanKey, { data: null, at: Date.now() });
      return null;
    }

    const parsed = JSON.parse(srcRes.text);
    const list: Array<{ quality?: string; url?: string; live?: boolean }> = Array.isArray(
      parsed?.sources
    )
      ? parsed.sources
      : [];

    const liveSources = list.filter((s) => s && s.live && typeof s.url === 'string' && s.url);
    if (liveSources.length === 0) {
      strmFreeCache.set(cleanKey, { data: null, at: Date.now() });
      return null;
    }

    const best =
      liveSources.find((s) => /1080|FHD/i.test(String(s.quality || s.url))) ||
      liveSources.find((s) => /720|HD/i.test(String(s.quality || s.url))) ||
      liveSources[0];

    const embedUrl = best.url!;
    let hlsUrl: string | undefined;

    // Extract direct .m3u8 URL to bypass JWPlayer, SwarmCloud P2P, and popunder ads
    try {
      const [pageRes, keyRes] = await Promise.all([
        fetchHtmlOrJson(embedUrl, 2300, { Referer: 'https://vinegret.net/' }),
        fetchHtmlOrJson(
          `https://strmfree.st/get-stream-key/${encodeURIComponent(cleanKey)}`,
          2200,
          { Referer: 'https://vinegret.net/' }
        ),
      ]);

      if (keyRes.status === 200 && keyRes.text) {
        const keyJson = JSON.parse(keyRes.text);
        if (keyJson.is_external && typeof keyJson.external_url === 'string') {
          hlsUrl = keyJson.external_url;
        } else if (pageRes.status === 200 && pageRes.text) {
          const oxMatch = pageRes.text.match(/const\s+_0x\s*=\s*(\{[\s\S]*?\});/);
          const variant = embedUrl.split('/').pop()?.split('?')[0] || '';
          if (oxMatch && variant) {
            const ox = JSON.parse(oxMatch[1]);
            const p = ox[variant];
            if (p && p._t && p._e) {
              const serverName = keyJson.server_name || 'origin';
              const prefix =
                serverName === 'externalcdn'
                  ? '/live-externalcdn/'
                  : serverName !== 'origin'
                    ? '/live-cdn/'
                    : '/live/';
              hlsUrl = `https://strmfree.st${prefix}${variant}/index.m3u8?_t=${encodeURIComponent(
                p._t
              )}&_ta=${encodeURIComponent(p._ta || '')}&_e=${encodeURIComponent(
                String(p._e)
              )}&_s=${encodeURIComponent(p._s || '')}&_sa=${encodeURIComponent(p._sa || '')}`;
            }
          }
        }
      }
    } catch {
      // Fallback cleanly to verified live embedUrl
    }

    const result = { hlsUrl, embedUrl };
    strmFreeCache.set(cleanKey, { data: result, at: Date.now() });
    return result;
  } catch {
    return null;
  }
}
