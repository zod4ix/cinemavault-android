import { MediaItem } from '../types/movie';
import { tmdbService, CURATED_CATALOG, createPosterFallback } from './tmdb';
import { getCinemetaMetaAny } from './cinemeta';
import { searchEverywhere } from './search';
import { VINEGRET_PORTAL_URL } from './updater';

export interface DeepLinkPayload {
  id: string;
  imdb?: string;
  tmdb?: number;
  type?: 'movie' | 'tv' | 'anime' | 'cartoon';
  title?: string;
  year?: number;
  poster?: string;
  rating?: number;
  overview?: string;
  syncToken?: string;
}

/**
 * Generates a stable, universal shareable URL on vinegret.net with full movie/series metadata
 * and a stable identifier (IMDb ID / TMDB ID / Catalog ID).
 * - When opened on Android with CinemaVault PRO installed: Android App Links opens the app directly to the movie!
 * - When opened on Windows/macOS or Android without the app: opens the Vinegret.Net portal page with an interactive
 *   movie card, poster, description, "Open in CinemaVault PRO" button (cinemavault://open), and auto-detected OS installer!
 */
export function buildShareMovieUrl(media: MediaItem): string {
  const stableId = media.imdbId || (media.tmdbId ? `tmdb-${media.tmdbId}` : String(media.id));
  const params = new URLSearchParams();
  params.set('cv_movie', stableId);
  if (media.imdbId) params.set('imdb', media.imdbId);
  if (media.tmdbId) params.set('tmdb', String(media.tmdbId));
  params.set('id', String(media.id));
  params.set('type', media.mediaType || 'movie');
  params.set('title', media.title || media.originalTitle || 'CinemaVault Movie');
  if (media.year) params.set('year', String(media.year));
  if (media.rating) params.set('rating', String(media.rating));
  if (media.posterPath && media.posterPath.startsWith('http')) {
    params.set('poster', media.posterPath);
  }
  if (media.overview) {
    params.set('desc', media.overview.slice(0, 220));
  }

  return `${VINEGRET_PORTAL_URL}?${params.toString()}`;
}

export function buildCustomSchemeUrl(media: MediaItem): string {
  const stableId = media.imdbId || (media.tmdbId ? `tmdb-${media.tmdbId}` : String(media.id));
  const params = new URLSearchParams();
  params.set('cv_movie', stableId);
  if (media.imdbId) params.set('imdb', media.imdbId);
  if (media.tmdbId) params.set('tmdb', String(media.tmdbId));
  params.set('id', String(media.id));
  params.set('type', media.mediaType || 'movie');
  params.set('title', media.title || media.originalTitle || 'CinemaVault');
  if (media.year) params.set('year', String(media.year));
  if (media.posterPath && media.posterPath.startsWith('http')) {
    params.set('poster', media.posterPath);
  }
  return `cinemavault://open?${params.toString()}`;
}

export function getMovieQuickCode(media: MediaItem): string {
  if (media.imdbId && media.imdbId.startsWith('tt')) {
    return media.imdbId;
  }
  return `CV-${String(media.id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 10).toUpperCase()}`;
}

export function buildShareFullText(media: MediaItem): string {
  const shareUrl = buildShareMovieUrl(media);
  const title = media.title || media.originalTitle || 'Фільм';
  const yearStr = media.year ? ` (${media.year})` : '';
  const quickCode = getMovieQuickCode(media);

  return `🎬 Дивись «${title}»${yearStr} онлайн у 4K HDR та з українським дубляжем:

▶️ Відкрити фільм у додатку:
${shareUrl}

🔑 Швидкий код фільму для пошуку в додатку: ${quickCode}

⬇️ Ще немає додатку? Завантажити в один клік:
📱 Android (.apk): https://github.com/zod4ix/cinemavault-android/releases/download/v3.7.6/CinemaVault-PRO-v3.7.6.apk
💻 Windows (.exe): https://github.com/zod4ix/cinemavault-android/releases/download/v3.7.6/CinemaVault-PRO-v3.7.6-Windows.exe`;
}

export interface SocialShareLink {
  id: string;
  name: string;
  iconName: string;
  color: string;
  bgClass: string;
  url: string;
  webFallbackUrl?: string;
}

