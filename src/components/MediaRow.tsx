import React, { useRef, useState } from 'react';
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

  // Mouse Drag-to-Scroll support for Air Mouse / USB Mouse
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [draggedDistance, setDraggedDistance] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!rowRef.current) return;
    setIsMouseDown(true);
    setStartX(e.pageX - rowRef.current.offsetLeft);
    setScrollLeft(rowRef.current.scrollLeft);
    setDraggedDistance(0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown || !rowRef.current) return;
    e.preventDefault();
    const x = e.pageX - rowRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    rowRef.current.scrollLeft = scrollLeft - walk;
    setDraggedDistance((prev) => prev + Math.abs(walk));
  };

  const handleMouseUpOrLeave = () => {
    setIsMouseDown(false);
  };

  const scroll = (direction: 'left' | 'right') => {
    if (rowRef.current) {
      const scrollAmount = rowRef.current.clientWidth * 0.75;
      rowRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  // Convert mouse wheel to horizontal scroll for air mouse / physical mouse
  const handleWheel = (e: React.WheelEvent) => {
    if (!rowRef.current) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      rowRef.current.scrollLeft += e.deltaY;
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
            <span className="text-[10px] sm:text-xs px-2.5 py-0.5 rounded-full font-semibold bg-red-600/20 text-red-400 border border-red-600/30">
              {badge}
            </span>
          )}
        </div>

        {/* Scroll Buttons for Desktop / Smart TV / Air Mouse */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('left')}
            tabIndex={0}
            aria-label="Scroll left"
            className="p-2 rounded-xl bg-white/5 hover:bg-red-600 text-slate-300 hover:text-white transition-all tv-btn-focus focus:outline-none"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            onClick={() => scroll('right')}
            tabIndex={0}
            aria-label="Scroll right"
            className="p-2 rounded-xl bg-white/5 hover:bg-red-600 text-slate-300 hover:text-white transition-all tv-btn-focus focus:outline-none"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Row Scroll Container */}
      <div
        ref={rowRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onWheel={handleWheel}
        className={`flex items-start gap-3 sm:gap-4 overflow-x-auto px-4 sm:px-6 lg:px-8 scrollbar-none scroll-smooth pb-3 ${
          isMouseDown ? 'drag-scroll-active cursor-grabbing' : 'cursor-grab'
        }`}
      >
        {items.map((media) => {
          const isFav = favorites.some((f) => f.id.toString() === media.id.toString());
          return (
            <div
              key={media.id}
              className="w-[145px] sm:w-[175px] md:w-[200px] lg:w-[220px] 2xl:w-[240px] shrink-0"
              onClickCapture={(e) => {
                // If user dragged more than 10px with air mouse, prevent triggering card click
                if (draggedDistance > 10) {
                  e.stopPropagation();
                }
              }}
            >
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
