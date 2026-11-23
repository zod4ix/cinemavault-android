import React, { useState, useEffect, useRef } from 'react';
import { 
  X, 
  Share2, 
  Copy, 
  Check, 
  QrCode, 
  Smartphone, 
  ExternalLink, 
  Sparkles,
  Mail,
  Film,
  Send,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Radio,
  Tv,
  Laptop
} from 'lucide-react';
import { MediaItem } from '../types/movie';
import { getSocialShareLinks, SocialShareLink } from '../services/deepLink';
import { openExternalDownload } from '../services/updater';
import { authSyncService, ConnectedDevice } from '../services/authSync';

interface ShareModalProps {
  media: MediaItem;
  isOpen: boolean;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({ media, isOpen, onClose }) => {
  const [copiedType, setCopiedType] = useState<'none' | 'link' | 'all' | 'code' | 'myId'>('none');
  const [showQr, setShowQr] = useState<boolean>(false);
  const [friendIdInput, setFriendIdInput] = useState<string>('');
  const [isSendingFriend, setIsSendingFriend] = useState<boolean>(false);
  const [friendSendSuccess, setFriendSendSuccess] = useState<string | null>(null);
  const [friendSendError, setFriendSendError] = useState<string | null>(null);

  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const firstBtnRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const myFriendId = authSyncService.getPersonalFriendId();
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareData = getSocialShareLinks(media);

  useEffect(() => {
    if (!isOpen) {
      setCopiedType('none');
      setShowQr(false);
      setFriendIdInput('');
      setFriendSendSuccess(null);
      setFriendSendError(null);
      return;
    }

    setConnectedDevices(authSyncService.getConnectedDevices());

    const t = setTimeout(() => {
      firstBtnRef.current?.focus({ preventScroll: true });
    }, 120);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 27 || e.keyCode === 4) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareData.shareUrl);
      setCopiedType('link');
      setTimeout(() => setCopiedType('none'), 2500);
    } catch {
      // fallback
    }
  };

  const handleCopyMovieCode = async () => {
    try {
      await navigator.clipboard.writeText(shareData.movieCode);
      setCopiedType('code');
      setTimeout(() => setCopiedType('none'), 2500);
    } catch {
      // fallback
    }
  };

  const handleCopyMyId = async () => {
    try {
      await navigator.clipboard.writeText(myFriendId);
      setCopiedType('myId');
      setTimeout(() => setCopiedType('none'), 2500);
    } catch {
      // fallback
    }
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(shareData.fullText);
      setCopiedType('all');
      setTimeout(() => setCopiedType('none'), 2500);
    } catch {
      // fallback
    }
  };

  const handleNativeShare = async () => {
    try {
      await navigator.share({
        title: shareData.title,
        text: shareData.fullText,
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        handleCopyAll();
      }
    }
  };

  const handleOpenSocial = (item: SocialShareLink) => {
    if (item.id === 'viber') {
      try {
        openExternalDownload(item.url);
        // Fallback for browsers / desktops if app scheme is not intercepted
        setTimeout(() => {
          if (typeof window !== 'undefined' && item.webFallbackUrl && !document.hidden) {
            window.open(item.webFallbackUrl, '_blank', 'noopener,noreferrer');
          }
        }, 1200);
      } catch {
        if (item.webFallbackUrl) openExternalDownload(item.webFallbackUrl);
      }
      return;
    }
    openExternalDownload(item.url);
  };

  const handleSendToFriend = async (targetId?: string) => {
    const rawId = (targetId || friendIdInput).trim().toUpperCase();
    if (!rawId) {
      setFriendSendError('Введіть персональний ID друга (наприклад: CV-XXXXXX)');
      return;
    }
    setFriendSendError(null);
    setFriendSendSuccess(null);
    setIsSendingFriend(true);

    try {
      const ok = await authSyncService.sendMovieToFriend(rawId, media);
      if (ok) {
        setFriendSendSuccess(`Фільм «${media.title || media.originalTitle}» успішно надіслано на пристрій ${rawId}!`);
        setFriendIdInput('');
        setTimeout(() => setFriendSendSuccess(null), 5000);
      } else {
        setFriendSendError('Не вдалося доставити контент. Перевірте правильність ID друга.');
      }
    } catch {
      setFriendSendError('Помилка надсилання. Перевірте підключення до Інтернету.');
    } finally {
      setIsSendingFriend(false);
    }
  };

  const renderSocialIcon = (iconName: string) => {
    switch (iconName) {
      case 'telegram':
        return (
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.121l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.196 1.006.128.832.942z" />
          </svg>
        );
      case 'viber':
        return (
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M19.5 2C16.8 2 8 3.3 4.5 7.6 2.1 10.5 2 13.9 2 16.5c0 3.3 2 5.5 4.3 6.3.3.1.6 0 .7-.3l.9-2.5c.1-.2 0-.5-.2-.7-1.3-.9-1.9-2.2-1.9-3.8 0-3.3 2.6-7.3 7-8.1 4.7-.9 8.6 1.4 9.1 5.4.3 2.4-.7 4.5-2.6 5.8-.3.2-.4.4-.3.7l.8 2.5c.1.3.4.4.7.3 3.3-1.4 5.8-4.5 5.8-8.8C26.3 6.9 22.8 2 19.5 2zM16 11.2c-.3 0-.5-.2-.5-.5 0-1.5-1.2-2.7-2.7-2.7-.3 0-.5-.2-.5-.5s.2-.5.5-.5c2 0 3.7 1.7 3.7 3.7 0 .3-.2.5-.5.5zm2.5 0c-.3 0-.5-.2-.5-.5 0-2.9-2.3-5.2-5.2-5.2-.3 0-.5-.2-.5-.5s.2-.5.5-.5c3.4 0 6.2 2.8 6.2 6.2 0 .3-.2.5-.5.5z"/>
          </svg>
        );
      case 'whatsapp':
        return (
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
          </svg>
        );
      case 'email':
        return <Mail className="w-5 h-5 text-red-400" />;
      case 'facebook':
        return (
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
          </svg>
        );
      case 'twitter':
        return (
          <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
          </svg>
        );
      default:
        return <Share2 className="w-5 h-5 text-blue-400" />;
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-fadeIn select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-xl bg-[#090d16] border border-slate-700/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] text-slate-100"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-[#0d1322]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/40 text-blue-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Поділитися фільмом</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  REALTIME v3.7.5
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Миттєве авто-відкриття, надсилання другу за ID та соцмережі
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            tabIndex={0}
            className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors tv-btn-focus focus:outline-none"
            title="Закрити (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 overflow-y-auto space-y-5 custom-scrollbar">
          {/* Movie summary banner */}
          <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800">
            {media.posterPath ? (
              <img 
                src={media.posterPath} 
                alt={media.title} 
                className="w-14 h-20 sm:w-16 sm:h-24 object-cover rounded-xl shadow-md shrink-0 border border-white/10" 
              />
            ) : (
              <div className="w-14 h-20 sm:w-16 sm:h-24 bg-slate-800 rounded-xl flex items-center justify-center shrink-0 border border-white/10 text-slate-500">
                <Film className="w-6 h-6" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-red-600/20 border border-red-500/40 text-red-400 font-extrabold text-[10px] tracking-wide uppercase">
                  4K HDR • 1080p
                </span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px]">
                  🇺🇦 HDRezka & UAKino
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-black text-white truncate">
                {media.title} {media.year ? `(${media.year})` : ''}
              </h4>
              <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                {media.overview || 'Дивіться онлайн безкоштовно та без реклами у CinemaVault PRO'}
              </p>

              {/* Quick Code Badge */}
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/60 border border-amber-500/40 text-amber-300 font-mono text-xs font-bold">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Код: {shareData.movieCode}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyMovieCode}
                  tabIndex={0}
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-bold text-slate-200 transition-colors tv-btn-focus focus:outline-none"
                >
                  {copiedType === 'code' ? '✓ Код скопійовано' : 'Копіювати код'}
                </button>
              </div>
            </div>
          </div>

          {/* IN-APP REALTIME FRIEND ID SHARE SECTION */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/40 border border-indigo-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300">
                  <Radio className="w-4 h-4 animate-pulse" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-extrabold text-white">
                    Надіслати другу в додатку (за його ID)
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Миттєва поява сповіщення на екрані друга (ТБ, ПК, смартфон)
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">Ваш ID:</span>
                <button
                  type="button"
                  onClick={handleCopyMyId}
                  className="text-xs font-mono font-bold text-amber-300 hover:text-amber-200 underline decoration-dotted"
                  title="Натисніть для копіювання вашого ID"
                >
                  {copiedType === 'myId' ? '✓ Скопійовано!' : myFriendId}
                </button>
              </div>
            </div>

            {friendSendSuccess && (
              <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{friendSendSuccess}</span>
              </div>
            )}

            {friendSendError && (
              <div className="p-2.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{friendSendError}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={friendIdInput}
                onChange={(e) => setFriendIdInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendToFriend();
                }}
                placeholder="Введіть ID друга (наприклад: CV-XXXXXX)"
                className="flex-1 bg-black/60 border border-indigo-500/30 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono placeholder-slate-500 focus:outline-none focus:border-indigo-400"
              />
              <button
                type="button"
                data-nav-row="friend"
                tabIndex={0}
                disabled={isSendingFriend}
                onClick={() => handleSendToFriend()}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-xs flex items-center gap-1.5 shrink-0 shadow-lg shadow-indigo-600/30 transition-all disabled:opacity-50 tv-btn-focus focus:outline-none"
              >
                <Send className={`w-3.5 h-3.5 ${isSendingFriend ? 'animate-spin' : ''}`} />
                <span>{isSendingFriend ? 'Відправка...' : 'Надіслати'}</span>
              </button>
            </div>

            {/* Quick send to my own connected devices */}
            {connectedDevices.length > 0 && (
              <div className="pt-1">
                <span className="text-[10px] text-slate-400 uppercase font-mono mr-1.5">
                  Мої підключені пристрої:
                </span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {connectedDevices.map((dev) => (
                    <button
                      key={dev.deviceId}
                      type="button"
                      onClick={() => handleSendToFriend(dev.deviceId)}
                      className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors tv-btn-focus focus:outline-none"
                    >
                      {dev.deviceType === 'tv' ? (
                        <Tv className="w-3 h-3 text-amber-400" />
                      ) : (
                        <Laptop className="w-3 h-3 text-purple-400" />
                      )}
                      <span className="truncate max-w-[130px]">{dev.deviceName}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Social Media Grid */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center justify-between">
              <span>Месенджери та соцмережі:</span>
              <span className="text-[11px] font-normal text-slate-500">1 клік для надсилання</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {shareData.links.map((item, idx) => (
                <button
                  key={item.id}
                  ref={idx === 0 ? firstBtnRef : undefined}
                  type="button"
                  data-nav-row="social"
                  tabIndex={0}
                  onClick={() => handleOpenSocial(item)}
                  className={`flex items-center gap-2.5 p-3 rounded-xl bg-slate-900/90 border border-slate-800 text-left transition-all group tv-btn-focus focus:outline-none ${item.bgClass}`}
                >
                  <div 
                    className="p-2 rounded-lg shrink-0 transition-transform group-hover:scale-110"
                    style={{ color: item.color, backgroundColor: `${item.color}15` }}
                  >
                    {renderSocialIcon(item.iconName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs sm:text-sm font-bold text-white group-hover:text-white truncate">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-slate-400 flex items-center gap-0.5 truncate">
                      <span>Надіслати</span>
                      <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Extra tools: Native share & QR Code Toggle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {canNativeShare && (
              <button
                type="button"
                data-nav-row="tools"
                tabIndex={0}
                onClick={handleNativeShare}
                className="flex items-center justify-center gap-2 p-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 font-bold text-xs sm:text-sm transition-all tv-btn-focus focus:outline-none"
              >
                <Smartphone className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Системне меню (ще додатки...)</span>
              </button>
            )}

            <button
              type="button"
              data-nav-row="tools"
              tabIndex={0}
              onClick={() => setShowQr(!showQr)}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl border font-bold text-xs sm:text-sm transition-all tv-btn-focus focus:outline-none ${
                showQr 
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300' 
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
              } ${!canNativeShare ? 'sm:col-span-2' : ''}`}
            >
              <QrCode className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{showQr ? 'Приховати QR-код' : 'Показати QR-код для ТБ / смартфона'}</span>
            </button>
          </div>

          {/* QR Code section (if toggled) */}
          {showQr && (
            <div className="p-4 rounded-xl bg-black/60 border border-amber-500/30 flex flex-col sm:flex-row items-center gap-4 animate-fadeIn">
              <div className="p-2 bg-[#090d16] rounded-xl border border-slate-800 shrink-0 shadow-lg">
                <img 
                  src={shareData.qrCodeUrl} 
                  alt="QR Code" 
                  className="w-32 h-32 sm:w-36 sm:h-36 rounded-lg object-contain"
                />
              </div>
              <div className="text-center sm:text-left space-y-1.5">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Миттєве відкриття</span>
                </div>
                <h5 className="text-sm font-bold text-white">
                  Наведіть камеру смартфона на екран
                </h5>
                <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                  Зручно для проєкторів, Smart TV та моніторів: відскануйте код телефоном, щоб миттєво відкрити фільм у додатку або завантажити його.
                </p>
              </div>
            </div>
          )}

          {/* Quick copy options */}
          <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span>Пряме посилання на фільм:</span>
              {copiedType === 'link' && (
                <span className="text-emerald-400 flex items-center gap-1 text-[11px] animate-fadeIn">
                  <Check className="w-3.5 h-3.5" /> Скопійовано!
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareData.shareUrl}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-300 font-mono focus:outline-none focus:border-blue-500 select-all truncate"
              />
              <button
                type="button"
                data-nav-row="copy"
                tabIndex={0}
                onClick={handleCopyLink}
                className={`px-3 py-2 rounded-lg font-bold text-xs flex items-center gap-1.5 border transition-all shrink-0 tv-btn-focus focus:outline-none ${
                  copiedType === 'link'
                    ? 'bg-emerald-600 border-emerald-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
                }`}
                title="Скопіювати посилання"
              >
                {copiedType === 'link' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-white" />
                    <span>Готово</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Копіювати URL</span>
                  </>
                )}
              </button>
            </div>

            {/* Copy full promo text button */}
            <div className="pt-1 flex items-center justify-between">
              <button
                type="button"
                data-nav-row="copy"
                tabIndex={0}
                onClick={handleCopyAll}
                className={`w-full py-2.5 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 border transition-all tv-btn-focus focus:outline-none ${
                  copiedType === 'all'
                    ? 'bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-600/25'
                    : 'bg-blue-600/15 hover:bg-blue-600/25 border-blue-500/40 text-blue-300 hover:text-white'
                }`}
              >
                {copiedType === 'all' ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>Повний текст із посиланнями скопійовано!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-blue-400" />
                    <span>Скопіювати все повідомлення (із кодом фільму та посиланнями)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800/80 bg-[#0d1322] flex items-center justify-between text-[11px] text-slate-400">
          <span>CinemaVault PRO v3.7.5 • Universal Realtime Share</span>
          <button
            type="button"
            onClick={onClose}
            tabIndex={0}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold transition-colors tv-btn-focus focus:outline-none"
          >
            Закрити
          </button>
        </div>
      </div>
    </div>
  );
};
