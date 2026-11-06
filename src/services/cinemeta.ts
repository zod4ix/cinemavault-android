import { Episode, MediaItem, MediaType, Season } from '../types/movie';
import { createPosterFallback, dynamicItemsCache, httpGetJson, normalizeGenre } from './tmdb';
import { parseRatingNumber } from './rating';

/**
 * Cinemeta (Stremio's open metadata addon) — free, key-less, CORS-safe catalogue:
 * title search, discovery catalogues, full metadata, real seasons/episodes and the TMDB id
 * that most streaming embeds need.
 */
const BASE = 'https://v3-cinemeta.strem.io';

export type CinemetaType = 'movie' | 'series';

// UA canonical genre -> Cinemeta genre
export const GENRE_TO_CINEMETA: Record<string, string> = {
  Фантастика: 'Sci-Fi',
  Бойовик: 'Action',
  Пригоди: 'Adventure',
  Драма: 'Drama',
  Комедія: 'Comedy',
  Фентезі: 'Fantasy',
  Трилер: 'Thriller',
  Кримінал: 'Crime',
  Анімація: 'Animation',
  Сімейний: 'Family',
};

const metaCache = new Map<string, any>();

function parseYear(...vals: any[]): number {
  for (const v of vals) {
    if (v === undefined || v === null) continue;
    const m = String(v).match(/(19|20)\d{2}/);
    if (m) return parseInt(m[0], 10);
  }
  return new Date().getFullYear();
}

export function posterFor(imdb: string): string {
  return `https://images.metahub.space/poster/medium/${imdb}/img`;
}

export function backdropFor(imdb: string): string {
  return `https://images.metahub.space/background/medium/${imdb}/img`;
}

export function metaToItem(meta: any, typeHint: CinemetaType): MediaItem | null {
  const imdb: string | undefined = meta?.imdb_id || (String(meta?.id || '').startsWith('tt') ? meta.id : undefined);
  if (!imdb || !meta?.name) return null;

  const isSeriesType = (meta.type || typeHint) === 'series';
  const genresRaw: string[] = Array.isArray(meta.genre)
    ? meta.genre
    : Array.isArray(meta.genres)
      ? meta.genres
      : [];
  const genres = genresRaw.map(normalizeGenre);
  const isAnimation = genresRaw.some((g) => g.toLowerCase() === 'animation');
  const isJapan = String(meta.country || '').toLowerCase().includes('japan');
  const mediaType: MediaType = isAnimation
    ? isJapan
      ? 'anime'
      : isSeriesType
        ? 'cartoon'
        : 'cartoon'
    : isSeriesType
      ? 'tv'
      : 'movie';

  const year = parseYear(meta.year, meta.releaseInfo, meta.released);
  const rawRating = meta.imdbRating || meta.imdb_rating || meta.rating || meta.vote_average;
  const rating = parseRatingNumber(rawRating, 7.6);
  const runtimeMin = meta.runtime ? parseInt(String(meta.runtime), 10) : undefined;

  const item: MediaItem = {
    id: `imdb-${imdb}`,
    imdbId: imdb,
    title: meta.name,
    originalTitle: meta.name,
    overview: meta.description || '',
    posterPath: posterFor(imdb),
    backdropPath: meta.background || backdropFor(imdb),
    releaseDate: meta.released ? String(meta.released).slice(0, 10) : `${year}-01-01`,
    year,
    rating,
    voteCount: Math.round((meta.popularities?.moviedb || 20) * 120),
    mediaType,
    genres: genres.length > 0 ? genres : [isSeriesType ? 'Серіал' : 'Кіно'],
    duration: Number.isFinite(runtimeMin as number) ? runtimeMin : undefined,
    quality: year >= 2020 ? '4K HDR' : '1080p Ultra',
    hasUkrainianAudio: false,
    seasonsCount: undefined,
    cast: Array.isArray(meta.cast) ? meta.cast.slice(0, 8) : undefined,
    director: Array.isArray(meta.director) && meta.director.length > 0 ? meta.director.join(', ') : undefined,
    country: meta.country || undefined,
    tmdbId: typeof meta.moviedb_id === 'number' ? meta.moviedb_id : undefined,
    trailerYoutubeId: Array.isArray(meta.trailers) && meta.trailers[0]?.source ? meta.trailers[0].source : undefined,
  };
  return item;
}

function register(items: MediaItem[]): MediaItem[] {
  for (const it of items) {
    if (!dynamicItemsCache.has(it.id.toString())) dynamicItemsCache.set(it.id.toString(), it);
  }
  return items;
}

export async function cinemetaSearch(query: string, type: CinemetaType): Promise<MediaItem[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await httpGetJson(`${BASE}/catalog/${type}/top/search=${encodeURIComponent(q)}.json`);
  const metas: any[] = Array.isArray(data?.metas) ? data.metas : [];
  const items = metas
    .map((m) => metaToItem(m, type))
    .filter((x): x is MediaItem => Boolean(x));
  return register(items);
}

