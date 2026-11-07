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

  // Mouse Drag-to-Scroll support for Air Mouse / USB Mouse without breaking clicks
  const [isDragging, setIsDragging] = useState(false);
  const isMouseDownRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0, scrollLeft: 0 });
  const hasDraggedRef = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!rowRef.current) return;
    if (e.button !== 0) return;
    isMouseDownRef.current = true;
    hasDraggedRef.current = false;
    startPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: rowRef.current.scrollLeft,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDownRef.current || !rowRef.current) return;
    const deltaX = e.clientX - startPosRef.current.x;
    const deltaY = e.clientY - startPosRef.current.y;

    if (!hasDraggedRef.current && Math.abs(deltaX) > 8 && Math.abs(deltaX) > Math.abs(deltaY)) {
      hasDraggedRef.current = true;
      setIsDragging(true);
    }

    if (hasDraggedRef.current) {
      rowRef.current.scrollLeft = startPosRef.current.scrollLeft - deltaX;
    }
  };

  const handleMouseUpOrLeave = () => {
    if (!isMouseDownRef.current) return;
    isMouseDownRef.current = false;
    if (hasDraggedRef.current) {
      setTimeout(() => {
        hasDraggedRef.current = false;
        setIsDragging(false);
      }, 80);
    } else {
      setIsDragging(false);
    }
  };

  // Scroll by exact full page of whole cards so no half-card ever stops at the edge
  const scroll = (direction: 'left' | 'right') => {
    if (!rowRef.current) return;
    const firstCard = rowRef.current.firstElementChild as HTMLElement | null;
    if (firstCard) {
      const gap = window.innerWidth >= 768 ? 16 : window.innerWidth >= 640 ? 14 : 12;
      const cardStep = firstCard.offsetWidth + gap;
      const visibleCards = Math.max(1, Math.round(rowRef.current.clientWidth / cardStep));
      const scrollAmount = visibleCards * cardStep;
      rowRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    } else {
      const scrollAmount = rowRef.current.clientWidth;
      rowRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (!rowRef.current) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      rowRef.current.scrollLeft += e.deltaY;
    }
  };

  if (!items.length) return null;

  return (
    <div className="space-y-3 my-6 sm:my-8 relative group/row w-full max-w-full overflow-hidden">
      {/* Row Header: Single clean line, badge never wraps into 2 lines */}
      <div className="flex items-center justify-between gap-2 px-3.5 sm:px-6 lg:px-8 w-full min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h2 className="text-base sm:text-xl lg:text-2xl font-extrabold text-white tracking-tight truncate">
            {title}
          </h2>
          {badge && (
            <span className="shrink-0 whitespace-nowrap text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 rounded-full font-semibold bg-red-600/20 text-red-400 border border-red-600/30">
              {badge}
            </span>
          )}
        </div>

        {/* Carousel Step Buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => scroll('left')}
            tabIndex={0}
            aria-label="Попередні"
            className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-red-600 active:bg-red-600 text-slate-300 hover:text-white transition-all tv-btn-focus focus:outline-none border border-white/10"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            tabIndex={0}
            aria-label="Наступні"
            className="p-1.5 sm:p-2 rounded-xl bg-white/5 hover:bg-red-600 active:bg-red-600 text-slate-300 hover:text-white transition-all tv-btn-focus focus:outline-none border border-white/10"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Row Scroll Container: Exact whole-card fractional widths + CSS Scroll Snap */}
      <div
        ref={rowRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseUpOrLeave}
        onWheel={handleWheel}
        className={`flex items-start gap-3 sm:gap-3.5 md:gap-4 overflow-x-auto px-3.5 sm:px-6 lg:px-8 scroll-px-3.5 sm:scroll-px-6 lg:scroll-px-8 snap-x snap-mandatory scrollbar-none scroll-smooth pb-2 ${
          isDragging ? 'drag-scroll-active cursor-grabbing' : 'cursor-default'
        }`}
      >
        {items.map((media) => {
          const isFav = favorites.some((f) => f.id.toString() === media.id.toString());
          return (
            <div
              key={media.id}
              className="w-[calc((100%-12px)/2)] sm:w-[calc((100%-28px)/3)] md:w-[calc((100%-48px)/4)] lg:w-[calc((100%-64px)/5)] xl:w-[calc((100%-80px)/6)] shrink-0 snap-start"
              onClickCapture={(e) => {
                if (hasDraggedRef.current) {
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
