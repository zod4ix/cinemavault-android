import { CatalogFilter, MediaItem } from '../types/movie';
import {
  dynamicItemsCache,
  resolveViaWikidataDeep,
  searchImdbSuggestions,
  searchJikanAnime,
  searchTvMazeShows,
  tmdbService,
  transliterateToEnglish,
  createPosterFallback,
  httpGetJson,
  normalizeGenre,
} from './tmdb';
import { cinemetaCatalog, cinemetaSearch, GENRE_TO_CINEMETA } from './cinemeta';

const GENERATED_OVERVIEW =
  /^(Серіал|Фільм|Аніме|Повна версія|Офіційний реліз|Популярний серіал|Топ аніме|Серіал «|Мультфільм)/;

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then((v) => {
      clearTimeout(timer);
      resolve(v);
    }).catch(() => {
      clearTimeout(timer);
      resolve(fallback);
    });
  });

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яіїєґё]+/g, '');

const isFallbackPoster = (p?: string) => !p || p.startsWith('data:image');

function relevance(item: MediaItem, queries: string[]): number {
  const names = [item.title, item.originalTitle || '', ...(item.aliases || [])].map(norm).filter(Boolean);
  let best = 0;
  for (const q of queries) {
    const nq = norm(q);
    if (!nq) continue;
    for (const n of names) {
      if (n === nq) best = Math.max(best, 100);
      else if (n.startsWith(nq)) best = Math.max(best, 70);
      else if (n.includes(nq)) best = Math.max(best, 45);
      else if (nq.includes(n) && n.length > 3) best = Math.max(best, 25);
    }
  }
  const popularity = Math.min(20, Math.log10((item.voteCount || 10) + 1) * 4);
  const hasPoster = isFallbackPoster(item.posterPath) ? 0 : 6;
  const hasImdb = item.imdbId ? 5 : 0;
  return best + popularity + hasPoster + hasImdb + (item.rating || 0) / 5;
}

function cleanItem(item: MediaItem): MediaItem {
  if (item.overview && GENERATED_OVERVIEW.test(item.overview)) {
    return { ...item, overview: '' };
  }
  return item;
}

/**
 * Live global search. Engines run in parallel with individual timeouts and every engine that
 * answers is merged and pushed to `onPartial` immediately, so results appear within ~1s even if
 * a slow engine (Jikan / Wikidata) takes several seconds.
 */
export async function searchEverywhere(
  query: string,
  onPartial: (items: MediaItem[]) => void,
  isCurrent: () => boolean
): Promise<MediaItem[]> {
  const q = query.trim();
  if (!q) return [];

  const isAscii = !/[^\u0000-\u007f]/.test(q);
  const phonetic = isAscii ? q : transliterateToEnglish(q);
  const queries = Array.from(new Set([q, phonetic].filter(Boolean)));

  const merged = new Map<string, MediaItem>();
  const keyOf = (i: MediaItem) => i.imdbId || `t:${norm(i.originalTitle || i.title)}-${i.year}`;

  const absorb = (list: MediaItem[]) => {
    for (const raw of list) {
      const it = cleanItem(raw);
      const key = keyOf(it);
      const ex = merged.get(key);
      if (!ex) {
        merged.set(key, it);
        continue;
      }
      // Enrich the existing entry with whatever it is missing
      merged.set(key, {
        ...ex,
        tmdbId: ex.tmdbId || it.tmdbId,
        overview: ex.overview || it.overview,
        posterPath: isFallbackPoster(ex.posterPath) ? it.posterPath : ex.posterPath,
        trailerYoutubeId: ex.trailerYoutubeId || it.trailerYoutubeId,
        cast: ex.cast || it.cast,
      });
    }
  };

  let enQueries: string[] = [];
  const emit = () => {
    if (!isCurrent()) return;
    const all = Array.from(merged.values());
    const scoreQueries = [...queries, ...enQueries];
    all.sort((a, b) => relevance(b, scoreQueries) - relevance(a, scoreQueries));
    onPartial(all);
  };

  // Instant offline matches (curated catalog + everything seen so far)
  absorb(tmdbService.search(q));
  absorb(isAscii ? [] : tmdbService.search(phonetic));
  emit();

  const run = async (label: string, fn: () => Promise<MediaItem[]>, ms = 7000) => {
    const list = await withTimeout(fn(), ms, [] as MediaItem[]);
    if (!isCurrent()) return;
    if (list.length > 0) {
      absorb(list);
      emit();
    }
    void label;
  };

  const wikidata = withTimeout(
    resolveViaWikidataDeep(q),
    7000,
    { englishQueries: [], mediaItems: [] as MediaItem[] }
  ).then(async (wd) => {
    if (!isCurrent()) return;
    if (wd.mediaItems.length > 0) {
      absorb(wd.mediaItems);
      emit();
    }
    enQueries = wd.englishQueries.filter((x) => /[a-zA-Z0-9]/.test(x)).slice(0, 3);
    const extra = enQueries.filter((x) => norm(x) !== norm(phonetic) && norm(x) !== norm(q));
    await Promise.all(
      extra.slice(0, 2).flatMap((eq) => [
        run('cm-m2', () => cinemetaSearch(eq, 'movie')),
        run('cm-s2', () => cinemetaSearch(eq, 'series')),
        run('imdb2', () => searchImdbSuggestions(eq)),
      ])
    );
  });

  await Promise.all([
    run('cm-movie', () => cinemetaSearch(phonetic, 'movie')),
    run('cm-series', () => cinemetaSearch(phonetic, 'series')),
    ...(isAscii ? [] : [run('cm-raw-movie', () => cinemetaSearch(q, 'movie'))]),
    run('imdb', () => searchImdbSuggestions(phonetic)),
    run('tvmaze', () => searchTvMazeShows(phonetic)),
    run('jikan', () => searchJikanAnime(phonetic), 9000),
    wikidata,
  ]);

  const finalList = Array.from(merged.values());
  const scoreQueries = [...queries, ...enQueries];
  finalList.sort((a, b) => relevance(b, scoreQueries) - relevance(a, scoreQueries));
  for (const it of finalList) dynamicItemsCache.set(it.id.toString(), it);
  if (isCurrent()) onPartial(finalList);
  return finalList;
}

