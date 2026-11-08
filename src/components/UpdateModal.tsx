import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Download,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
  Sparkles,
  Smartphone,
  Copy,
  Check,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { UpdateInfo, updaterService, openExternalDownload } from '../services/updater';
import { selfHealService } from '../services/selfHeal';

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateInfo: UpdateInfo | null;
  onRefreshCheck: () => Promise<void>;
  onRegenerateApp: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  updateInfo,
  onRefreshCheck,
  onRegenerateApp,
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [isHealing, setIsHealing] = useState(false);
  const [healDoneMsg, setHealDoneMsg] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const downloadBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      const tId = setTimeout(() => {
        downloadBtnRef.current?.focus({ preventScroll: true });
      }, 60);
      return () => clearTimeout(tId);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentVer = updateInfo?.currentVersion || updaterService.getCurrentVersion();
  const latestVer = updateInfo?.latestVersion || currentVer;
  const hasUpdate = Boolean(updateInfo?.hasUpdate);
  const apkUrl =
    updateInfo?.apkDownloadUrl ||
    `https://github.com/zod4ix/cinemavault-android/raw/main/CinemaVault-PRO-v${latestVer}.apk`;
  const releaseUrl =
    updateInfo?.releasePageUrl ||
    'https://github.com/zod4ix/cinemavault-android/releases/latest';

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      await onRefreshCheck();
    } finally {
      setIsChecking(false);
    }
  };

  const handleSelfHeal = async () => {
    setIsHealing(true);
    setHealDoneMsg(null);
    try {
      const fixed = await selfHealService.inspectAndRepair();
      await selfHealService.regenerateTransientCaches();
      onRegenerateApp();
      setHealDoneMsg(
        fixed > 0
          ? `Виправлено ${fixed} пошкоджених записів та оновлено потоки!`
          : 'Діагностику завершено: всі модулі, бази та стрім-потоки регенеровано!'
      );
      setTimeout(() => setHealDoneMsg(null), 4000);
    } finally {
      setIsHealing(false);
    }
  };

  const handleCopyApkLink = () => {
    navigator.clipboard.writeText(apkUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  return (
    <div
      data-modal-scope="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-[#0b101d] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-emerald-950/40 via-slate-900/50 to-blue-950/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-600/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Центр Оновлень та Самовідновлення</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  v{currentVer}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Прямі оновлення з GitHub • Автоматична регенерація потоків
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            tabIndex={0}
            className="p-2 rounded-full bg-white/5 hover:bg-red-600 text-slate-300 hover:text-white transition-all tv-btn-focus focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar">
          {/* Status Banner */}
          <div
            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              hasUpdate
                ? 'bg-gradient-to-r from-amber-950/60 to-red-950/50 border-amber-500/50'
                : 'bg-gradient-to-r from-emerald-950/40 to-teal-950/30 border-emerald-500/30'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {hasUpdate ? (
                  <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                )}
                <span className="text-xs sm:text-sm font-black text-white">
                  {hasUpdate
                    ? `Доступна нова версія на GitHub: v${latestVer}!`
                    : `У вас встановлена актуальна версія v${currentVer} PRO`}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {hasUpdate
                  ? 'Натисніть кнопку нижче, щоб завантажити та встановити свіжий .APK файл напряму.'
                  : 'Ви також можете завантажити .APK за прямим посиланням або через QR-код для Smart TV.'}
              </p>
            </div>

            <button
              onClick={handleManualCheck}
              disabled={isChecking}
              tabIndex={0}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 self-start sm:self-center tv-btn-focus focus:outline-none"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin text-emerald-400' : ''}`} />
              <span>Перевірити</span>
            </button>
          </div>

          {/* Direct Download Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-nav-row="update-actions">
            <button
              ref={downloadBtnRef}
              onClick={() => openExternalDownload(apkUrl)}
              tabIndex={0}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl shadow-red-600/30 active:scale-95 transition-all tv-btn-focus focus:outline-none"
            >
              <Download className="w-4 h-4" />
              <span>Завантажити .APK (v{latestVer})</span>
            </button>

            <button
              onClick={() => openExternalDownload(releaseUrl)}
              tabIndex={0}
              className="w-full py-3.5 px-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border border-white/15 active:scale-95 transition-all tv-btn-focus focus:outline-none"
            >
              <ExternalLink className="w-4 h-4 text-amber-400" />
              <span>Сторінка релізу на GitHub</span>
            </button>
          </div>

          {/* QR Code & Direct Link for Smart TV / Other Devices */}
          <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex flex-col sm:flex-row items-center gap-4">
            <div className="p-2 bg-white rounded-xl shrink-0 shadow-md">
              <QRCodeSVG value={apkUrl} size={96} level="M" />
            </div>
            <div className="space-y-2 flex-1 min-w-0 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-bold text-white">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <span>Пряме посилання для Smart TV (Downloader) та смартфонів:</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={apkUrl}
                  className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-[11px] font-mono text-amber-300 focus:outline-none"
                />
                <button
                  onClick={handleCopyApkLink}
                  tabIndex={0}
                  className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1 shrink-0 tv-btn-focus focus:outline-none"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Скопійовано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Копіювати</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Self-Healing & Auto-Regeneration Section */}
          <div className="p-4 rounded-2xl bg-blue-950/25 border border-blue-500/25 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h3 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  <span>Автоматичне самовідновлення та регенерація</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Очищує застарілі кеші, перевіряє цілісність збережених даних та перезапускає всі стрімінг-вузли.
                </p>
              </div>
              <button
                onClick={handleSelfHeal}
                disabled={isHealing}
                tabIndex={0}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0 shadow-lg shadow-blue-600/30 active:scale-95 transition-all tv-btn-focus focus:outline-none"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isHealing ? 'animate-spin' : ''}`} />
                <span>Регенерувати</span>
              </button>
            </div>

            {healDoneMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-fadeIn">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{healDoneMsg}</span>
              </div>
            )}
          </div>

          {/* Changelog / Release Notes */}
          {updateInfo?.releaseNotes && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Що нового у версії v{latestVer}:
              </h4>
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-xs text-slate-300 whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto custom-scrollbar">
                {updateInfo.releaseNotes}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
