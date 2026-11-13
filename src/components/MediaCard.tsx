import React, { useState, useEffect } from 'react';
import { Heart, Play } from 'lucide-react';
import { MediaItem } from '../types/movie';
import { createPosterFallback } from '../services/tmdb';
import { formatRating } from '../services/rating';
import { userRatingService } from '../services/userRatingService';
import { useLanguage } from '../i18n/LanguageContext';

interface MediaCardProps {
  media: MediaItem;
  onClick: (media: MediaItem) => void;
  onPlay: (media: MediaItem) => void;
  isFavorite: boolean;
  onToggleFavorite: (media: MediaItem) => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  media,
  onClick,
  onPlay,
  isFavorite,
  onToggleFavorite,
}) => {
  const { t, tg, title } = useLanguage();
  const [imgSrc, setImgSrc] = useState<string>(
    media.posterPath || createPosterFallback(media.title, media.year, media.rating)
  );

  useEffect(() => {
    setImgSrc(media.posterPath || createPosterFallback(media.title, media.year, media.rating));
  }, [media.posterPath, media.title, media.year, media.rating]);

  const displayTitle = title(media);
  const primaryGenre = media.genres && media.genres.length > 0 ? tg(media.genres[0]) : t('genreFilm');
  const communityStats = userRatingService.getRatingStats(media);

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`${displayTitle} (${media.year})`}
      className="group relative flex flex-col cursor-pointer select-none tv-card-focus rounded-2xl focus:outline-none transition-all duration-300 w-full min-w-0"
      onClick={() => onClick(media)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(media);
        }
      }}
    >
      {/* Poster Image Container */}
      <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden bg-slate-900 border border-white/10 shadow-lg group-hover:shadow-2xl group-hover:shadow-red-600/20 group-hover:border-red-500/50 group-focus-visible:border-red-500 transition-all duration-300">
        <img
          src={imgSrc}
          alt={displayTitle}
          loading="lazy"
          decoding="async"
          onError={() => setImgSrc(createPosterFallback(media.title, media.year, media.rating))}
          className="w-full h-full object-cover object-center group-hover:scale-105 group-focus-visible:scale-105 transition-transform duration-500"
        />

        {/* Subtle bottom gradient for readability */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/85 via-black/35 to-transparent pointer-events-none" />

        {/* Top Badges */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
          <div className="flex items-center gap-1">
            {media.quality && (
              <span className="px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-black bg-black/80 backdrop-blur-md text-amber-300 border border-amber-500/30 shadow">
                {media.quality}
              </span>
            )}
            {media.hasUkrainianAudio && (
              <span className="px-1.5 py-0.5 rounded-md text-[9px] sm:text-[10px] font-bold bg-blue-600/85 backdrop-blur-md text-white shadow">
                🇺🇦
              </span>
            )}
          </div>

          <button
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(media);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                e.preventDefault();
                onToggleFavorite(media);
              }
            }}
            className={`p-2 rounded-full backdrop-blur-md transition-all tv-btn-focus focus:outline-none ${
              isFavorite
                ? 'bg-red-600 text-white shadow-md shadow-red-600/40'
                : 'bg-black/60 text-slate-300 hover:text-white active:bg-black/85'
            }`}
            title={t('inFavorites')}
            aria-label={t('inFavorites')}
          >
            <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'fill-white' : ''}`} />
          </button>
        </div>

        {/* Bottom Rating + Tactile Quick Play Button */}
        <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between z-10">
          <div className="flex items-center gap-1 min-w-0">
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/90 backdrop-blur-md border border-white/10 shadow-md shrink-0">
              <span className="px-1 py-0.5 rounded-[3px] text-[8.5px] font-black bg-[#f5c518] text-black leading-none tracking-tight">
                IMDb
              </span>
              <span className="text-amber-400 text-[10.5px] font-extrabold tracking-tight">
                {formatRating(media.rating)}
              </span>
            </div>
            {communityStats.approvalPercent >= 75 && (
              <div
                className="hidden xs:flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/90 backdrop-blur-md border border-emerald-500/30 text-emerald-400 text-[9.5px] font-black shadow-md shrink-0"
                title={`Рейтинг глядачів: ${communityStats.approvalPercent}% (${communityStats.likes.toLocaleString()} лайків)`}
              >
                <span>👍</span>
                <span>{communityStats.approvalPercent}%</span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {media.seasonsCount && (
              <span className="px-1.5 py-0.5 rounded-md bg-white/15 backdrop-blur-md text-white text-[10px] font-bold">
                {media.seasonsCount} {t('seasonsShort')}
              </span>
            )}
            <button
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onPlay(media);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.stopPropagation();
                  e.preventDefault();
                  onPlay(media);
                }
              }}
              className="p-2 rounded-full bg-red-600 hover:bg-red-500 active:scale-90 text-white shadow-lg shadow-red-600/50 transition-transform tv-btn-focus focus:outline-none"
              title={t('watchNowTitle')}
              aria-label={t('watchNowTitle')}
            >
              <Play className="w-3.5 h-3.5 fill-white ml-0.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Meta */}
      <div className="mt-2 space-y-0.5 px-0.5">
        <h3 className="font-bold text-xs sm:text-sm text-slate-100 group-hover:text-red-400 group-focus-visible:text-red-400 transition-colors line-clamp-1">
          {displayTitle}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="font-medium text-slate-300">{media.year}</span>
          <span>•</span>
          <span className="truncate">{primaryGenre}</span>
        </div>
      </div>
    </div>
  );
};
