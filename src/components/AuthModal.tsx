import React, { useState, useEffect } from 'react';
import { X, Cloud, Smartphone, LogOut, Check, Copy, RefreshCw, Download, Sparkles } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { authSyncService, UserProfile } from '../services/authSync';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataSync?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onDataSync }) => {
  const [profile, setProfile] = useState<UserProfile | null>(authSyncService.getProfile());
  const [googleEmail, setGoogleEmail] = useState<string>('');
  const [googleName, setGoogleName] = useState<string>('');
  const [inputSyncToken, setInputSyncToken] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    return authSyncService.subscribe((p) => {
      setProfile(p);
    });
  }, []);

  if (!isOpen) return null;

  const handleGoogleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleEmail.trim()) {
      setErrorMsg('Будь ласка, вкажіть ваш Google email');
      return;
    }
    setErrorMsg(null);
    setIsSyncing(true);
    try {
      await authSyncService.loginWithGoogle(googleEmail.trim(), googleName.trim() || undefined);
      setSuccessMsg('Успішний вхід через Google! Ваша медіатека синхронізована.');
      if (onDataSync) onDataSync();
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch {
      setErrorMsg('Помилка авторизації. Спробуйте ще раз.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLinkDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputSyncToken.trim()) {
      setErrorMsg('Введіть 6-значний код синхронізації');
      return;
    }
    setErrorMsg(null);
    setIsSyncing(true);
    try {
      const ok = await authSyncService.linkDeviceWithSyncToken(inputSyncToken.trim());
      if (ok) {
        setSuccessMsg('Пристрій успішно підключено! Дані синхронізовано.');
        if (onDataSync) onDataSync();
        setInputSyncToken('');
        setTimeout(() => setSuccessMsg(null), 3500);
      } else {
        setErrorMsg('Не вдалося знайти профіль за цим кодом');
      }
    } catch {
      setErrorMsg('Помилка підключення пристрою');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await authSyncService.pullFromCloud();
      await authSyncService.pushToCloud();
      setSuccessMsg('Медіатека та прогрес перегляду синхронізовані!');
      if (onDataSync) onDataSync();
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch {
      setErrorMsg('Не вдалося синхронізувати з хмарою');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopyCode = () => {
    if (!profile?.syncToken) return;
    navigator.clipboard.writeText(profile.syncToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportBackup = () => {
    const json = authSyncService.exportBackupJson();
    navigator.clipboard.writeText(json);
    setCopied(true);
    setSuccessMsg('Резервну копію скопійовано в буфер обміну!');
    setTimeout(() => {
      setCopied(false);
      setSuccessMsg(null);
    }, 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none">
      <div className="relative w-full max-w-lg bg-[#0d121f] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-md">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                Хмарна синхронізація
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  PRO SYNC
                </span>
              </h2>
              <p className="text-xs text-slate-400">Прогрес перегляду та обране на всіх ваших пристроях</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Alerts */}
        {errorMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs font-semibold">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 custom-scrollbar text-slate-200">
          {profile ? (
            /* LOGGED-IN VIEW */
            <div className="space-y-5">
              {/* Profile Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/30 via-slate-900/40 to-indigo-900/20 border border-blue-500/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={profile.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.email}`}
                    alt={profile.name}
                    className="w-12 h-12 rounded-2xl bg-slate-800 border border-white/20 p-0.5 shadow-md"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm sm:text-base font-bold text-white">{profile.name}</h3>
                      {profile.isGoogleAuth && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-white text-slate-900">
                          Google
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate max-w-[200px] sm:max-w-xs">{profile.email}</p>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-400 font-medium">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Хмара активна • Автозбереження</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all"
                  title="Оновити зараз"
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-400' : ''}`} />
                </button>
              </div>

              {/* Cross-Device Pairing Code & QR */}
              <div className="p-4 sm:p-5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-white">
                    <Smartphone className="w-4 h-4 text-blue-400" />
                    <span>Підключити інший пристрій (Android TV / Планшет)</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 bg-white/10 px-2 py-0.5 rounded-md">
                    2 пристрої в мережі
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/40 p-3.5 rounded-xl border border-white/5">
                  {/* QR Code */}
                  <div className="p-2 bg-white rounded-xl shadow-lg shrink-0">
                    <QRCodeSVG
                      value={`cinemavault://sync?token=${profile.syncToken}`}
                      size={110}
                      level="M"
                      includeMargin={false}
                    />
                  </div>

                  {/* Sync Code Details */}
                  <div className="space-y-2 text-center sm:text-left flex-1 min-w-0">
                    <p className="text-xs text-slate-400">
                      Відскануйте QR-код камерою іншого пристрою або введіть персональний код:
                    </p>
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <div className="px-3.5 py-1.5 rounded-xl bg-white/10 border border-white/20 text-base sm:text-lg font-black tracking-widest text-amber-300 font-mono">
                        {profile.syncToken}
                      </div>
                      <button
                        onClick={handleCopyCode}
                        className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white active:scale-95 transition-all"
                        title="Скопіювати код"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions & Backup */}
              <div className="flex items-center justify-between pt-1 text-xs">
                <button
                  onClick={handleExportBackup}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Експорт резервної копії</span>
                </button>

                <button
                  onClick={() => authSyncService.logout()}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 text-red-300 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Вийти з профілю</span>
                </button>
              </div>
            </div>
          ) : (
            /* NOT LOGGED IN VIEW */
            <div className="space-y-6">
              {/* Hero Banner inside Modal */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-900/40 via-indigo-950/30 to-purple-950/20 border border-blue-500/30 space-y-2">
                <div className="flex items-center gap-2 text-blue-400 font-extrabold text-xs uppercase tracking-wider">
                  <Sparkles className="w-4 h-4" />
                  <span>Повна свобода перегляду</span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white">
                  Збережіть прогрес переглядів назавжди
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Почали дивитися фільм на телефоні — продовжуйте на смарт-телевізорі або планшеті з тієї ж секунди. Всі ваші обрані фільми завжди з вами.
                </p>
              </div>

              {/* Google Login Form */}
              <form onSubmit={handleGoogleLogin} className="space-y-3">
                <label className="block text-xs font-bold text-slate-300">
                  Вхід через Google / Email:
                </label>
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="email"
                      value={googleEmail}
                      onChange={(e) => setGoogleEmail(e.target.value)}
                      placeholder="vash.email@gmail.com"
                      className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/15 focus:border-blue-500 focus:outline-none text-sm text-white placeholder-slate-500"
                    />
                  </div>
                  <input
                    type="text"
                    value={googleName}
                    onChange={(e) => setGoogleName(e.target.value)}
                    placeholder="Ваше ім'я (необов'язково)"
                    className="w-full px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 focus:border-blue-500 focus:outline-none text-xs text-white placeholder-slate-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSyncing}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] text-white font-extrabold text-sm shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all"
                >
                  {isSyncing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {/* Google G SVG */}
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path
                          fill="#ffffff"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#ffffff"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#ffffff"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#ffffff"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Увійти та увімкнути синхронізацію</span>
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="relative flex items-center justify-center">
                <div className="border-t border-white/10 w-full" />
                <span className="bg-[#0d121f] px-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Або підключіть інший пристрій
                </span>
                <div className="border-t border-white/10 w-full" />
              </div>

              {/* Device Link Form */}
              <form onSubmit={handleLinkDevice} className="space-y-3">
                <label className="block text-xs font-bold text-slate-300">
                  Маєте код з іншого телефона чи ТВ?
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputSyncToken}
                    onChange={(e) => setInputSyncToken(e.target.value.toUpperCase())}
                    placeholder="CV-XXXXXX"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-black/40 border border-white/15 focus:border-amber-400 focus:outline-none text-sm text-center font-mono font-bold tracking-widest text-amber-300 placeholder-slate-600"
                  />
                  <button
                    type="submit"
                    disabled={isSyncing}
                    className="px-5 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 text-white font-bold text-xs backdrop-blur-md border border-white/20 transition-all shrink-0"
                  >
                    Зв'язати
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
