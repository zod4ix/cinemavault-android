import React, { useState, useEffect } from 'react';
import { Play, Info, Heart, Star, Sparkles } from 'lucide-react';
import { MediaItem } from '../types/movie';
import { useLanguage } from '../i18n/LanguageContext';
import { useOverview } from '../i18n/useOverview';
import { createPosterFallback } from '../services/tmdb';

interface HeroBannerProps {
  media: MediaItem;
  onPlay: (media: MediaItem) => void;
  onOpenDetails: (media: MediaItem) => void;
  isFavorite: boolean;
  onToggleFavorite: (media: MediaItem) => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  media,
  onPlay,
  onOpenDetails,
  isFavorite,
  onToggleFavorite,
}) => {
  const { t, tg, title } = useLanguage();
  const overview = useOverview(media);
  const [bgSrc, setBgSrc] = useState<string>(
    media.backdropPath || media.posterPath || createPosterFallback(media.title, media.year, media.rating)
  );

  useEffect(() => {
    setBgSrc(
      media.backdropPath || media.posterPath || createPosterFallback(media.title, media.year, media.rating)
    );
  }, [media]);

  const displayTitle = title(media);
  const localizedGenres = media.genres && media.genres.length > 0
    ? media.genres.map(tg).join(' • ')
    : t('genreFilm');

  return (
    <div className="relative w-full h-[46vh] sm:h-[58vh] lg:h-[70vh] min-h-[340px] max-h-[680px] overflow-hidden select-none">
      {/* Background Image with Cinematic Vignette */}
      <img
        src={bgSrc}
        alt={displayTitle}
        onError={() => setBgSrc(createPosterFallback(media.title, media.year, media.rating))}
        className="absolute inset-0 w-full h-full object-cover object-center scale-105 transform filter brightness-90 animate-pulse-slow"
      />

      {/* Multiple cinematic gradients */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#07090e] via-[#07090e]/65 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#07090e] via-[#07090e]/70 to-transparent w-full lg:w-3/4" />

      {/* Hero Content */}
      <div className="relative h-full max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 flex flex-col justify-end pb-9 sm:pb-14 z-10">
        <div className="max-w-2xl space-y-2.5 sm:space-y-4">
          {/* Badges */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-[11px] font-extrabold bg-red-600 text-white uppercase tracking-wider flex items-center gap-1 shadow-md shadow-red-600/30">
              <Sparkles className="w-3 h-3" /> {t('topRelease')}
            </span>

            {media.quality && (
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                {media.quality}
              </span>
            )}

            {media.hasUkrainianAudio && (
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md text-[10px] sm:text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                🇺🇦 {t('voiced')}
              </span>
            )}

            <div className="flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md bg-black/50 border border-white/10 text-amber-400 text-[11px] sm:text-xs font-bold">
              <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 fill-amber-400" />
              <span>{media.rating.toFixed(1)}</span>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight drop-shadow-xl leading-tight line-clamp-2">
            {displayTitle}
          </h1>

          {/* Subtitle / Genres */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] sm:text-sm text-slate-300 font-medium">
            <span>{media.year}</span>
            <span>•</span>
            <span className="truncate max-w-[230px] sm:max-w-none">{localizedGenres}</span>
            {media.duration && (
              <>
                <span>•</span>
                <span>{media.duration} {t('min')}</span>
              </>
            )}
          </div>

          {/* Overview */}
          <p className="text-xs sm:text-sm text-slate-300 line-clamp-2 sm:line-clamp-3 leading-relaxed max-w-xl drop-shadow">
            {overview}
          </p>

          {/* Action Buttons — Responsive & Wrap-Safe on 360px Phones */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-1">
            <button
              onClick={() => onPlay(media)}
              className="px-5 sm:px-7 py-2.5 sm:py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-xl shadow-red-600/35 transition-all"
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white" />
              <span>{t('watchNow')}</span>
            </button>

            <button
              onClick={() => onOpenDetails(media)}
              className="px-4 sm:px-5 py-2.5 sm:py-3.5 rounded-2xl bg-white/15 hover:bg-white/25 active:scale-95 text-white font-bold text-xs sm:text-sm flex items-center gap-2 backdrop-blur-md border border-white/20 transition-all"
            >
              <Info className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>{t('detailsAndEpisodes')}</span>
            </button>

            <button
              onClick={() => onToggleFavorite(media)}
              className={`p-2.5 sm:p-3.5 rounded-2xl border backdrop-blur-md transition-all ${
                isFavorite
                  ? 'bg-red-600 text-white border-red-500 shadow-lg shadow-red-600/30'
                  : 'bg-black/60 text-slate-200 hover:text-white border-white/20'
              }`}
              title={t('inFavorites')}
            >
              <Heart className={`w-4 h-4 sm:w-5 sm:h-5 ${isFavorite ? 'fill-white' : ''}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
