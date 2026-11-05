import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaItem } from '../types/movie';
import { MediaCard } from './MediaCard';

interface MediaRowProps {
  title: string;
  badge?: string;
  items: MediaItem[];
  onSelectMedia: (media: MediaItem) => void;
  onPlayMedia: (media: MediaItem) => void;
  favorites: MediaItem[];
  onToggleFavorite: (media: MediaItem) => void;
}

export const MediaRow: React.FC<MediaRowProps> = ({
  title,
  badge,
  items,
  onSelectMedia,
  onPlayMedia,
  favorites,
  onToggleFavorite,
}) => {
  const rowRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const scrollAmount = rowRef.current.clientWidth * 0.75;
      rowRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  if (!items.length) return null;

  return (
    <div className="space-y-3.5 my-8 relative group/row">
      {/* Row Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <h2 className="text-lg sm:text-2xl font-bold text-white tracking-tight">{title}</h2>
          {badge && (
            <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full font-semibold bg-red-600/20 text-red-400 border border-red-600/30">
              {badge}
            </span>
          )}
        </div>

        {/* Scroll Buttons for Desktop / Tablet */}
        <div className="hidden sm:flex items-center gap-1.5">
          <button
            onClick={() => scroll('left')}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Row Scroll Container */}
      <div
        ref={rowRef}
        className="flex items-start gap-3 sm:gap-4 overflow-x-auto px-4 sm:px-6 lg:px-8 scrollbar-none scroll-smooth pb-2"
      >
        {items.map((media) => {
          const isFav = favorites.some((f) => f.id.toString() === media.id.toString());
          return (
            <div key={media.id} className="w-[145px] sm:w-[175px] md:w-[200px] shrink-0">
              <MediaCard
                media={media}
                onClick={onSelectMedia}
                onPlay={onPlayMedia}
                isFavorite={isFav}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
};
