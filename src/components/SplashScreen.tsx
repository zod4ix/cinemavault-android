import React, { useState, useEffect } from 'react';
import { CinemaLogo } from './CinemaLogo';
import { Sparkles, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface SplashScreenProps {
  onFinish: () => void;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const { language } = useLanguage();
  const [progress, setProgress] = useState<number>(0);
  const [isFading, setIsFading] = useState<boolean>(false);

  const statusMessages: { [key: string]: { [threshold: number]: string } } = {
    uk: {
      0: 'Ініціалізація дзеркал VidSrc, Ashdi UA та HDRezka...',
      35: 'Синхронізація бази IMDb / TMDB та 4K HDR...',
      70: 'Підключення P2P трекерів Hurtom / Toloka...',
      92: 'Система готова до перегляду! 🍿',
    },
    en: {
      0: 'Initializing VidSrc, Ashdi & HDRezka mirrors...',
      35: 'Synchronizing IMDb / TMDB 4K HDR database...',
      70: 'Connecting P2P Hurtom / Toloka trackers...',
      92: 'System ready for streaming! 🍿',
    },
    pl: {
      0: 'Inicjalizacja serwerów VidSrc, Ashdi i HDRezka...',
      35: 'Synchronizacja bazy IMDb / TMDB 4K HDR...',
      70: 'Łączenie z trackerami P2P Hurtom / Toloka...',
      92: 'System gotowy do oglądania! 🍿',
    },
    es: {
      0: 'Inicializando servidores VidSrc, Ashdi y HDRezka...',
      35: 'Sincronizando base IMDb / TMDB 4K HDR...',
      70: 'Conectando trackers P2P Hurtom / Toloka...',
      92: '¡Sistema listo para reproducir! 🍿',
    },
    ru: {
      0: 'Инициализация серверов VidSrc, Ashdi и HDRezka...',
      35: 'Синхронизация базы IMDb / TMDB 4K HDR...',
      70: 'Подключение P2P трекеров Hurtom / Toloka...',
      92: 'Система готова к просмотру! 🍿',
    },
  };

  const getStatusText = (val: number) => {
    const langMsgs = statusMessages[language] || statusMessages.uk;
    if (val >= 92) return langMsgs[92];
    if (val >= 70) return langMsgs[70];
    if (val >= 35) return langMsgs[35];
    return langMsgs[0];
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setTimeout(() => {
            setIsFading(true);
            setTimeout(onFinish, 450);
          }, 220);
          return 100;
        }
        const increment = Math.floor(Math.random() * 14) + 8;
        return Math.min(100, prev + increment);
      });
    }, 95);

    return () => clearInterval(interval);
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-between p-5 sm:p-8 bg-[#06080e] select-none transition-opacity duration-500 ${
        isFading ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-red-600/15 rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-72 h-72 bg-amber-500/10 rounded-full blur-[95px] pointer-events-none" />

      {/* Top subtle badge */}
      <div className="w-full flex justify-between items-center z-10 pt-1">
        <span className="text-[11px] font-bold text-slate-400 tracking-widest uppercase flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" /> CinemaVault PRO • v3.6.1
        </span>
        <button
          tabIndex={0}
          onClick={() => {
            setIsFading(true);
            setTimeout(onFinish, 150);
          }}
          className="text-xs text-slate-300 hover:text-white px-3 py-1 rounded-full bg-white/10 transition-colors tv-btn-focus focus:outline-none"
        >
          Пропустити ➔
        </button>
      </div>

      {/* Center Logo & Branding */}
      <div className="flex flex-col items-center text-center space-y-5 z-10 my-auto">
        <CinemaLogo size="xl" animated />

        <div className="space-y-1">
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight drop-shadow-2xl">
            Cinema<span className="text-red-500">Vault</span>
          </h1>
          <p className="text-[11px] sm:text-sm font-extrabold text-amber-400 tracking-widest uppercase">
            Автономний Онлайн-Кінотеатр • 4K HDR
          </p>
        </div>

        {/* Progress Bar */}
        <div className="w-72 sm:w-96 max-w-[86vw] space-y-2 pt-3">
          <div className="relative h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-red-600 via-amber-500 to-red-500 rounded-full transition-all duration-150 shadow-lg shadow-red-500/50"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 gap-2">
            <span className="truncate text-left text-slate-300 flex items-center gap-1 min-w-0">
              {progress >= 95 ? (
                <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block shrink-0 mr-1" />
              )}
              <span className="truncate">{getStatusText(progress)}</span>
            </span>
            <span className="font-bold text-amber-400 shrink-0">{progress}%</span>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="w-full text-center pb-1 z-10">
        <p className="text-[11px] text-slate-500">
          Зроблено для своїх • Без цензури • Без реклами
        </p>
      </div>
    </div>
  );
};
