import { MediaItem } from '../types/movie';

/**
 * Normalizes title string for exact and fuzzy duplicate matching
 * e.g. "Інтерстеллар" / "Interstellar (2014)" -> "interstellar"
 */
export function normalizeTitleKey(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/\(\d{4}\)/g, '')
    .replace(/[^a-z0-9а-яіїєґ]/gi, '')
    .trim();
}

/**
 * Computes canonical identity keys for a media item.
 * Returns an array of keys that represent this item's unique identity.
 */
export function getMediaIdentityKeys(item: MediaItem): string[] {
  const keys: string[] = [];

  // 1. IMDb ID (highest fidelity - unique across entire film universe)
  if (item.imdbId && typeof item.imdbId === 'string' && item.imdbId.trim().toLowerCase().startsWith('tt')) {
    keys.push(`imdb:${item.imdbId.trim().toLowerCase()}`);
  }
  if (typeof item.id === 'string' && item.id.trim().toLowerCase().startsWith('tt')) {
    keys.push(`imdb:${item.id.trim().toLowerCase()}`);
  }

  // 2. TMDB ID + mediaType
  if (item.tmdbId && item.tmdbId > 0) {
    keys.push(`tmdb:${item.mediaType || 'movie'}:${item.tmdbId}`);
  }

  // 3. Original title + Year + MediaType
  const origKey = normalizeTitleKey(item.originalTitle || '');
  if (origKey.length >= 3) {
    keys.push(`orig:${item.mediaType || 'movie'}:${origKey}:${item.year || 0}`);
  }

  // 4. Localized title + Year + MediaType
  const titleKey = normalizeTitleKey(item.title || '');
  if (titleKey.length >= 3) {
    keys.push(`title:${item.mediaType || 'movie'}:${titleKey}:${item.year || 0}`);
  }

  // 5. Slug / internal ID fallback
  if (item.id) {
    keys.push(`id:${item.id}`);
  }

  return keys;
}

/**
 * Measures the "richness" of an item's metadata so that when deduplicating,
 * we always preserve the richest localized Ukrainian metadata, 4K badges, trailers and stream sources.
 */
function getItemRichnessScore(item: MediaItem): number {
  let score = 0;
  if (item.hasUkrainianAudio) score += 25;
  if (item.quality === '4K HDR') score += 15;
  if (item.trailerYoutubeId) score += 10;
  if (item.overview && item.overview.length > 50) score += 20;
  if (item.director) score += 5;
  if (item.cast && item.cast.length > 0) score += 5;
  if (item.genres && item.genres.length > 0) score += 5;
  if (item.rating && item.rating > 0) score += 5;
  if (item.voteCount && item.voteCount > 0) score += 5;
  if (item.imdbId) score += 10;
  if (item.tmdbId) score += 10;
  if (item.backdropPath) score += 5;
  return score;
}

/**
 * Deduplicates an array of MediaItems, preserving original sorting order
 * and seamlessly merging properties into the richest version of the item.
 */
export function deduplicateMediaItems(items: MediaItem[]): MediaItem[] {
  if (!items || items.length === 0) return [];

  const seenKeys = new Map<string, number>(); // key -> index in uniqueList
  const uniqueList: MediaItem[] = [];

  for (const item of items) {
    if (!item) continue;
    const keys = getMediaIdentityKeys(item);

    // Check if any key was already seen
    let existingIndex = -1;
    for (const k of keys) {
      if (seenKeys.has(k)) {
        existingIndex = seenKeys.get(k)!;
        break;
      }
    }

    if (existingIndex === -1) {
      // New unique item
      const newIndex = uniqueList.length;
      uniqueList.push(item);
      for (const k of keys) {
        seenKeys.set(k, newIndex);
      }
    } else {
      // Duplicate detected! Merge properties into the richest instance
      const existing = uniqueList[existingIndex];
      const existingScore = getItemRichnessScore(existing);
      const incomingScore = getItemRichnessScore(item);

      const best: MediaItem = incomingScore > existingScore
        ? { ...existing, ...item }
        : { ...item, ...existing };

      // Ensure critical properties from both are retained:
      best.imdbId = existing.imdbId || item.imdbId;
      best.tmdbId = existing.tmdbId || item.tmdbId;
      best.streamUrl = existing.streamUrl || item.streamUrl;
      best.trailerYoutubeId = existing.trailerYoutubeId || item.trailerYoutubeId;
      best.hasUkrainianAudio = existing.hasUkrainianAudio || item.hasUkrainianAudio;
      best.genres = Array.from(new Set([...(existing.genres || []), ...(item.genres || [])]));

      uniqueList[existingIndex] = best;

      // Register all keys for this item to point to existingIndex
      for (const k of keys) {
        seenKeys.set(k, existingIndex);
      }
    }
  }

  return uniqueList;
}
