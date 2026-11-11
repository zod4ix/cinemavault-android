import React, { useState, useEffect } from 'react';
import { ThumbsUp, ThumbsDown, CheckCircle2 } from 'lucide-react';
import { MediaItem } from '../types/movie';
import { userRatingService, RatingStats, VoteType } from '../services/userRatingService';
import { useLanguage } from '../i18n/LanguageContext';

interface RatingFeedbackProps {
  media: MediaItem;
  size?: 'sm' | 'md' | 'lg';
  showPercent?: boolean;
  className?: string;
}

export function formatCompactNumber(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  }
  return num.toLocaleString();
}

export const RatingFeedback: React.FC<RatingFeedbackProps> = ({
  media,
  size = 'md',
  showPercent = true,
  className = '',
}) => {
  const { t } = useLanguage();
  const [stats, setStats] = useState<RatingStats>(() => userRatingService.getRatingStats(media));
  const [justVoted, setJustVoted] = useState<VoteType | null>(null);

  useEffect(() => {
    setStats(userRatingService.getRatingStats(media));
    const unsubscribe = userRatingService.subscribe(() => {
      setStats(userRatingService.getRatingStats(media));
    });
    return unsubscribe;
  }, [media.id, media.rating, media.voteCount]);

  const handleVote = (type: VoteType, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const updated = userRatingService.vote(media, type);
    setStats(updated);
    setJustVoted(updated.userVote === type ? type : null);

    if (updated.userVote === type) {
      setTimeout(() => setJustVoted(null), 2500);
    }
  };

  const isSmall = size === 'sm';
  const isLarge = size === 'lg';

  const btnPadding = isSmall
    ? 'px-2 py-1 text-[11px]'
    : isLarge
    ? 'px-4 py-2 text-sm'
    : 'px-3 py-1.5 text-xs';

  const iconSize = isSmall ? 'w-3.5 h-3.5' : isLarge ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div className="flex items-center gap-2">
        {/* Like Button */}
        <button
          type="button"
          tabIndex={0}
          onClick={(e) => handleVote('like', e)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleVote('like');
            }
          }}
          className={`flex items-center gap-1.5 rounded-xl font-bold border transition-all active:scale-95 tv-btn-focus focus:outline-none ${btnPadding} ${
            stats.userVote === 'like'
              ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300 shadow-md shadow-emerald-500/20'
              : 'bg-white/5 hover:bg-emerald-500/15 border-white/10 text-slate-300 hover:text-emerald-300'
          }`}
          title={stats.userVote === 'like' ? (t('votedLike') || 'Вам сподобалося (скасувати)') : (t('like') || 'Подобається')}
          aria-label={t('like') || 'Подобається'}
        >
          <ThumbsUp
            className={`${iconSize} transition-transform ${
              stats.userVote === 'like' ? 'fill-emerald-400 text-emerald-400 scale-110' : ''
            }`}
          />
          <span className="font-mono tracking-tight font-black">{formatCompactNumber(stats.likes)}</span>
        </button>

        {/* Dislike Button */}
        <button
          type="button"
          tabIndex={0}
          onClick={(e) => handleVote('dislike', e)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleVote('dislike');
            }
          }}
          className={`flex items-center gap-1.5 rounded-xl font-bold border transition-all active:scale-95 tv-btn-focus focus:outline-none ${btnPadding} ${
            stats.userVote === 'dislike'
              ? 'bg-rose-500/25 border-rose-400 text-rose-300 shadow-md shadow-rose-500/20'
              : 'bg-white/5 hover:bg-rose-500/15 border-white/10 text-slate-300 hover:text-rose-300'
          }`}
          title={stats.userVote === 'dislike' ? (t('votedDislike') || 'Вам не сподобалося (скасувати)') : (t('dislike') || 'Не подобається')}
          aria-label={t('dislike') || 'Не подобається'}
        >
          <ThumbsDown
            className={`${iconSize} transition-transform ${
              stats.userVote === 'dislike' ? 'fill-rose-400 text-rose-400 scale-110' : ''
            }`}
          />
          <span className="font-mono tracking-tight font-black">{formatCompactNumber(stats.dislikes)}</span>
        </button>

        {/* Positive Approval Badge */}
        {showPercent && (
          <div
            className={`flex items-center gap-1 rounded-xl px-2.5 py-1 border font-bold ${
              stats.approvalPercent >= 85
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : stats.approvalPercent >= 70
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                : 'bg-slate-800 border-white/10 text-slate-400'
            }`}
            title={`Схвалення глядачів: ${stats.approvalPercent}% (${stats.totalVotes.toLocaleString()} голосів)`}
          >
            <span className="text-[10px] sm:text-xs font-black">
              {stats.approvalPercent}% {t('approval') || 'схвалення'}
            </span>
          </div>
        )}
      </div>

      {/* Instant Vote Confirmation Toast Indicator */}
      {justVoted && (
        <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium animate-fadeIn">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>{t('voteRecorded') || 'Ваш голос успішно враховано!'}</span>
        </div>
      )}
    </div>
  );
};