export function getSocialShareLinks(media: MediaItem): {
  shareUrl: string;
  fullText: string;
  title: string;
  movieCode: string;
  links: SocialShareLink[];
  qrCodeUrl: string;
} {
  const shareUrl = buildShareMovieUrl(media);
  const title = media.title || media.originalTitle || 'Фільм';
  const yearStr = media.year ? ` (${media.year})` : '';
  const fullText = buildShareFullText(media);
  const movieCode = getMovieQuickCode(media);
  const subject = `🎬 Фільм «${title}»${yearStr} у CinemaVault PRO`;
  const promoCaption = `🎬 Дивись «${title}»${yearStr} у 4K HDR (код: ${movieCode})`;
  const viberText = `${promoCaption}\n${shareUrl}`;

  const links: SocialShareLink[] = [
    {
      id: 'telegram',
      name: 'Telegram',
      iconName: 'telegram',
      color: '#229ED9',
      bgClass: 'hover:bg-[#229ED9]/20 hover:border-[#229ED9]/60',
      url: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(promoCaption)}`
    },
    {
      id: 'viber',
      name: 'Viber',
      iconName: 'viber',
      color: '#7360F2',
      bgClass: 'hover:bg-[#7360F2]/20 hover:border-[#7360F2]/60',
      url: `viber://forward?text=${encodeURIComponent(viberText)}`,
      webFallbackUrl: `https://3papi.viber.com/forward?text=${encodeURIComponent(viberText)}`
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      iconName: 'whatsapp',
      color: '#25D366',
      bgClass: 'hover:bg-[#25D366]/20 hover:border-[#25D366]/60',
      url: `https://api.whatsapp.com/send?text=${encodeURIComponent(viberText)}`
    },
    {
      id: 'email',
      name: 'Email / Пошта',
      iconName: 'email',
      color: '#EA4335',
      bgClass: 'hover:bg-[#EA4335]/20 hover:border-[#EA4335]/60',
      url: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(fullText)}`
    },
    {
      id: 'facebook',
      name: 'Facebook',
      iconName: 'facebook',
      color: '#1877F2',
      bgClass: 'hover:bg-[#1877F2]/20 hover:border-[#1877F2]/60',
      url: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`
    },
    {
      id: 'twitter',
      name: 'X (Twitter)',
      iconName: 'twitter',
      color: '#38bdf8',
      bgClass: 'hover:bg-slate-700/60 hover:border-slate-500',
      url: `https://twitter.com/intent/tweet?text=${encodeURIComponent(promoCaption)}&url=${encodeURIComponent(shareUrl)}`
    }
  ];

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(shareUrl)}&bgcolor=090d16&color=ffffff&margin=1`;

  return { shareUrl, fullText, title, movieCode, links, qrCodeUrl };
}

export async function shareMediaItem(
  media: MediaItem
): Promise<'shared' | 'copied' | 'failed'> {
  const title = media.title || media.originalTitle || 'Фільм';
  const yearStr = media.year ? ` (${media.year})` : '';
  const shareTitle = `${title}${yearStr} — Дивитися у CinemaVault PRO 4K`;
  const shareText = buildShareFullText(media);

  try {
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      !(window as any).AndroidCinemaBridge?.isDesktop
    ) {
      await navigator.share({
        title: shareTitle,
        text: shareText,
      });
      return 'shared';
    }
  } catch (err: any) {
    if (err && err.name === 'AbortError') {
      return 'shared';
    }
    // Fallback to clipboard below
  }

  try {
    await navigator.clipboard.writeText(shareText);
    return 'copied';
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = shareText;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
}

/**
 * Parses a deep link URL (either https://vinegret.net/...?cv_movie=... or cinemavault://open?cv_movie=...
 * or cinemavault://sync?token=CV-XXXXXX) into a structured DeepLinkPayload.
 */
export function parseDeepLinkUrl(rawUrl: string): DeepLinkPayload | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  try {
    let queryStr = '';
    const qIdx = rawUrl.indexOf('?');
    if (qIdx !== -1) {
      queryStr = rawUrl.slice(qIdx + 1).split('#')[0];
    } else if (rawUrl.includes('cv_movie=') || rawUrl.includes('token=')) {
      queryStr = rawUrl;
    }
    if (!queryStr) return null;

    const params = new URLSearchParams(queryStr);
    const syncToken = params.get('cv_sync') || params.get('token') || undefined;
    const cvMovie = params.get('cv_movie') || params.get('id') || params.get('imdb') || '';

    if (!cvMovie && !syncToken) return null;

    const imdb =
      params.get('imdb') || (cvMovie.startsWith('tt') ? cvMovie : undefined);
    const tmdbRaw =
      params.get('tmdb') ||
      (cvMovie.startsWith('tmdb-') ? cvMovie.replace('tmdb-', '') : undefined);
    const tmdb = tmdbRaw ? parseInt(tmdbRaw, 10) || undefined : undefined;
    const typeRaw = params.get('type') as any;
    const type: DeepLinkPayload['type'] =
      typeRaw === 'tv' || typeRaw === 'anime' || typeRaw === 'cartoon' ? typeRaw : 'movie';

    return {
      id: params.get('id') || cvMovie || imdb || String(tmdb || ''),
      imdb,
      tmdb,
      type,
      title: params.get('title') || undefined,
      year: params.get('year') ? parseInt(params.get('year')!, 10) || undefined : undefined,
      poster: params.get('poster') || undefined,
      rating: params.get('rating') ? parseFloat(params.get('rating')!) || undefined : undefined,
      overview: params.get('desc') || undefined,
      syncToken,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves a DeepLinkPayload into a full MediaItem ready to open in MediaModal.
 */
export async function resolveDeepLinkMedia(
  payload: DeepLinkPayload,
  catalogPool: MediaItem[] = CURATED_CATALOG
): Promise<MediaItem | null> {
  if (!payload || (!payload.id && !payload.imdb && !payload.tmdb && !payload.title)) {
    return null;
  }

  // 1. Check existing catalog pool by ID, IMDb ID, or TMDB ID
  const pool = catalogPool.length > 0 ? catalogPool : CURATED_CATALOG;
  const directHit = pool.find(
    (item) =>
      (payload.id && String(item.id) === String(payload.id)) ||
      (payload.imdb && item.imdbId === payload.imdb) ||
      (payload.tmdb && item.tmdbId === payload.tmdb)
  );
  if (directHit) return directHit;

  const tmdbCacheHit = payload.id ? tmdbService.getItemById(payload.id) : undefined;
  if (tmdbCacheHit) return tmdbCacheHit;

  // 2. If IMDb ID is known, query Cinemeta for rich metadata
  if (payload.imdb && payload.imdb.startsWith('tt')) {
    try {
      const found = await getCinemetaMetaAny(payload.imdb, payload.type === 'tv');
      if (found?.meta) {
        const m = found.meta;
        const yearNum =
          parseInt(String(m.year || m.releaseInfo || payload.year || 2024), 10) || 2024;
        const ratingNum = parseFloat(String(m.imdbRating || payload.rating || 7.8)) || 7.8;
        const titleStr = payload.title || m.name || 'Фільм CinemaVault';
        return {
          id: payload.id || payload.imdb,
          imdbId: payload.imdb,
          tmdbId: payload.tmdb || (typeof m.moviedb_id === 'number' ? m.moviedb_id : undefined),
          title: titleStr,
          originalTitle: m.name || titleStr,
          overview:
            payload.overview ||
            m.description ||
            `Дивіться «${titleStr}» у високій якості 4K HDR та Full HD 1080p онлайн у додатку CinemaVault PRO.`,
          posterPath:
            payload.poster ||
            m.poster ||
            createPosterFallback(titleStr, yearNum, ratingNum),
          backdropPath:
            m.background ||
            payload.poster ||
            m.poster ||
            createPosterFallback(titleStr, yearNum, ratingNum),
          releaseDate: `${yearNum}-01-01`,
          year: yearNum,
          rating: ratingNum,
          mediaType: found.type === 'series' ? 'tv' : payload.type || 'movie',
          genres: Array.isArray(m.genre) ? m.genre : Array.isArray(m.genres) ? m.genres : ['Кіно'],
          quality: '4K HDR',
          hasUkrainianAudio: true,
          director: Array.isArray(m.director) ? m.director.join(', ') : undefined,
          cast: Array.isArray(m.cast) ? m.cast.slice(0, 6) : undefined,
        };
      }
    } catch {
      // fallback below
    }
  }

  // 3. If title is known, try searching live engines
  if (payload.title) {
    try {
      let bestSearchHit: MediaItem | null = null;
      await searchEverywhere(
        payload.title,
        (partial) => {
          if (!bestSearchHit && partial.length > 0) {
            const exact = partial.find(
              (p) =>
                (payload.imdb && p.imdbId === payload.imdb) ||
                (payload.year && Math.abs(p.year - payload.year) <= 1)
            );
            bestSearchHit = exact || partial[0];
          }
        },
        () => true
      );
      if (bestSearchHit) return bestSearchHit;
    } catch {
      // fallback below
    }
  }

  // 4. Construct immediate fallback MediaItem from URL payload so it ALWAYS opens cleanly!
  if (payload.title || payload.imdb || payload.id) {
    const titleStr = payload.title || `Фільм ${payload.imdb || payload.id}`;
    const yearNum = payload.year || 2024;
    const ratingNum = payload.rating || 8.0;
    const posterUrl =
      payload.poster || createPosterFallback(titleStr, yearNum, ratingNum);

    return {
      id: payload.id || payload.imdb || `shared-${Date.now()}`,
      imdbId: payload.imdb,
      tmdbId: payload.tmdb,
      title: titleStr,
      originalTitle: titleStr,
      overview:
        payload.overview ||
        `Дивіться «${titleStr}» (${yearNum}) онлайн у якості 4K HDR та 1080p з українським дубляжем у CinemaVault PRO.`,
      posterPath: posterUrl,
      backdropPath: posterUrl,
      releaseDate: `${yearNum}-01-01`,
      year: yearNum,
      rating: ratingNum,
      mediaType: payload.type || 'movie',
      genres: ['Кіно', '4K HDR'],
      quality: '4K HDR',
      hasUkrainianAudio: true,
    };
  }

  return null;
}