export async function cinemetaCatalog(
  type: CinemetaType,
  opts: { genre?: string; skip?: number } = {}
): Promise<MediaItem[]> {
  const extras: string[] = [];
  if (opts.genre) extras.push(`genre=${encodeURIComponent(opts.genre)}`);
  if (opts.skip && opts.skip > 0) extras.push(`skip=${opts.skip}`);
  const path = extras.length > 0 ? `/${extras.join('&')}.json` : '.json';
  const data = await httpGetJson(`${BASE}/catalog/${type}/top${path}`);
  const metas: any[] = Array.isArray(data?.metas) ? data.metas : [];
  return register(
    metas.map((m) => metaToItem(m, type)).filter((x): x is MediaItem => Boolean(x))
  );
}

export async function getCinemetaMeta(imdbId: string, type: CinemetaType): Promise<any | null> {
  const key = `${type}:${imdbId}`;
  if (metaCache.has(key)) return metaCache.get(key);
  const data = await httpGetJson(`${BASE}/meta/${type}/${imdbId}.json`);
  const meta = data?.meta && Object.keys(data.meta).length > 0 ? data.meta : null;
  if (meta) metaCache.set(key, meta);
  return meta;
}

/** Tries the expected type first, then the other one (anime / mini-series are often mislabelled). */
export async function getCinemetaMetaAny(
  imdbId: string,
  preferSeries: boolean
): Promise<{ meta: any; type: CinemetaType } | null> {
  const order: CinemetaType[] = preferSeries ? ['series', 'movie'] : ['movie', 'series'];
  for (const type of order) {
    const meta = await getCinemetaMeta(imdbId, type);
    if (meta) return { meta, type };
  }
  return null;
}

const normTitle = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '');

/** Finds the IMDb id of a title that came from a source without one (TVMaze / Jikan / iTunes). */
export async function findImdbIdByTitle(
  title: string,
  year: number,
  preferSeries: boolean
): Promise<string | undefined> {
  const wanted = normTitle(title);
  if (!wanted) return undefined;
  const order: CinemetaType[] = preferSeries ? ['series', 'movie'] : ['movie', 'series'];
  let best: { imdb: string; score: number } | undefined;
  for (const type of order) {
    const list = await cinemetaSearch(title, type);
    for (const it of list) {
      const t = normTitle(it.originalTitle || it.title);
      let score = 0;
      if (t === wanted) score += 10;
      else if (t.startsWith(wanted) || wanted.startsWith(t)) score += 4;
      else continue;
      const dy = Math.abs((it.year || 0) - year);
      if (dy === 0) score += 5;
      else if (dy <= 1) score += 3;
      else if (dy > 3) score -= 4;
      if (it.imdbId && (!best || score > best.score)) best = { imdb: it.imdbId, score };
    }
    if (best && best.score >= 9) break;
  }
  return best && best.score >= 6 ? best.imdb : undefined;
}

export async function getCinemetaSeasons(imdbId: string): Promise<Season[]> {
  const found = await getCinemetaMeta(imdbId, 'series');
  const videos: any[] = Array.isArray(found?.videos) ? found.videos : [];
  if (videos.length === 0) return [];

  const map = new Map<number, Episode[]>();
  for (const v of videos) {
    const s = Number(v.season ?? 0);
    const e = Number(v.episode ?? v.number ?? 0);
    if (!Number.isFinite(s) || !Number.isFinite(e) || e < 1) continue;
    if (!map.has(s)) map.set(s, []);
    map.get(s)!.push({
      id: v.id || `${imdbId}:${s}:${e}`,
      seasonNumber: s,
      episodeNumber: e,
      title: v.title || v.name || '',
      overview: v.overview || v.description || '',
      stillPath: v.thumbnail || undefined,
      airDate: v.released ? String(v.released).slice(0, 10) : undefined,
    });
  }

  const realSeasons = [...map.keys()].filter((s) => s >= 1).sort((a, b) => a - b);
  const useKeys = realSeasons.length > 0 ? realSeasons : [...map.keys()].sort((a, b) => a - b);
  return useKeys.map((s) => ({
    seasonNumber: s,
    name: `S${s}`,
    episodes: map.get(s)!.sort((a, b) => a.episodeNumber - b.episodeNumber),
  }));
}

/** Merges rich metadata into a card-level item (used by the details sheet). */
export async function enrichItemFromCinemeta(item: MediaItem): Promise<MediaItem> {
  if (!item.imdbId) return item;
  const found = await getCinemetaMetaAny(
    item.imdbId,
    item.mediaType === 'tv' || item.mediaType === 'anime'
  );
  if (!found) return item;
  const fresh = metaToItem(found.meta, found.type);
  if (!fresh) return item;
  return {
    ...item,
    overview: item.overview || fresh.overview,
    cast: item.cast && item.cast.length > 0 ? item.cast : fresh.cast,
    director: item.director || fresh.director,
    duration: item.duration || fresh.duration,
    country: item.country || fresh.country,
    tmdbId: fresh.tmdbId || item.tmdbId,
    trailerYoutubeId: item.trailerYoutubeId || fresh.trailerYoutubeId,
    genres: item.genres.length > 0 && item.genres[0] !== 'Кіно' ? item.genres : fresh.genres,
    rating: (fresh.rating && fresh.rating > 0) ? fresh.rating : (item.rating || 7.6),
    posterPath: item.posterPath || fresh.posterPath || createPosterFallback(item.title, item.year, item.rating),
  };
}