/** Discovery feed for home rows / categories / "load more" — fully live from Cinemeta (+ Jikan for anime). */
export async function fetchCatalogPage(
  category: CatalogFilter['category'],
  page: number,
  genreUa: string = 'all'
): Promise<MediaItem[]> {
  const genre = genreUa !== 'all' ? GENRE_TO_CINEMETA[genreUa] : undefined;
  const skip = (page - 1) * 100;

  try {
    switch (category) {
      case 'movies':
        return await cinemetaCatalog('movie', { genre, skip });
      case 'series':
        return await cinemetaCatalog('series', { genre, skip });
      case 'cartoons':
        return await cinemetaCatalog('movie', { genre: 'Animation', skip });
      case 'anime': {
        const jikan = await withTimeout(fetchJikanTop(page), 8000, [] as MediaItem[]);
        if (jikan.length > 0) return jikan;
        return await cinemetaCatalog('series', { genre: 'Animation', skip });
      }
      case '4k':
        return (await cinemetaCatalog('movie', { genre, skip })).filter((i) => i.year >= 2018);
      case 'ukrainian':
        return [];
      case 'trending':
      default: {
        const [m, s] = await Promise.all([
          cinemetaCatalog('movie', { genre, skip }),
          cinemetaCatalog('series', { genre, skip }),
        ]);
        const out: MediaItem[] = [];
        const len = Math.max(m.length, s.length);
        for (let i = 0; i < len; i++) {
          if (m[i]) out.push(m[i]);
          if (s[i]) out.push(s[i]);
        }
        return out;
      }
    }
  } catch {
    return [];
  }
}

async function fetchJikanTop(page: number): Promise<MediaItem[]> {
  const json = await httpGetJson(`https://api.jikan.moe/v4/top/anime?page=${page}&limit=24&sfw=true`);
  if (!Array.isArray(json?.data)) return [];
  return json.data.map((anime: any): MediaItem => {
    const id = `jikan-${anime.mal_id}`;
    const year = anime.year || 2023;
    const rating = anime.score || 8.3;
    const poster =
      anime.images?.jpg?.large_image_url ||
      anime.images?.jpg?.image_url ||
      createPosterFallback(anime.title, year, rating);
    const item: MediaItem = {
      id,
      tmdbId: anime.mal_id,
      title: anime.title_english || anime.title,
      originalTitle: anime.title_english || anime.title,
      overview: anime.synopsis || '',
      posterPath: poster,
      backdropPath: anime.trailer?.images?.maximum_image_url || poster,
      releaseDate: `${year}-01-01`,
      year,
      rating,
      voteCount: anime.scored_by || 4000,
      mediaType: 'anime',
      genres: ['Аніме', ...(anime.genres || []).map((g: any) => normalizeGenre(g.name))].slice(0, 4),
      duration: 24,
      quality: '1080p Ultra',
      hasUkrainianAudio: false,
      seasonsCount: 1,
      episodesCount: anime.episodes || 12,
      trailerYoutubeId: anime.trailer?.youtube_id || undefined,
    };
    dynamicItemsCache.set(id, item);
    return item;
  });
}
