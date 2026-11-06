import { MediaItem } from '../types/movie';
import { cinemetaCatalog } from './cinemeta';
import { isRussianOrSoviet } from './contentFilter';
import { httpGetJson, normalizeGenre, createPosterFallback, dynamicItemsCache } from './tmdb';

const NOVELTIES_CACHE_KEY = 'cinemavault_novelties_cache_v1';
const CACHE_TTL_MS = 1000 * 60 * 60 * 2; // 2 hours

interface CachePayload {
  timestamp: number;
  items: MediaItem[];
}

/**
 * Automatically fetches verified trending new releases (2024-2026)
 * from Cinemeta and Apple iTunes New Releases RSS feeds.
 */
export async function fetchNovelties(): Promise<MediaItem[]> {
  // 1. Try memory or local storage cache first for instant responsiveness
  try {
    const raw = localStorage.getItem(NOVELTIES_CACHE_KEY);
    if (raw) {
      const payload: CachePayload = JSON.parse(raw);
      if (Date.now() - payload.timestamp < CACHE_TTL_MS && Array.isArray(payload.items) && payload.items.length >= 6) {
        // Register in dynamic cache
        payload.items.forEach((item) => dynamicItemsCache.set(item.id.toString(), item));
        // Refresh in background if older than 30 mins
        if (Date.now() - payload.timestamp > 1000 * 60 * 30) {
          fetchFreshNoveltiesAndCache().catch(() => {});
        }
        return payload.items;
      }
    }
  } catch {
    // Ignore cache error
  }

  return fetchFreshNoveltiesAndCache();
}

async function fetchFreshNoveltiesAndCache(): Promise<MediaItem[]> {
  try {
    const [cmMovies, cmSeries, itunesUa, itunesUs] = await Promise.allSettled([
      cinemetaCatalog('movie', { skip: 0 }),
      cinemetaCatalog('series', { skip: 0 }),
      fetchItunesRss('https://itunes.apple.com/ua/rss/topmovies/limit=30/json'),
      fetchItunesRss('https://itunes.apple.com/us/rss/topmovies/limit=30/json'),
    ]);

    const candidates: MediaItem[] = [];

    if (cmMovies.status === 'fulfilled') candidates.push(...cmMovies.value);
    if (cmSeries.status === 'fulfilled') candidates.push(...cmSeries.value);
    if (itunesUa.status === 'fulfilled') candidates.push(...itunesUa.value);
    if (itunesUs.status === 'fulfilled') candidates.push(...itunesUs.value);

    // Filter by year >= 2024, exclude Russian/Soviet, and deduplicate
    const currentYear = new Date().getFullYear();
    const minNoveltyYear = currentYear - 2; // 2024+

    const seenIds = new Set<string>();
    const seenTitles = new Set<string>();
    const filtered: MediaItem[] = [];

    for (const item of candidates) {
      if (!item || !item.title) continue;
      if (isRussianOrSoviet(item)) continue;
      if ((item.year || 0) < minNoveltyYear) continue;

      const normTitle = (item.originalTitle || item.title).toLowerCase().replace(/[^a-z0-9]/g, '');
      const titleKey = `${normTitle}-${item.year}`;
      const idKey = item.imdbId || item.id.toString();

      if (seenIds.has(idKey) || (normTitle && seenTitles.has(titleKey))) continue;
      seenIds.add(idKey);
      if (normTitle) seenTitles.add(titleKey);

      filtered.push(item);
    }

    // Sort: newest releases first, then higher rating
    filtered.sort((a, b) => {
      const yearDiff = (b.year || 0) - (a.year || 0);
      if (yearDiff !== 0) return yearDiff;
      return (b.rating || 0) - (a.rating || 0);
    });

    const result = filtered.slice(0, 30);

    if (result.length > 0) {
      result.forEach((it) => dynamicItemsCache.set(it.id.toString(), it));
      try {
        localStorage.setItem(
          NOVELTIES_CACHE_KEY,
          JSON.stringify({ timestamp: Date.now(), items: result })
        );
      } catch {
        // Quota exceeded or private browsing
      }
    }

    return result;
  } catch {
    return [];
  }
}

async function fetchItunesRss(url: string): Promise<MediaItem[]> {
  try {
    const data = await httpGetJson(url);
    const entries: any[] = data?.feed?.entry;
    if (!Array.isArray(entries)) return [];

    const items: MediaItem[] = [];

    for (const entry of entries) {
      const title = entry?.['im:name']?.label || entry?.title?.label;
      if (!title) continue;

      const id = `itunes-rss-${entry?.id?.attributes?.['im:id'] || Math.random().toString(36).slice(2)}`;
      const summary = entry?.summary?.label || '';
      const releaseDateRaw = entry?.['im:releaseDate']?.label || '';
      const yearMatch = releaseDateRaw.match(/\d{4}/);
      const year = yearMatch ? parseInt(yearMatch[0], 10) : new Date().getFullYear();

      // Poster from images array (last one is largest)
      const images: any[] = entry?.['im:image'] || [];
      const rawPoster = images[images.length - 1]?.label || '';
      const posterPath = rawPoster
        ? rawPoster.replace(/\/\d+x\d+bb\./, '/600x900bb.').replace(/\/\d+x\d+\./, '/600x900.')
        : createPosterFallback(title, year, 8.0);

      const category = entry?.category?.attributes?.label || 'Фільм';
      const cleanGenre = normalizeGenre(category);

      const item: MediaItem = {
        id,
        title,
        originalTitle: title,
        overview: summary,
        posterPath,
        backdropPath: posterPath,
        releaseDate: releaseDateRaw ? releaseDateRaw.slice(0, 10) : `${year}-01-01`,
        year,
        rating: 8.0,
        voteCount: 2800,
        mediaType: 'movie',
        genres: [cleanGenre, 'Новинки'],
        quality: year >= 2024 ? '4K HDR' : '1080p Ultra',
        hasUkrainianAudio: true,
      };

      items.push(item);
    }

    return items;
  } catch {
    return [];
  }
}
