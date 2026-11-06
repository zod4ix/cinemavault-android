import React from 'react';
import { Play } from 'lucide-react';
import { PlaybackProgress } from '../types/movie';
import { useLanguage } from '../i18n/LanguageContext';

interface WatchHistoryProps {
  history: PlaybackProgress[];
  onPlayItem: (progress: PlaybackProgress) => void;
}

export const WatchHistory: React.FC<WatchHistoryProps> = ({ history, onPlayItem }) => {
  const { t } = useLanguage();
  if (!history || history.length === 0) return null;

  return (
    <div className="space-y-3.5 my-6 px-4 sm:px-6 lg:px-8">
      <div className="flex items-center gap-2">
        <h2 className="text-lg sm:text-2xl font-bold text-white tracking-tight">{t('continueWatching')}</h2>
        <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
          {t('savedPosition')}
        </span>
      </div>

      <div className="flex items-start gap-3 sm:gap-4 overflow-x-auto scrollbar-none pb-2">
        {history.map((item) => {
          const percent = Math.min(100, Math.round((item.currentTime / item.duration) * 100));
          return (
            <div
              key={`${item.mediaId}-${item.episodeId || ''}`}
              tabIndex={0}
              role="button"
              aria-label={`Продовжити перегляд: ${item.title}`}
              onClick={() => onPlayItem(item)}
              onFocus={(e) => {
                e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onPlayItem(item);
                }
              }}
              className="group relative w-[180px] sm:w-[220px] shrink-0 cursor-pointer select-none rounded-xl overflow-hidden bg-slate-900 border border-white/10 hover:border-white/30 tv-card-focus focus:outline-none transition-all"
            >
              {/* Poster Backdrop */}
              <div className="relative aspect-video w-full overflow-hidden bg-slate-800">
                <img
                  src={item.posterPath}
                  alt={item.title}
                  className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-300 filter brightness-90"
                />
                
                {/* Play Button Overlay */}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity">
                  <div className="p-3 rounded-full bg-red-600 text-white shadow-lg shadow-red-600/40 group-hover:scale-110 transition-transform">
                    <Play className="w-4 h-4 fill-white ml-0.5" />
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60">
                  <div
                    className="h-full bg-red-600 transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>

              {/* Title & info */}
              <div className="p-2.5">
                <h4 className="text-xs sm:text-sm font-semibold text-white truncate group-hover:text-red-400 transition-colors">
                  {item.title}
                </h4>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-0.5">
                  <span>{item.episodeNumber ? `С${item.seasonNumber}:Е${item.episodeNumber}` : t('movie')}</span>
                  <span>{percent}% {t('watched')}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
