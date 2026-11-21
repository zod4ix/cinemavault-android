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
  Keyboard,
  Laptop,
  Play,
  Trash2,
  Radio,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  authSyncService,
  UserProfile,
  ConnectedDevice,
  ActiveSessionState,
} from '../services/authSync';
import { storageService } from '../services/storage';
import { scrollElementIntoViewSafe } from '../services/spatialNav';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDataSync?: () => void;
  onResumeRemoteSession?: (session: ActiveSessionState) => void;
}

const TvVirtualKeyboard: React.FC<{
  onKeyPress: (char: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onClose: () => void;
  onSubmitField?: () => void;
  onPreset: (text: string) => void;
  activeInputName: string;
  currentValue: string;
  firstKeyRef?: React.Ref<HTMLButtonElement>;
}> = ({
  onKeyPress,
  onBackspace,
  onClear,
  onClose,
  onSubmitField,
  onPreset,
  activeInputName,
  currentValue,
  firstKeyRef,
}) => {
  const [caps, setCaps] = useState<boolean>(false);
  const rows = [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '_'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm', '.', '@', '/'],
  ];

  return (
    <div
      className="p-3 sm:p-4 rounded-2xl bg-[#070b16] border-2 border-blue-500/60 space-y-2.5 shadow-2xl animate-fadeIn select-none"
    >
      {/* Header + Live Input Mirror Preview */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/10 text-xs">
        <span className="font-extrabold text-blue-400 flex items-center gap-1.5 truncate">
          <Keyboard className="w-4 h-4 shrink-0" />
          <span>Пульт-клавіатура ТВ / Проєктора: {activeInputName}</span>
        </span>
        <div data-nav-row="vk-top" className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setCaps(!caps)}
            tabIndex={0}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors tv-btn-focus focus:outline-none ${
              caps
                ? 'bg-blue-600 text-white border-blue-400'
                : 'bg-white/10 text-slate-300 border-white/10'
            }`}
          >
            {caps ? '🔠 ВЕЛИКІ' : '🔡 малі'}
          </button>
          <button
            type="button"
            onClick={onClose}
            tabIndex={0}
            className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-red-600 text-slate-300 hover:text-white text-[11px] font-bold border border-white/10 transition-colors tv-btn-focus focus:outline-none"
          >
            ✕ Сховати
          </button>
        </div>
      </div>

      {/* Live Preview Box so user sees typed characters clearly even on large projector screens */}
      <div className="px-3 py-2 rounded-xl bg-black/70 border border-blue-500/40 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <span className="text-[10px] text-slate-400 block">{activeInputName}:</span>
          <div className="text-xs sm:text-sm font-mono font-bold text-amber-300 truncate">
            {currentValue || <span className="text-slate-600">Введіть символи кнопками нижче...</span>}
            <span className="inline-block w-1.5 h-3.5 bg-blue-400 ml-0.5 animate-pulse align-middle" />
          </div>
        </div>
        {onSubmitField && (
          <button
            type="button"
            onClick={onSubmitField}
            tabIndex={0}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black shrink-0 tv-btn-focus focus:outline-none"
          >
            ✓ Підтвердити
          </button>
        )}
      </div>

      {/* Quick Smart Presets */}
      <div data-nav-row="vk-presets" className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span className="text-[10px] text-slate-400 uppercase font-mono mr-1">Пресети:</span>
        {['CV-', '@gmail.com', '@ukr.net', '.com', '.ua', '.net'].map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPreset(p)}
            tabIndex={0}
            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-blue-600/40 text-[11px] font-mono font-bold text-blue-300 border border-white/10 hover:border-blue-400/50 transition-colors tv-btn-focus focus:outline-none"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Keyboard Keys Rows — Each row has its own data-nav-row so D-Pad Up/Down & Left/Right work smoothly! */}
      <div className="space-y-1.5 pt-1">
        {rows.map((row, rIdx) => (
          <div
            key={rIdx}
            data-nav-row={`vk-row-${rIdx}`}
            className="flex items-center justify-center gap-1 sm:gap-1.5 flex-wrap"
          >
            {row.map((ch, cIdx) => {
              const displayChar = caps ? ch.toUpperCase() : ch;
              const isFirst = rIdx === 0 && cIdx === 0;
              return (
                <button
                  key={ch}
                  ref={isFirst ? firstKeyRef : undefined}
                  type="button"
                  onClick={() => onKeyPress(displayChar)}
                  tabIndex={0}
                  className="min-w-[28px] sm:min-w-[36px] h-9 px-1.5 rounded-lg bg-[#11192e] hover:bg-blue-600 active:bg-blue-600 text-white text-xs sm:text-sm font-bold border border-white/10 hover:border-blue-400 transition-all active:scale-95 tv-btn-focus focus:outline-none flex items-center justify-center"
                >
                  {displayChar}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Action Row */}
      <div
        data-nav-row="vk-actions"
        className="flex items-center justify-between gap-2 pt-1.5 border-t border-white/10"
      >
        <button
          type="button"
          onClick={onClear}
          tabIndex={0}
          className="px-3 py-1.5 rounded-xl bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white text-xs font-bold border border-red-500/30 transition-colors tv-btn-focus focus:outline-none"
        >
          Очистити
        </button>
        <button
          type="button"
          onClick={() => onKeyPress(' ')}
          tabIndex={0}
          className="flex-1 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold border border-white/10 transition-colors tv-btn-focus focus:outline-none text-center"
        >
          ␣ Пробіл
        </button>
        <button
          type="button"
          onClick={onBackspace}
          tabIndex={0}
          className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-600 text-amber-300 hover:text-white text-xs font-bold border border-amber-500/30 transition-colors tv-btn-focus focus:outline-none"
        >
          ⌫ Стерти
        </button>
        <button
          type="button"
          onClick={onSubmitField || onClose}
          tabIndex={0}
          className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold border border-emerald-400 shadow transition-colors tv-btn-focus focus:outline-none"
        >
          ✓ Готово
        </button>
      </div>
    </div>
  );
};

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onDataSync,
  onResumeRemoteSession,
}) => {
  const [profile, setProfile] = useState<UserProfile | null>(authSyncService.getProfile());
  const [activeTab, setActiveTab] = useState<'cloud' | 'pair' | 'devices' | 'backup'>('cloud');

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

  const [devices, setDevices] = useState<ConnectedDevice[]>(authSyncService.getConnectedDevices());
  const [activeSession, setActiveSession] = useState<ActiveSessionState | null>(
    authSyncService.getActiveSession()
  );

  // Smart TV & Projector Remote Virtual Keyboard State
  const [showTvKeyboard, setShowTvKeyboard] = useState<boolean>(false);
  const [activeField, setActiveField] = useState<'email' | 'name' | 'pin' | 'token' | 'backup'>(
    'email'
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const firstTabRef = useRef<HTMLButtonElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const loginSubmitBtnRef = useRef<HTMLButtonElement>(null);
  const pairSubmitBtnRef = useRef<HTMLButtonElement>(null);
  const vkFirstKeyRef = useRef<HTMLButtonElement>(null);

  // Autofocus on modal open so D-Pad navigation works immediately on Projectors & Smart TV
  useEffect(() => {
    if (!isOpen) return;
    setDevices(authSyncService.getConnectedDevices());
    setActiveSession(authSyncService.getActiveSession());
    const tId = setTimeout(() => {
      if (!authSyncService.getProfile()) {
        (emailInputRef.current || firstTabRef.current)?.focus({ preventScroll: true });
      } else {
        firstTabRef.current?.focus({ preventScroll: true });
      }
    }, 80);
    return () => clearTimeout(tId);
  }, [isOpen]);

  const openKeyboardForField = (
    field: 'email' | 'name' | 'pin' | 'token' | 'backup',
    autoFocusFirstKey = false
  ) => {
    setActiveField(field);
    setShowTvKeyboard(true);
    try {
      if (
        (window as any).AndroidCinemaBridge &&
        typeof (window as any).AndroidCinemaBridge.showKeyboard === 'function'
      ) {
        (window as any).AndroidCinemaBridge.showKeyboard();
      }
    } catch {}

    if (autoFocusFirstKey) {
      setTimeout(() => {
        if (vkFirstKeyRef.current) {
          vkFirstKeyRef.current.focus({ preventScroll: true });
          scrollElementIntoViewSafe(vkFirstKeyRef.current);
        }
      }, 90);
    }
  };

  const triggerFieldFocus = (field: 'email' | 'name' | 'pin' | 'token' | 'backup') => {
    setActiveField(field);
    try {
      if (
        (window as any).AndroidCinemaBridge &&
        typeof (window as any).AndroidCinemaBridge.showKeyboard === 'function'
      ) {
        (window as any).AndroidCinemaBridge.showKeyboard();
      }
    } catch {}
  };

  const handleInputKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    field: 'email' | 'name' | 'pin' | 'token' | 'backup'
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      openKeyboardForField(field, true);
    }
  };

  const handleVirtualKeyPress = (char: string) => {
    if (activeField === 'email') setGoogleEmail((prev) => prev + char);
    else if (activeField === 'name') setGoogleName((prev) => prev + char);
    else if (activeField === 'pin') setGooglePin((prev) => prev + char);
    else if (activeField === 'token') setInputSyncToken((prev) => (prev + char).toUpperCase());
    else if (activeField === 'backup') setImportJsonText((prev) => prev + char);
  };

  const handleVirtualBackspace = () => {
    if (activeField === 'email') setGoogleEmail((prev) => prev.slice(0, -1));
    else if (activeField === 'name') setGoogleName((prev) => prev.slice(0, -1));
    else if (activeField === 'pin') setGooglePin((prev) => prev.slice(0, -1));
    else if (activeField === 'token') setInputSyncToken((prev) => prev.slice(0, -1));
    else if (activeField === 'backup') setImportJsonText((prev) => prev.slice(0, -1));
  };

  const handleVirtualClear = () => {
    if (activeField === 'email') setGoogleEmail('');
    else if (activeField === 'name') setGoogleName('');
    else if (activeField === 'pin') setGooglePin('');
    else if (activeField === 'token') setInputSyncToken('');
    else if (activeField === 'backup') setImportJsonText('');
  };

  const handleVirtualPreset = (preset: string) => {
    if (activeField === 'email') {
      if (preset.startsWith('@') && googleEmail.includes('@')) {
        const username = googleEmail.split('@')[0];
        setGoogleEmail(username + preset);
      } else {
        setGoogleEmail((prev) => prev + preset);
      }
    } else if (activeField === 'token') {
      if (preset === 'CV-') {
        setInputSyncToken((prev) =>
          prev.startsWith('CV-') ? prev : 'CV-' + prev.replace(/^CV-?/i, '')
        );
      } else {
        setInputSyncToken((prev) => (prev + preset).toUpperCase());
      }
    } else {
      handleVirtualKeyPress(preset);
    }
  };

  const handleKeyboardDone = () => {
    setShowTvKeyboard(false);
    setTimeout(() => {
      if (activeTab === 'pair' && pairSubmitBtnRef.current) {
        pairSubmitBtnRef.current.focus({ preventScroll: true });
        scrollElementIntoViewSafe(pairSubmitBtnRef.current);
      } else if (activeTab === 'cloud' && loginSubmitBtnRef.current) {
        loginSubmitBtnRef.current.focus({ preventScroll: true });
        scrollElementIntoViewSafe(loginSubmitBtnRef.current);
      }
    }, 60);
  };

  useEffect(() => {
    const handleCinemaInputFocus = (e: any) => {
      const target = e.detail?.target as HTMLElement | undefined;
      const source = e.detail?.source as string | undefined;
      if (!target) return;

      let field: 'email' | 'name' | 'pin' | 'token' | 'backup' = 'email';
      const dataField = target.getAttribute('data-sync-field') as any;
      if (dataField) {
        field = dataField;
      } else if (
        target.getAttribute('type') === 'email' ||
        target.getAttribute('placeholder')?.includes('email')
      ) {
        field = 'email';
      } else if (target.getAttribute('placeholder')?.includes('CV-')) {
        field = 'token';
      } else if (target.getAttribute('type') === 'password') {
        field = 'pin';
      } else if (target.tagName === 'TEXTAREA') {
        field = 'backup';
      }

      setActiveField(field);
      // When user presses OK/Enter on remote (dpad-enter) or clicks the field, open the built-in TV keyboard automatically!
      if (source === 'dpad-enter' || source === 'keyboard-enter') {
        openKeyboardForField(field, true);
      }
    };
    window.addEventListener('cinema-input-focus', handleCinemaInputFocus);
    return () => window.removeEventListener('cinema-input-focus', handleCinemaInputFocus);
  }, []);

  useEffect(() => {
    const unsubProfile = authSyncService.subscribe((p) => {
      setProfile(p);
      setDevices(authSyncService.getConnectedDevices());
      setActiveSession(authSyncService.getActiveSession());
    });
    const unsubData = authSyncService.subscribeDataChanges(() => {
      setDevices(authSyncService.getConnectedDevices());
      setActiveSession(authSyncService.getActiveSession());
    });
    return () => {
      unsubProfile();
      unsubData();
    };
  }, []);

  if (!isOpen) return null;

  const favCount = storageService.getFavorites().length;
  const histCount = storageService.getHistory().length;
  const myDeviceId = authSyncService.getCurrentDeviceId();

  const getCurrentFieldValue = () => {
    if (activeField === 'email') return googleEmail;
    if (activeField === 'name') return googleName;
    if (activeField === 'pin') return googlePin;
    if (activeField === 'token') return inputSyncToken;
    return importJsonText;
  };

  const showTempSuccess = (msg: string) => {
    setErrorMsg(null);
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleGoogleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleEmail.trim()) {
      setErrorMsg('Будь ласка, вкажіть ваш Google Email');
      openKeyboardForField('email', true);
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
      setShowTvKeyboard(false);
      showTempSuccess(
        'Успішний вхід! Ваша медіатека, обране, пристрої та прогрес переглядів об’єднані в єдину екосистему.'
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
      openKeyboardForField('token', true);
      return;
    }
    setErrorMsg(null);
    setIsSyncing(true);
    try {
      const ok = await authSyncService.linkDeviceWithSyncToken(inputSyncToken.trim());
      if (ok) {
        setShowTvKeyboard(false);
        showTempSuccess('Пристрій успішно підключено до екосистеми! Усі дані перенесено.');
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
      setDevices(authSyncService.getConnectedDevices());
      setActiveSession(authSyncService.getActiveSession());
      showTempSuccess('Екосистему пристроїв, обране та позиції перегляду синхронізовано!');
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
      setShowTvKeyboard(false);
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

  const formatRelativeTime = (ts: number) => {
    if (!ts) return 'щойно';
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 60) return 'онлайн (щойно)';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} хв тому`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} год тому`;
    return new Date(ts).toLocaleDateString('uk-UA');
  };

  const formatTimeSec = (sec: number) => {
    const s = Math.max(0, Math.floor(sec || 0));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const rem = s % 60;
    if (hrs > 0) {
      return `${hrs}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
    }
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  return (
    <div
      data-modal-scope="true"
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
                <span>Екосистема & Синхронізація</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  REALTIME v3.7.4
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Єдиний стан відтворення, обране та керування пристроями (ТБ, Проєктор, ПК, Смартфон)
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
        <div
          data-nav-row="auth-modal-tabs"
          className="flex items-center gap-1.5 px-5 pt-3 border-b border-white/10 bg-[#0b101d] overflow-x-auto scrollbar-none"
        >
          <button
            ref={firstTabRef}
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
            <span>Код для ТВ / Проєктора</span>
          </button>

          <button
            onClick={() => setActiveTab('devices')}
            tabIndex={0}
            className={`pb-2.5 px-3 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap flex items-center gap-1.5 transition-all tv-btn-focus focus:outline-none ${
              activeTab === 'devices'
                ? 'border-purple-500 text-purple-400'
                : 'border-transparent text-slate-400 hover:text-white'
            }`}
          >
            <Laptop className="w-4 h-4" />
            <span>Пристрої ({devices.length})</span>
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
          {/* Active Cross-Device Session Handoff Banner */}
          {activeSession && activeSession.title && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-950/50 via-red-950/40 to-slate-900 border border-amber-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0">
                  <Radio className="w-5 h-5 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
                    <span>
                      {activeSession.isPlaying ? '▶ Зараз відтворюється' : '⏸ На паузі'} •{' '}
                      {activeSession.deviceName || 'Підключений пристрій'}
                    </span>
                  </div>
                  <h4 className="text-xs sm:text-sm font-black text-white truncate">
                    {activeSession.title}
                    {activeSession.seasonNumber
                      ? ` (С${activeSession.seasonNumber}:Е${activeSession.episodeNumber || 1})`
                      : ''}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Позиція: {formatTimeSec(activeSession.currentTime)} /{' '}
                    {formatTimeSec(activeSession.duration)} •{' '}
                    {formatRelativeTime(activeSession.updatedAt)}
                  </p>
                </div>
              </div>

              {onResumeRemoteSession && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onResumeRemoteSession(activeSession);
                  }}
                  tabIndex={0}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shrink-0 shadow-lg shadow-amber-500/20 tv-btn-focus focus:outline-none"
                >
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Продовжити тут</span>
                </button>
              )}
            </div>
          )}

          {/* Current Device Vault Summary */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-red-500/15 text-red-400">
                <Heart className="w-4 h-4 fill-current" />
              </div>
              <div>
                <div className="text-sm sm:text-base font-black text-white">{favCount}</div>
                <div className="text-[10px] text-slate-400">Обране</div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
                <History className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm sm:text-base font-black text-white">{histCount}</div>
                <div className="text-[10px] text-slate-400">Історія</div>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400">
                <Laptop className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm sm:text-base font-black text-white">{devices.length}</div>
                <div className="text-[10px] text-slate-400">Пристрої</div>
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
                          <span>Екосистема активна • Real-time SSE</span>
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
                      <span>Як підключити проєктор, Smart TV або інший пристрій?</span>
                    </div>
                    <p className="text-slate-400 leading-relaxed">
                      1. Увійдіть з тим самим Email (<strong>{profile.email}</strong>) на іншому пристрої, або введіть ваш персональний код{' '}
                      <strong className="text-amber-300 font-mono">{profile.syncToken}</strong> у вкладці «Код для ТВ / Проєктора».
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActiveTab('pair')}
                        tabIndex={0}
                        className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-white flex items-center gap-1.5 tv-btn-focus focus:outline-none"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                        <span>Код та QR підключення</span>
                      </button>

                      <button
                        onClick={() => setActiveTab('devices')}
                        tabIndex={0}
                        className="px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/30 text-xs font-bold text-purple-300 flex items-center gap-1.5 tv-btn-focus focus:outline-none"
                      >
                        <Laptop className="w-3.5 h-3.5" />
                        <span>Керувати пристроями ({devices.length})</span>
                      </button>
                    </div>

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
                      Введіть ваш Email на смартфоні, ПК та проєкторі/телевізорі (на пульті натисніть <strong>OK</strong> на полі введення, щоб відкрити екранну клавіатуру) — додаток автоматично об’єднає всі ваші пристрої!
                    </p>
                  </div>

                  <form onSubmit={handleGoogleLogin} className="space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-300 mb-1.5">
                        Ваш Google / Email (натисніть OK на пульті для виклику клавіатури):
                      </label>
                      <input
                        ref={emailInputRef}
                        type="email"
                        data-sync-field="email"
                        value={googleEmail}
                        onFocus={() => triggerFieldFocus('email')}
                        onClick={() => openKeyboardForField('email', false)}
                        onKeyDown={(e) => handleInputKeyDown(e, 'email')}
                        onChange={(e) => setGoogleEmail(e.target.value)}
                        placeholder="vash.email@gmail.com"
                        className={`w-full px-4 py-3 rounded-xl bg-black/50 border text-sm text-white placeholder-slate-500 focus:outline-none transition-all ${
                          activeField === 'email' && showTvKeyboard
                            ? 'border-blue-400 ring-2 ring-blue-500/30'
                            : 'border-white/15 focus:border-blue-500'
                        }`}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        type="text"
                        data-sync-field="name"
                        value={googleName}
                        onFocus={() => triggerFieldFocus('name')}
                        onClick={() => openKeyboardForField('name', false)}
                        onKeyDown={(e) => handleInputKeyDown(e, 'name')}
                        onChange={(e) => setGoogleName(e.target.value)}
                        placeholder="Ваше ім'я (необов'язково)"
                        className={`w-full px-3.5 py-2.5 rounded-xl bg-black/40 border text-xs text-white placeholder-slate-500 focus:outline-none ${
                          activeField === 'name' && showTvKeyboard
                            ? 'border-blue-400 ring-2 ring-blue-500/30'
                            : 'border-white/10 focus:border-blue-500'
                        }`}
                      />
                      <input
                        type="password"
                        data-sync-field="pin"
                        value={googlePin}
                        onFocus={() => triggerFieldFocus('pin')}
                        onClick={() => openKeyboardForField('pin', false)}
                        onKeyDown={(e) => handleInputKeyDown(e, 'pin')}
                        onChange={(e) => setGooglePin(e.target.value)}
                        placeholder="Секретний PIN (необов'язково)"
                        className={`w-full px-3.5 py-2.5 rounded-xl bg-black/40 border text-xs text-white placeholder-slate-500 focus:outline-none ${
                          activeField === 'pin' && showTvKeyboard
                            ? 'border-blue-400 ring-2 ring-blue-500/30'
                            : 'border-white/10 focus:border-blue-500'
                        }`}
                      />
                    </div>

                    {/* Smart TV & Projector Remote Virtual Keyboard Toggle */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = !showTvKeyboard;
                        setShowTvKeyboard(next);
                        if (next) openKeyboardForField(activeField, true);
                      }}
                      tabIndex={0}
                      className="w-full py-2.5 px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/35 border border-blue-400/40 text-xs font-extrabold text-blue-200 hover:text-white flex items-center justify-center gap-2 transition-all tv-btn-focus focus:outline-none"
                    >
                      <Keyboard className="w-4 h-4 text-blue-400" />
                      <span>
                        {showTvKeyboard
                          ? 'Приховати екранну клавіатуру пульта'
                          : '⌨️ Відкрити екранну клавіатуру для пульта ТВ / Проєктора'}
                      </span>
                    </button>

                    {showTvKeyboard && (
                      <TvVirtualKeyboard
                        firstKeyRef={vkFirstKeyRef}
                        activeInputName={
                          activeField === 'email'
                            ? 'Email'
                            : activeField === 'name'
                              ? "Ім'я"
                              : 'PIN'
                        }
                        currentValue={getCurrentFieldValue()}
                        onKeyPress={handleVirtualKeyPress}
                        onBackspace={handleVirtualBackspace}
                        onClear={handleVirtualClear}
                        onPreset={handleVirtualPreset}
                        onClose={handleKeyboardDone}
                        onSubmitField={handleKeyboardDone}
                      />
                    )}

                    <button
                      ref={loginSubmitBtnRef}
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
                      value={`https://vinegret.net/prostye-poleznye-programmy-dlja-windows/?cv_sync=${profile.syncToken}`}
                      size={104}
                      level="M"
                    />
                  </div>
                  <div className="space-y-2 text-center sm:text-left flex-1">
                    <h4 className="text-xs sm:text-sm font-extrabold text-white">
                      Ваш персональний код синхронізації:
                    </h4>
                    <p className="text-xs text-slate-400">
                      Введіть цей 6-значний код на вашому Smart TV, проєкторі, ПК чи смартфоні:
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
                        {copied ? (
                          <Check className="w-4 h-4 text-emerald-400" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                        <span>Копіювати</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <form
                onSubmit={handleLinkDevice}
                className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3"
              >
                <label className="block text-xs sm:text-sm font-extrabold text-white">
                  Підключити цей пристрій за кодом з іншого девайса:
                </label>
                <p className="text-xs text-slate-400">
                  Натисніть <strong>OK</strong> на полі введення, щоб викликати клавіатуру пульта, введіть код формату{' '}
                  <span className="font-mono text-amber-300">CV-XXXXXX</span> та натисніть «Підключити»:
                </p>
                <div className="flex gap-2">
                  <input
                    ref={tokenInputRef}
                    type="text"
                    data-sync-field="token"
                    value={inputSyncToken}
                    onFocus={() => triggerFieldFocus('token')}
                    onClick={() => openKeyboardForField('token', false)}
                    onKeyDown={(e) => handleInputKeyDown(e, 'token')}
                    onChange={(e) => setInputSyncToken(e.target.value.toUpperCase())}
                    placeholder="CV-XXXXXX"
                    className={`flex-1 px-4 py-3 rounded-xl bg-black/50 border text-sm text-center font-mono font-black tracking-widest text-amber-300 placeholder-slate-600 focus:outline-none ${
                      activeField === 'token' && showTvKeyboard
                        ? 'border-amber-400 ring-2 ring-amber-500/30'
                        : 'border-white/15 focus:border-amber-400'
                    }`}
                  />
                  <button
                    ref={pairSubmitBtnRef}
                    type="submit"
                    disabled={isSyncing}
                    tabIndex={0}
                    className="px-5 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm shrink-0 shadow-lg shadow-amber-500/20 active:scale-95 transition-all tv-btn-focus focus:outline-none"
                  >
                    Підключити
                  </button>
                </div>

                {/* Smart TV & Projector Remote Virtual Keyboard Toggle */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !showTvKeyboard;
                    setShowTvKeyboard(next);
                    if (next) openKeyboardForField('token', true);
                  }}
                  tabIndex={0}
                  className="w-full py-2.5 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/30 border border-amber-400/40 text-xs font-extrabold text-amber-200 hover:text-white flex items-center justify-center gap-2 transition-all tv-btn-focus focus:outline-none"
                >
                  <Keyboard className="w-4 h-4 text-amber-400" />
                  <span>
                    {showTvKeyboard
                      ? 'Приховати екранну клавіатуру пульта'
                      : '⌨️ Викликати клавіатуру пульта ТВ / Проєктора'}
                  </span>
                </button>

                {showTvKeyboard && (
                  <TvVirtualKeyboard
                    firstKeyRef={vkFirstKeyRef}
                    activeInputName="Код синхронізації (CV-XXXXXX)"
                    currentValue={inputSyncToken}
                    onKeyPress={handleVirtualKeyPress}
                    onBackspace={handleVirtualBackspace}
                    onClear={handleVirtualClear}
                    onPreset={handleVirtualPreset}
                    onClose={handleKeyboardDone}
                    onSubmitField={handleKeyboardDone}
                  />
                )}
              </form>
            </div>
          )}

          {/* TAB 3: CONNECTED DEVICES ECOSYSTEM MANAGEMENT */}
          {activeTab === 'devices' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-purple-950/30 border border-purple-500/30 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h4 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-2">
                    <Laptop className="w-4 h-4 text-purple-400" />
                    <span>Підключені пристрої вашої екосистеми</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Усі пристрої автоматично синхронізують позицію перегляду, паузу, серії та обране.
                  </p>
                </div>
                {profile && (
                  <button
                    type="button"
                    onClick={handleManualSync}
                    disabled={isSyncing}
                    tabIndex={0}
                    className="px-3 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 tv-btn-focus focus:outline-none"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>Оновити</span>
                  </button>
                )}
              </div>

              <div className="space-y-2.5">
                {devices.map((dev) => {
                  const isThisDevice = dev.deviceId === myDeviceId;
                  return (
                    <div
                      key={dev.deviceId}
                      className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                        isThisDevice
                          ? 'bg-blue-950/30 border-blue-500/40'
                          : 'bg-white/[0.03] border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`p-2.5 rounded-xl shrink-0 ${
                            dev.isOnline
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {dev.deviceType?.includes('ТВ') || dev.deviceType?.includes('Проєктор') ? (
                            <Tv className="w-5 h-5" />
                          ) : dev.platform === 'windows' || dev.platform === 'macos' ? (
                            <Laptop className="w-5 h-5" />
                          ) : (
                            <Smartphone className="w-5 h-5" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs sm:text-sm font-extrabold text-white truncate">
                              {dev.deviceName}
                            </span>
                            {isThisDevice && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/25 text-blue-300 border border-blue-500/40">
                                Цей пристрій
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                                dev.isOnline
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-white/10 text-slate-400'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  dev.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                                }`}
                              />
                              {dev.isOnline ? 'Онлайн' : 'Офлайн'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2 mt-0.5">
                            <span>{dev.deviceType}</span>
                            <span>•</span>
                            <span>v{dev.appVersion || '3.7.4'}</span>
                            <span>•</span>
                            <span>Активність: {formatRelativeTime(dev.lastActiveAt)}</span>
                          </div>
                          {dev.currentMediaTitle && (
                            <div className="text-[11px] text-amber-300 font-semibold truncate mt-0.5">
                              🎬 Дивиться: {dev.currentMediaTitle}
                            </div>
                          )}
                        </div>
                      </div>

                      {!isThisDevice && profile && (
                        <button
                          type="button"
                          onClick={async () => {
                            await authSyncService.disconnectDevice(dev.deviceId);
                            setDevices(authSyncService.getConnectedDevices());
                            showTempSuccess(`Пристрій «${dev.deviceName}» відключено від акаунту.`);
                          }}
                          tabIndex={0}
                          className="px-3 py-2 rounded-xl bg-red-950/60 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30 text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors tv-btn-focus focus:outline-none"
                          title="Відключити пристрій від синхронізації"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Відключити</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 4: PORTABLE BACKUP (EXPORT / IMPORT) */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <h4 className="text-xs sm:text-sm font-extrabold text-white">
                  Експорт та збереження ваших даних (100% автономно)
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Ви можете зберегти повну резервну копію вашого профілю, списку обраних фільмів та історії переглядів у файл{' '}
                  <code className="text-emerald-300">.json</code> або скопіювати в буфер обміну.
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
                      data-sync-field="backup"
                      value={importJsonText}
                      onFocus={() => triggerFieldFocus('backup')}
                      onClick={() => openKeyboardForField('backup', false)}
                      onKeyDown={(e) => handleInputKeyDown(e, 'backup')}
                      onChange={(e) => setImportJsonText(e.target.value)}
                      rows={4}
                      placeholder='Вставте сюди скопійований JSON резервної копії {"app": "CinemaVault PRO"...}'
                      className="w-full p-3 rounded-xl bg-black/60 border border-white/15 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      onClick={handleImportJsonSubmit}
                      tabIndex={0}
                      className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs tv-btn-focus focus:outline-none"
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
