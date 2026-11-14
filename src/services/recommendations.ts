import { MediaItem } from '../types/movie';
import { CURATED_CATALOG, dynamicItemsCache, tmdbService, searchImdbSuggestions, transliterateToEnglish } from './tmdb';
import { EXTRA_CATALOG } from '../data/extraCatalog';
import { cinemetaCatalog, GENRE_TO_CINEMETA } from './cinemeta';
import { isRussianOrSoviet } from './contentFilter';
import { deduplicateMediaItems, normalizeTitleKey } from './mediaDedupe';

export interface SimilarMediaItem extends MediaItem {
  similarityScore?: number;
  matchReason?: string;
}

// In-memory cache for fast, zero-delay instant switching
const recommendationsCache = new Map<string, SimilarMediaItem[]>();

// Stopwords to ignore when extracting plot keywords
const STOPWORDS = new Set([
  'його', 'вони', 'вона', 'воно', 'після', 'цього', 'цьому', 'через', 'проти', 'разом',
  'перед', 'також', 'може', 'має', 'бути', 'який', 'яка', 'яке', 'якщо', 'коли',
  'того', 'потім', 'свого', 'своєї', 'своїх', 'фільм', 'серіал', 'історія', 'сюжет',
  'життя', 'події', 'новий', 'нова', 'про', 'для', 'але', 'щоб', 'що', 'як', 'де'
]);

function extractPlotKeywords(text?: string): string[] {
  if (!text || text.length < 20) return [];
  const words = text
    .toLowerCase()
    .replace(/[^a-zа-яіїєґ0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return Array.from(new Set(words)).slice(0, 30);
}

function normalizePerson(name?: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-zа-яіїєґ]/gi, '')
    .trim();
}

/**
 * Calculates similarity score and match reason between source media and a candidate media.
 */
