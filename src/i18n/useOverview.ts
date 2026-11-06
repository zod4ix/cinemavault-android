import { useEffect, useState } from 'react';
import { MediaItem } from '../types/movie';
import { getCinemetaMetaAny } from '../services/cinemeta';
import { useLanguage } from './LanguageContext';

/**
 * Returns an overview in a language the user can read:
 * - Ukrainian/Russian UI keep the stored (Ukrainian) text,
 * - other languages get the English description from Cinemeta when the stored text is Cyrillic or empty.
 */
export function useOverview(media: MediaItem | null): string {
  const { language } = useLanguage();
  const base = media?.overview || '';
  const [text, setText] = useState<string>(base);

  useEffect(() => {
    setText(base);
    if (!media || !media.imdbId) return;
    const hasCyrillic = /[а-яіїєґё]/i.test(base);
    const needRemote = !base || (language !== 'uk' && language !== 'ru' && hasCyrillic);
    if (!needRemote) return;

    let alive = true;
    getCinemetaMetaAny(media.imdbId, media.mediaType === 'tv' || media.mediaType === 'anime').then(
      (found) => {
        if (alive && found?.meta?.description) setText(found.meta.description);
      }
    );
    return () => {
      alive = false;
    };
  }, [media?.id, media?.imdbId, base, language]);

  return text;
}
