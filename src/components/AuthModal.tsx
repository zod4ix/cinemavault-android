import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Cloud,
  Smartphone,
  LogOut,
  Check,
  Copy,
  RefreshCw,
  Download,
  Upload,
  Sparkles,
  FileJson,
  ShieldCheck,
  Tv,
  Heart,
  History,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { authSyncService, UserProfile } from '../services/authSync';
import { storageService } from '../services/storage';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataSync?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onDataSync }) => {
  const [profile, setProfile] = useState<UserProfile | null>(authSyncService.getProfile());
  const [activeTab, setActiveTab] = useState<'cloud' | 'pair' | 'backup'>('cloud');

  const [googleEmail, setGoogleEmail] = useState<string>('');
  const [googleName, setGoogleName] = useState<string>('');
  const [googlePin, setGooglePin] = useState<string>('');
  const [inputSyncToken, setInputSyncToken] = useState<string>('');
  const [importJsonText, setImportJsonText] = useState<string>('');
  const [showImportBox, setShowImportBox] = useState<boolean>(false);

  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return authSyncService.subscribe((p) => {
      setProfile(p);
    });
  }, []);

  if (!isOpen) return null;

  const favCount = storageService.getFavorites().length;
  const histCount = storageService.getHistory().length;

  const showTempSuccess = (msg: string) => {
    setErrorMsg(null);
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleGoogleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleEmail.trim()) {
      setErrorMsg('Будь ласка, вкажіть ваш Google Email');
      return;
    }
    setErrorMsg(null);
    setIsSyncing(true);
    try {
      await authSyncService.loginWithGoogle(
        googleEmail.trim(),
        googleName.trim() || undefined,
        googlePin.trim() || undefined
      );
      showTempSuccess(
        'Успішний вхід! Ваша медіатека, обране та прогрес переглядів синхронізовані в хмарі.'
      );
      if (onDataSync) onDataSync();
    } catch {
      setErrorMsg('Помилка авторизації. Спробуйте ще раз.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLinkDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputSyncToken.trim()) {
      setErrorMsg('Введіть код синхронізації (наприклад, CV-XXXXXX)');
      return;
    }
    setErrorMsg(null);
    setIsSyncing(true);
    try {
      const ok = await authSyncService.linkDeviceWithSyncToken(inputSyncToken.trim());
      if (ok) {
        showTempSuccess('Пристрій успішно підключено! Усі дані та прогрес перенесено.');
        if (onDataSync) onDataSync();
        setInputSyncToken('');
        setActiveTab('cloud');
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
    setErrorMsg(null);
    try {
      await authSyncService.pullFromCloud();
      await authSyncService.pushToCloud();
      showTempSuccess('Хмарну медіатеку та позиції перегляду успішно синхронізовано!');
      if (onDataSync) onDataSync();
    } catch {
      setErrorMsg('Не вдалося з’єднатися з хмарою. Дані збережено локально.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCopyCode = () => {
    if (!profile?.syncToken) return;
    navigator.clipboard.writeText(profile.syncToken);
    setCopied(true);
    showTempSuccess(`Код ${profile.syncToken} скопійовано!`);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyBackupJson = () => {
    const json = authSyncService.exportBackupJson();
    navigator.clipboard.writeText(json);
    setCopied(true);
    showTempSuccess('Резервну копію скопійовано в буфер обміну!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadBackupFile = () => {
    try {
      const json = authSyncService.exportBackupJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CinemaVault-Backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showTempSuccess('Файл резервної копії збережено на пристрій!');
    } catch {
      handleCopyBackupJson();
    }
  };

  const handleImportJsonSubmit = () => {
    if (!importJsonText.trim()) {
      setErrorMsg('Вставте JSON-код резервної копії');
      return;
    }
    const ok = authSyncService.importBackupJson(importJsonText);
    if (ok) {
      setImportJsonText('');
      setShowImportBox(false);
      showTempSuccess('Дані успішно відновлено з резервної копії!');
      if (onDataSync) onDataSync();
    } else {
      setErrorMsg('Невірний формат резервної копії JSON');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const ok = authSyncService.importBackupJson(text);
      if (ok) {
        showTempSuccess('Медіатеку та прогрес успішно відновлено з файлу!');
        if (onDataSync) onDataSync();
      } else {
        setErrorMsg('Не вдалося прочитати файл резервної копії');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 animate-fadeIn select-none"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl bg-[#0b101d] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-blue-950/50 via-slate-900/50 to-indigo-950/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-600/30">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Хмарний Профіль & Синхронізація</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  PRO CLOUD
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Єдиний прогрес перегляду та обране на смартфоні, ТВ та планшеті
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

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 px-5 pt-3 border-b border-white/10 bg-[#0b101d] overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('cloud')}
            tabIndex={0}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap flex items-center gap-1.5 transition-all tv-btn-focus focus:outline-none ${
              activeTab === 'cloud'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Cloud className="w-4 h-4" />
            <span>Хмарний акаунт</span>
          </button>

          <button
            onClick={() => setActiveTab('pair')}
            tabIndex={0}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap flex items-center gap-1.5 transition-all tv-btn-focus focus:outline-none ${
              activeTab === 'pair'
                ? 'border-amber-500 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>Код для ТВ / Девайсів</span>
          </button>

          <button
            onClick={() => setActiveTab('backup')}
            tabIndex={0}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap flex items-center gap-1.5 transition-all tv-btn-focus focus:outline-none ${
              activeTab === 'backup'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <FileJson className="w-4 h-4" />
            <span>Резервна копія</span>
          </button>
        </div>

        {/* Status Alerts */}
        {errorMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs font-semibold">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="mx-5 mt-3 p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 custom-scrollbar text-slate-200">
          {/* Current Device Vault Summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/15 text-red-400">
                <Heart className="w-4 h-4 fill-current" />
              </div>
              <div>
                <div className="text-sm sm:text-base font-black text-white">{favCount}</div>
                <div className="text-[11px] text-slate-400">Збережено в Обраному</div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400">
                <History className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm sm:text-base font-black text-white">{histCount}</div>
                <div className="text-[11px] text-slate-400">Позицій перегляду</div>
              </div>
            </div>
          </div>

          {/* TAB 1: CLOUD ACCOUNT */}
          {activeTab === 'cloud' && (
            <>
              {profile ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/35 via-slate-900/40 to-indigo-900/25 border border-blue-500/30 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={
                          profile.avatar ||
                          `https://api.dicebear.com/7.x/bottts/svg?seed=${profile.email}`
                        }
                        alt={profile.name}
                        className="w-12 h-12 rounded-2xl bg-slate-800 border border-white/20 p-0.5 shadow-md shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-white truncate">
                            {profile.name}
                          </h3>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {profile.syncToken}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate">{profile.email}</p>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-emerald-400 font-semibold">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Хмарна синхронізація активна</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleManualSync}
                      disabled={isSyncing}
                      tabIndex={0}
                      className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold flex items-center gap-1.5 shrink-0 shadow-lg shadow-blue-600/30 active:scale-95 transition-all tv-btn-focus focus:outline-none"
                    >
                      <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>Синхронізувати</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2 text-xs text-slate-300">
                    <div className="flex items-center gap-2 font-bold text-white">
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Як перенести прогрес на інший пристрій?</span>
                    </div>
                    <p className="text-slate-400 leading-relaxed">
                      1. Просто увійдіть з тим самим Email (<strong>{profile.email}</strong>) на іншому телефоні чи ТВ, або введіть ваш персональний код{' '}
                      <strong className="text-amber-300 font-mono">{profile.syncToken}</strong> у вкладці «Код для ТВ».
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      onClick={() => setActiveTab('pair')}
                      tabIndex={0}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white flex items-center gap-1.5 tv-btn-focus focus:outline-none"
                    >
                      <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                      <span>Показати QR та код підключення</span>
                    </button>

                    <button
                      onClick={() => authSyncService.logout()}
                      tabIndex={0}
                      className="px-3.5 py-2 rounded-xl bg-red-950/50 hover:bg-red-900/70 border border-red-500/30 text-red-300 text-xs font-bold flex items-center gap-1.5 tv-btn-focus focus:outline-none"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Вийти</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-950/50 via-indigo-950/30 to-slate-900 border border-blue-500/30 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-blue-400 font-extrabold text-xs uppercase">
                      <Sparkles className="w-4 h-4" />
                      <span>Миттєва синхронізація між усіма пристроями</span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Введіть ваш Email на смартфоні та телевізорі — додаток автоматично згенерує ваш персональний хмарний ключ і перенесе всі збережені фільми та секунду зупинки!
                    </p>
                  </div>

                  <form onSubmit={handleGoogleLogin} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        Ваш Google / Email (однаковий для всіх ваших пристроїв):
                      </label>
                      <input
                        type="email"
                        value={googleEmail}
                        onChange={(e) => setGoogleEmail(e.target.value)}
                        placeholder="vash.email@gmail.com"
                        className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/15 focus:border-blue-500 focus:outline-none text-sm text-white placeholder-slate-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        value={googleName}
                        onChange={(e) => setGoogleName(e.target.value)}
                        placeholder="Ваше ім'я (необов'язково)"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 focus:border-blue-500 focus:outline-none text-xs text-white placeholder-slate-500"
                      />
                      <input
                        type="password"
                        value={googlePin}
                        onChange={(e) => setGooglePin(e.target.value)}
                        placeholder="Секретний PIN (необов'язково)"
                        className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/10 focus:border-blue-500 focus:outline-none text-xs text-white placeholder-slate-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isSyncing}
                      tabIndex={0}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-[0.99] text-white font-extrabold text-sm shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all tv-btn-focus focus:outline-none"
                    >
                      {isSyncing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Cloud className="w-4 h-4" />
                          <span>Увійти та увімкнути хмарну синхронізацію</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}
            </>
          )}

          {/* TAB 2: DEVICE PAIRING CODE & QR */}
          {activeTab === 'pair' && (
            <div className="space-y-5">
              {profile && (
                <div className="p-4 rounded-2xl bg-black/40 border border-white/10 flex flex-col sm:flex-row items-center gap-4">
                  <div className="p-2 bg-white rounded-xl shrink-0 shadow-lg">
                    <QRCodeSVG
                      value={`cinemavault://sync?token=${profile.syncToken}`}
                      size={104}
                      level="M"
                    />
                  </div>
                  <div className="space-y-2 text-center sm:text-left flex-1">
                    <h4 className="text-xs sm:text-sm font-extrabold text-white">
                      Ваш персональний код синхронізації:
                    </h4>
                    <p className="text-xs text-slate-400">
                      Введіть цей 6-значний код на вашому Smart TV, проєкторі чи іншому смартфоні:
                    </p>
                    <div className="flex items-center justify-center sm:justify-start gap-2">
                      <div className="px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 text-lg font-black tracking-widest text-amber-300 font-mono">
                        {profile.syncToken}
                      </div>
                      <button
                        onClick={handleCopyCode}
                        tabIndex={0}
                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 tv-btn-focus focus:outline-none"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        <span>Копіювати</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleLinkDevice} className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <label className="block text-xs sm:text-sm font-extrabold text-white">
                  Підключити цей пристрій за кодом з іншого девайса:
                </label>
                <p className="text-xs text-slate-400">
                  Введіть код формату <span className="font-mono text-amber-300">CV-XXXXXX</span>, щоб миттєво завантажити обране та історію переглядів:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputSyncToken}
                    onChange={(e) => setInputSyncToken(e.target.value.toUpperCase())}
                    placeholder="CV-XXXXXX"
                    className="flex-1 px-4 py-3 rounded-xl bg-black/50 border border-white/15 focus:border-amber-400 focus:outline-none text-sm text-center font-mono font-black tracking-widest text-amber-300 placeholder-slate-600"
                  />
                  <button
                    type="submit"
                    disabled={isSyncing}
                    tabIndex={0}
                    className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm shrink-0 shadow-lg shadow-amber-500/20 active:scale-95 transition-all tv-btn-focus focus:outline-none"
                  >
                    Підключити
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: PORTABLE BACKUP (EXPORT / IMPORT) */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <h4 className="text-xs sm:text-sm font-extrabold text-white">
                  Експорт та збереження ваших даних (100% автономно)
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Ви можете зберегти повну резервну копію вашого профілю, списку обраних фільмів та історії переглядів у файл <code className="text-emerald-300">.json</code> або скопіювати в буфер обміну.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    onClick={handleDownloadBackupFile}
                    tabIndex={0}
                    className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/25 tv-btn-focus focus:outline-none"
                  >
                    <Download className="w-4 h-4" />
                    <span>Завантажити файл .JSON</span>
                  </button>

                  <button
                    onClick={handleCopyBackupJson}
                    tabIndex={0}
                    className="py-3 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-2 border border-white/15 tv-btn-focus focus:outline-none"
                  >
                    <Copy className="w-4 h-4 text-amber-400" />
                    <span>Скопіювати код бекапу</span>
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <h4 className="text-xs sm:text-sm font-extrabold text-white">
                  Відновлення даних з резервної копії
                </h4>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    tabIndex={0}
                    className="py-3 px-4 rounded-xl bg-blue-600/25 hover:bg-blue-600/40 text-blue-300 border border-blue-500/40 font-bold text-xs flex items-center justify-center gap-2 tv-btn-focus focus:outline-none"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Завантажити з файлу .JSON</span>
                  </button>

                  <button
                    onClick={() => setShowImportBox(!showImportBox)}
                    tabIndex={0}
                    className="py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 border border-white/15 tv-btn-focus focus:outline-none"
                  >
                    <FileJson className="w-4 h-4 text-emerald-400" />
                    <span>Вставити JSON-текст</span>
                  </button>
                </div>

                {showImportBox && (
                  <div className="space-y-2 pt-2">
                    <textarea
                      value={importJsonText}
                      onChange={(e) => setImportJsonText(e.target.value)}
                      rows={4}
                      placeholder='Вставте сюди скопійований JSON резервної копії {"app": "CinemaVault PRO"...}'
                      className="w-full p-3 rounded-xl bg-black/60 border border-white/15 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={handleImportJsonSubmit}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs"
                    >
                      Відновити дані зараз
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