export function scoreSimilarity(
  source: MediaItem,
  candidate: MediaItem
): { score: number; reason?: string } {
  // 1. Exclude self by ID or exact normalized title
  if (candidate.id.toString() === source.id.toString()) return { score: -1 };
  if (source.imdbId && candidate.imdbId && source.imdbId === candidate.imdbId) return { score: -1 };
  
  const sTitleNorm = normalizeTitleKey(source.title);
  const cTitleNorm = normalizeTitleKey(candidate.title);
  if (sTitleNorm && sTitleNorm === cTitleNorm) return { score: -1 };

  // Exclude Russian/Soviet media
  if (isRussianOrSoviet(candidate)) return { score: -1 };

  let score = 0;
  let primaryReason: string | undefined = undefined;

  // 2. Media Type match (+18 pts)
  if (candidate.mediaType === source.mediaType) {
    score += 18;
  }

  // 3. Director match (+65 pts - highest affinity)
  if (source.director && candidate.director) {
    const sDir = normalizePerson(source.director);
    const cDir = normalizePerson(candidate.director);
    if (sDir.length >= 4 && cDir.length >= 4 && (sDir.includes(cDir) || cDir.includes(sDir))) {
      score += 65;
      primaryReason = `Режисер: ${candidate.director}`;
    }
  }

  // 4. Franchise / Universe / Title overlap (+48 pts)
  const sWords = source.title
    .toLowerCase()
    .replace(/[^a-zа-яіїєґ0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  const cWords = candidate.title
    .toLowerCase()
    .replace(/[^a-zа-яіїєґ0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));

  const commonWords = sWords.filter((w) => cWords.includes(w));
  if (commonWords.length > 0) {
    score += 48;
    if (!primaryReason) {
      primaryReason = 'Франшиза та спільний сюжет';
    }
  }

  // 5. Cast overlap (+30 pts per overlapping actor, up to 60 pts)
  if (source.cast && source.cast.length > 0 && candidate.cast && candidate.cast.length > 0) {
    const sCastNorm = source.cast.map(normalizePerson).filter((n) => n.length >= 4);
    let matchedActorName: string | undefined;
    let matchCount = 0;

    for (const actor of candidate.cast) {
      const aNorm = normalizePerson(actor);
      if (aNorm.length >= 4 && sCastNorm.some((sc) => sc.includes(aNorm) || aNorm.includes(sc))) {
        matchCount++;
        if (!matchedActorName) matchedActorName = actor;
      }
    }

    if (matchCount > 0) {
      score += Math.min(60, matchCount * 30);
      if (!primaryReason && matchedActorName) {
        primaryReason = `У ролях: ${matchedActorName}`;
      }
    }
  }

  // 6. Genres overlap (+18 pts per matching genre, up to 54 pts)
  if (source.genres && source.genres.length > 0 && candidate.genres && candidate.genres.length > 0) {
    const sGenres = source.genres.map((g) => g.toLowerCase().trim());
    const matchedGenres: string[] = [];

    for (const g of candidate.genres) {
      const gLow = g.toLowerCase().trim();
      if (sGenres.some((sg) => sg === gLow || sg.includes(gLow) || gLow.includes(sg))) {
        matchedGenres.push(g);
      }
    }

    if (matchedGenres.length > 0) {
      score += Math.min(54, matchedGenres.length * 18);
      if (!primaryReason && matchedGenres.length >= 2) {
        primaryReason = `Жанр: ${matchedGenres.slice(0, 2).join(', ')}`;
      }
    }
  }

  // 7. Plot/Overview thematic keyword overlap (+5 pts per keyword, up to 25 pts)
  const sKeywords = extractPlotKeywords(source.overview);
  if (sKeywords.length > 0 && candidate.overview) {
    const cOverviewLow = candidate.overview.toLowerCase();
    let plotMatches = 0;
    for (const kw of sKeywords) {
      if (cOverviewLow.includes(kw)) {
        plotMatches++;
      }
    }
    if (plotMatches > 0) {
      score += Math.min(25, plotMatches * 5);
      if (!primaryReason && plotMatches >= 3) {
        primaryReason = 'Схожий сюжет та атмосфера';
      }
    }
  }

  // Fallback reason if none set yet
  if (!primaryReason && candidate.genres && candidate.genres.length > 0) {
    primaryReason = `Жанр: ${candidate.genres[0]}`;
  }

  // 8. Era proximity (within 3 years: +8 pts, within 6 years: +4 pts)
  if (source.year && candidate.year) {
    const dy = Math.abs(source.year - candidate.year);
    if (dy <= 3) score += 8;
    else if (dy <= 6) score += 4;
  }

  // 9. High quality & Ukrainian audio bonuses
  if (candidate.hasUkrainianAudio) score += 6;
  if (candidate.quality === '4K HDR') score += 4;
  if (candidate.rating && candidate.rating >= 7.5) {
    score += Math.min(8, (candidate.rating - 6.5) * 3);
  }

  return { score, reason: primaryReason };
}

/**
 * Returns a list of highly relevant similar movies/series for a given media item.
 * Runs instant local matching first, then optionally enriches with live API sources.
 */
export async function getSimilarMedia(
  source: MediaItem,
  limit: number = 18
): Promise<SimilarMediaItem[]> {
  if (!source) return [];

  const cacheKey = `${source.id}:${source.imdbId || ''}`;
  if (recommendationsCache.has(cacheKey)) {
    return recommendationsCache.get(cacheKey)!;
  }

  // 1. Gather all candidates from built-in catalogs and dynamic cache
  const localPool: MediaItem[] = [
    ...CURATED_CATALOG,
    ...EXTRA_CATALOG,
    ...Array.from(dynamicItemsCache.values()),
  ];

  const candidateMap = new Map<string, MediaItem>();
  for (const item of localPool) {
    if (!item) continue;
    const key = item.imdbId || item.id.toString();
    if (!candidateMap.has(key)) {
      candidateMap.set(key, item);
    }
  }

  // 2. Compute local scores
  const scoreCandidateList = (items: MediaItem[]): SimilarMediaItem[] => {
    const scored: SimilarMediaItem[] = [];
    for (const cand of items) {
      const { score, reason } = scoreSimilarity(source, cand);
      if (score >= 26) {
        scored.push({
          ...cand,
          similarityScore: score,
          matchReason: reason,
        });
      }
    }
    return scored.sort((a, b) => (b.similarityScore || 0) - (a.similarityScore || 0));
  };

  let results = scoreCandidateList(Array.from(candidateMap.values()));

  // 3. If we want even richer results or have fewer than limit, live-enrich
  try {
    const livePromises: Promise<MediaItem[]>[] = [];

    // Query 1: Director
    if (source.director && source.director.length >= 3) {
      const dirClean = source.director.split(',')[0].trim();
      livePromises.push(
        tmdbService.searchGlobal(dirClean).catch(() => [])
      );
    }

    // Query 2: Lead actor
    if (source.cast && source.cast.length > 0 && source.cast[0].length >= 3) {
      const leadActor = source.cast[0].trim();
      livePromises.push(
        searchImdbSuggestions(transliterateToEnglish(leadActor)).catch(() => [])
      );
    }

    // Query 3: Primary genre from Cinemeta
    if (source.genres && source.genres.length > 0) {
      const primaryG = source.genres[0];
      const cinemetaG = GENRE_TO_CINEMETA[primaryG];
      if (cinemetaG) {
        const typeHint = source.mediaType === 'tv' ? 'series' : 'movie';
        livePromises.push(
          cinemetaCatalog(typeHint, { genre: cinemetaG }).catch(() => [])
        );
      }
    }

    // Race against a strict 2200ms timeout
    const timeoutPromise = new Promise<MediaItem[][]>((resolve) =>
      setTimeout(() => resolve([]), 2200)
    );

    const liveLists = await Promise.race([
      Promise.all(livePromises),
      timeoutPromise,
    ]);

    for (const list of liveLists) {
      if (Array.isArray(list)) {
        for (const it of list) {
          const k = it.imdbId || it.id.toString();
          if (!candidateMap.has(k)) {
            candidateMap.set(k, it);
          }
        }
      }
    }

    // Re-score with live candidates included
    const allUnique = deduplicateMediaItems(Array.from(candidateMap.values()));
    results = scoreCandidateList(allUnique);
  } catch {
    // Graceful fallback to local results
  }

  const finalItems = results.slice(0, limit);
  recommendationsCache.set(cacheKey, finalItems);
  return finalItems;
}
