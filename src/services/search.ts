import { CatalogFilter, MediaItem } from '../types/movie';
import {
  dynamicItemsCache,
  resolveViaWikidataDeep,
  searchImdbSuggestions,
  searchItunesMovies,
  searchJikanAnime,
  searchTvMazeShows,
  tmdbService,
  transliterateToEnglish,
  transliterateToEnglishVariants,
  transliterateToCyrillicVariants,
  swapKeyboardLayout,
  createPosterFallback,
  httpGetJson,
  normalizeGenre,
} from './tmdb';
import { cinemetaCatalog, cinemetaSearch, GENRE_TO_CINEMETA } from './cinemeta';
import { isRussianOrSoviet } from './contentFilter';

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
    .replace(/ґ/g, 'г')
    .replace(/ё|э/g, 'е')
    .replace(/ї/g, 'і')
    .replace(/\b(ii|part two|частина друга|часть вторая)\b/g, '2')
    .replace(/\b(iii|part three|частина третя|часть третья)\b/g, '3')
    .replace(/[^a-z0-9а-яіїєґ]+/g, '');

const normTokens = (s: string) =>
  (s || '')
    .toLowerCase()
    .replace(/ґ/g, 'г')
    .replace(/ё|э/g, 'е')
    .replace(/ї/g, 'і')
    .replace(/\b(ii|part two|частина друга|часть вторая)\b/g, ' 2 ')
    .replace(/\b(iii|part three|частина третя|часть третья)\b/g, ' 3 ')
    .replace(/[^a-z0-9а-яіїєґ\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

const isFallbackPoster = (p?: string) => !p || p.startsWith('data:image');
const hasCyrillicText = (s?: string) => Boolean(s && /[а-яіїєґё]/i.test(s));

function relevance(item: MediaItem, queries: string[]): number {
  const rawNames = [
    item.title,
    item.originalTitle || '',
    transliterateToEnglish(item.title),
    ...(item.aliases || []),
  ].filter(Boolean);
  const names = rawNames.map(norm).filter(Boolean);
  const nameTokenPool = rawNames.flatMap(normTokens);

  let best = 0;
  for (const q of queries) {
    const nq = norm(q);
    if (!nq) continue;
    for (const n of names) {
      if (n === nq) best = Math.max(best, 110);
      else if (n.startsWith(nq)) best = Math.max(best, 80);
      else if (n.includes(nq)) best = Math.max(best, 55);
      else if (nq.includes(n) && n.length > 3) best = Math.max(best, 30);
    }

    // Multi-word token matching (e.g. "дюна 2", "dune 2", "spider man")
    const qTokens = normTokens(q);
    if (qTokens.length > 1) {
      const matchedCount = qTokens.filter((qt) =>
        nameTokenPool.some((nt) => nt === qt || (qt.length >= 3 && nt.startsWith(qt)))
      ).length;
      if (matchedCount === qTokens.length) {
        best = Math.max(best, 85);
      } else if (matchedCount >= qTokens.length - 1 && qTokens.length >= 2) {
        best = Math.max(best, 40);
      }
    }
  }
  const popularity = Math.min(20, Math.log10((item.voteCount || 10) + 1) * 4);
  const hasPoster = isFallbackPoster(item.posterPath) ? 0 : 8;
  const hasImdb = item.imdbId ? 6 : 0;
  const hasUaTitle = hasCyrillicText(item.title) ? 4 : 0;
  return best + popularity + hasPoster + hasImdb + hasUaTitle + (item.rating || 0) / 5;
}

function cleanItem(item: MediaItem): MediaItem {
  if (item.overview && GENERATED_OVERVIEW.test(item.overview)) {
    return { ...item, overview: '' };
  }
  return item;
}

/**
 * Live global search supporting both Cyrillic (UA/RU) and Latin (EN / translit / layout swap) queries.
 * Engines run in parallel with individual timeouts and every engine that answers is merged
 * and pushed to `onPartial` immediately.
 */
export async function searchEverywhere(
  query: string,
  onPartial: (items: MediaItem[]) => void,
  isCurrent: () => boolean
): Promise<MediaItem[]> {
  const q = query.trim();
  if (!q) return [];

  const isAscii = !/[^\u0000-\u007f]/.test(q);
  const enVariants = transliterateToEnglishVariants(q);
  const phonetic = enVariants[0] || q;
  const cyrVariants = isAscii ? transliterateToCyrillicVariants(q) : [];
  const swapped = swapKeyboardLayout(q);
  const swappedEn = swapped ? transliterateToEnglish(swapped) : '';

  const queries = Array.from(
    new Set([q, phonetic, ...enVariants, ...cyrVariants, swapped, swappedEn].filter(Boolean))
  );

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
      // Prefer localized Ukrainian/Cyrillic title for display while keeping English originalTitle & combined aliases
      const bestTitle =
        hasCyrillicText(ex.title) ? ex.title : hasCyrillicText(it.title) ? it.title : ex.title || it.title;
      const bestOriginal =
        !hasCyrillicText(ex.originalTitle) && ex.originalTitle
          ? ex.originalTitle
          : !hasCyrillicText(it.originalTitle) && it.originalTitle
            ? it.originalTitle
            : ex.originalTitle || it.originalTitle;
      const combinedAliases = Array.from(
        new Set(
          [
            ex.title,
            it.title,
            ex.originalTitle || '',
            it.originalTitle || '',
            ...(ex.aliases || []),
            ...(it.aliases || []),
          ].filter(Boolean)
        )
      );

      merged.set(key, {
        ...ex,
        title: bestTitle,
        originalTitle: bestOriginal,
        aliases: combinedAliases,
        tmdbId: ex.tmdbId || it.tmdbId,
        overview: ex.overview || it.overview,
        posterPath: isFallbackPoster(ex.posterPath) ? it.posterPath : ex.posterPath,
        backdropPath: isFallbackPoster(ex.backdropPath) ? it.backdropPath : ex.backdropPath,
        trailerYoutubeId: ex.trailerYoutubeId || it.trailerYoutubeId,
        cast: ex.cast && ex.cast.length > 0 ? ex.cast : it.cast,
        director: ex.director || it.director,
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

  // Instant offline matches (curated catalog + everything seen so far across all query variants)
  absorb(tmdbService.search(q));
  for (const variant of [phonetic, ...cyrVariants, swapped]) {
    if (variant && variant !== q) {
      absorb(tmdbService.search(variant));
    }
  }
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

  // Resolve via Wikidata + Wikipedia (for Cyrillic query OR Latin query OR Cyrillic translit variant)
  const wdPrimaryQuery = !isAscii ? q : cyrVariants[0] && phonetic !== q.toLowerCase() ? cyrVariants[0] : q;
  const wikidata = withTimeout(
    resolveViaWikidataDeep(wdPrimaryQuery),
    7000,
    { englishQueries: [], mediaItems: [] as MediaItem[] }
  ).then(async (wd) => {
    if (!isCurrent()) return;
    if (wd.mediaItems.length > 0) {
      absorb(wd.mediaItems);
      emit();
    }
    enQueries = wd.englishQueries.filter((x) => /[a-zA-Z0-9]/.test(x)).slice(0, 4);
    const extra = enQueries.filter((x) => norm(x) !== norm(phonetic) && norm(x) !== norm(q));
    await Promise.all(
      extra.slice(0, 3).flatMap((eq) => [
        run('cm-m2', () => cinemetaSearch(eq, 'movie')),
        run('cm-s2', () => cinemetaSearch(eq, 'series')),
        run('imdb2', () => searchImdbSuggestions(eq)),
        run('tvmaze2', () => searchTvMazeShows(eq)),
      ])
    );
  });

  // Secondary phonetic English variant if different from primary phonetic (e.g. strict UA vs international)
  const altEn = enVariants.find((v) => norm(v) !== norm(phonetic) && /[a-z]/.test(v));

  await Promise.all([
    run('cm-movie', () => cinemetaSearch(phonetic, 'movie')),
    run('cm-series', () => cinemetaSearch(phonetic, 'series')),
    ...(altEn
      ? [
          run('cm-alt-movie', () => cinemetaSearch(altEn, 'movie')),
          run('imdb-alt', () => searchImdbSuggestions(altEn)),
        ]
      : []),
    ...(isAscii
      ? [run('itunes-us', () => searchItunesMovies(phonetic, 'US'))]
      : [
          run('cm-raw-movie', () => cinemetaSearch(q, 'movie')),
          run('itunes-ua', () => searchItunesMovies(q, 'UA')),
        ]),
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

/** Discovery feed for home rows / categories / "load more" — fully live from Cinemeta (+ Jikan for anime + IMDb classics). */
export async function fetchCatalogPage(
  category: CatalogFilter['category'],
  page: number,
  genreUa: string = 'all'
): Promise<MediaItem[]> {
  const genre = genreUa !== 'all' ? GENRE_TO_CINEMETA[genreUa] : undefined;
  const skip = (page - 1) * 50;

  try {
    let rawItems: MediaItem[] = [];
    switch (category) {
      case 'movies':
        rawItems = await cinemetaCatalog('movie', { genre, skip });
        break;
      case 'series':
        rawItems = await cinemetaCatalog('series', { genre, skip });
        break;
      case 'cartoons':
        rawItems = await cinemetaCatalog('movie', { genre: 'Animation', skip });
        break;
      case 'anime': {
        const jikan = await withTimeout(fetchJikanTop(page), 8000, [] as MediaItem[]);
        if (jikan.length > 0) rawItems = jikan;
        else rawItems = await cinemetaCatalog('series', { genre: 'Animation', skip });
        break;
      }
      case 'classic': {
        const classicTerms = [
          'the godfather',
          'back to the future',
          'lord of the rings',
          'matrix',
          'gladiator',
          'lion king',
          'jurassic park',
          'terminator',
          'indiana jones',
          'pirates of the caribbean',
          'toy story',
          'spirited away',
        ];
        const term = classicTerms[(page - 1) % classicTerms.length];
        const [cm, imdbClassics] = await Promise.all([
          cinemetaCatalog('movie', { genre, skip: page * 50 }),
          searchImdbSuggestions(term),
        ]);
        rawItems = [...cm.filter((i) => i.year < 2012), ...imdbClassics];
        break;
      }
      case '4k':
        rawItems = (await cinemetaCatalog('movie', { genre, skip })).filter((i) => i.year >= 2018);
        break;
      case 'ukrainian': {
        const uaTerms = ['ukrainian', 'dovbush', 'mavka', 'cyborgs', 'pamfir', 'zakhar berkut'];
        const term = uaTerms[(page - 1) % uaTerms.length];
        rawItems = await searchImdbSuggestions(term);
        break;
      }
      case 'trending':
      default: {
        const [m, s, a] = await Promise.all([
          cinemetaCatalog('movie', { genre, skip }),
          cinemetaCatalog('series', { genre, skip }),
          page <= 5 ? withTimeout(fetchJikanTop(page), 6000, [] as MediaItem[]) : Promise.resolve([]),
        ]);
        const out: MediaItem[] = [];
        const len = Math.max(m.length, s.length, a.length);
        for (let i = 0; i < len; i++) {
          if (m[i]) out.push(m[i]);
          if (s[i]) out.push(s[i]);
          if (a[i]) out.push(a[i]);
        }
        rawItems = out;
        break;
      }
    }

    if (rawItems.length === 0) {
      rawItems = await tmdbService.fetchLiveDiscoverPage(
        category === 'series' ? 'tv' : category === 'cartoons' ? 'cartoons' : 'movie',
        page
      );
    }

    // Filter out Russian/Soviet films from home/discovery feeds (only accessible via explicit search)
    return rawItems.filter((item) => !isRussianOrSoviet(item));
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
