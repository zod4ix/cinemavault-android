import { httpGetJson } from './tmdb';

export const APP_VERSION = '3.7.5';
export const GITHUB_REPO = 'zod4ix/cinemavault-android';
export const DEFAULT_APK_URL = `https://github.com/${GITHUB_REPO}/raw/main/CinemaVault-PRO-v${APP_VERSION}.apk`;
export const DEFAULT_WIN_URL = `https://github.com/${GITHUB_REPO}/releases/download/v${APP_VERSION}/CinemaVault-PRO-v${APP_VERSION}-Windows.exe`;
export const DEFAULT_MAC_URL = `https://github.com/${GITHUB_REPO}/releases/download/v${APP_VERSION}/CinemaVault-PRO-v${APP_VERSION}-macOS.dmg`;
export const GITHUB_RELEASE_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;
export const VINEGRET_PORTAL_URL = 'https://vinegret.net/prostye-poleznye-programmy-dlja-windows/';

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  apkDownloadUrl: string;
  winDownloadUrl: string;
  macDownloadUrl: string;
  releasePageUrl: string;
  releaseNotes: string;
  publishedAt: string;
  checkedAt: number;
}

const DISMISSED_VERSION_KEY = 'cinemavault_dismissed_update_version';

function parseSemver(v: string): number[] {
  const clean = (v || '').replace(/^v/i, '').trim();
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)(?:[.-]([a-zA-Z0-9]+))?$/);
  if (match) {
    const major = parseInt(match[1], 10) || 0;
    const minor = parseInt(match[2], 10) || 0;
    const patch = parseInt(match[3], 10) || 0;
    let extra = 0;
    if (match[4]) {
      const num = parseInt(match[4], 10);
      if (!isNaN(num)) {
        extra = num;
      } else {
        extra = match[4].toLowerCase().charCodeAt(0) - 96;
      }
    }
    return [major, minor, patch, extra];
  }
  const parts = clean.split(/[.-]/).map((n) => parseInt(n, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts[3] || 0];
}

export function isNewerVersion(current: string, remote: string): boolean {
  const c = parseSemver(current);
  const r = parseSemver(remote);
  for (let i = 0; i < 4; i++) {
    if (r[i] > c[i]) return true;
    if (r[i] < c[i]) return false;
  }
  return false;
}

export interface ApkDownloadProgress {
  status: 'idle' | 'downloading' | 'installing' | 'permission' | 'ready' | 'error';
  percent: number;
  message: string;
}

type ProgressListener = (state: ApkDownloadProgress) => void;
const progressListeners = new Set<ProgressListener>();
let currentDownloadState: ApkDownloadProgress = {
  status: 'idle',
  percent: 0,
  message: '',
};

if (typeof window !== 'undefined') {
  (window as any).__cinemaOnApkDownloadProgress = (
    status: ApkDownloadProgress['status'],
    percent: number,
    message: string
  ) => {
    currentDownloadState = { status, percent, message };
    progressListeners.forEach((cb) => cb(currentDownloadState));
  };
}

export function subscribeApkDownloadProgress(cb: ProgressListener): () => void {
  progressListeners.add(cb);
  cb(currentDownloadState);
  return () => {
    progressListeners.delete(cb);
  };
}

export function openExternalDownload(url: string) {
  try {
    const win = window as any;
    const lower = url.toLowerCase();
    const isInstallerAsset =
      lower.includes('.apk') || lower.includes('.exe') || lower.includes('.dmg');
    if (isInstallerAsset && win.AndroidCinemaBridge?.downloadAndInstallApk) {
      win.AndroidCinemaBridge.downloadAndInstallApk(url);
      return;
    }
    if (win.AndroidCinemaBridge?.openExternalUrl) {
      win.AndroidCinemaBridge.openExternalUrl(url);
      return;
    }
  } catch {
    // fallback
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export const updaterService = {
  getCurrentVersion(): string {
    return APP_VERSION;
  },

  isDismissed(version: string): boolean {
    try {
      return localStorage.getItem(DISMISSED_VERSION_KEY) === version;
    } catch {
      return false;
    }
  },

  dismissVersion(version: string) {
    try {
      localStorage.setItem(DISMISSED_VERSION_KEY, version);
    } catch {
      // ignore
    }
  },

  async checkForUpdates(): Promise<UpdateInfo> {
    let latestVersion = APP_VERSION;
    let apkDownloadUrl = DEFAULT_APK_URL;
    let winDownloadUrl = DEFAULT_WIN_URL;
    let macDownloadUrl = DEFAULT_MAC_URL;
    let releasePageUrl = GITHUB_RELEASE_PAGE;
    let releaseNotes =
      '• 🚀 ОФІЦІЙНИЙ РЕЛІЗ 3.7.5: БЕЗШОВНИЙ DEEP LINKING, НАДСИЛАННЯ ФІЛЬМІВ ДРУГУ В ДОДАТКУ ЗА ID, ВИПРАВЛЕННЯ ВВЕДЕННЯ ПОШТИ НА ПРОЄКТОРАХ ТА МАКСИМАЛЬНА БЕЗПЕКА WINDOWS & ANDROID:\n' +
      '• 🔗 РОЗУМНЕ ПОДІЛИТИСЯ ТА ПРЯМЕ НАДСИЛАННЯ ДРУГУ ЗА ID: нове вікно «Надіслати другу в CinemaVault» за персональним ID з миттєвою доставкою контенту на екран друга, швидкі коди фільмів та оновлена інтеграція Viber, Telegram і WhatsApp.\n' +
      '• ⌨️ ВИПРАВЛЕНО ВВЕДЕННЯ EMAIL ТА ФОКУС НА ПРОЄКТОРАХ: усунено конфлікт фокусування WebView, через який курсор злітав з поля поштової адреси; автоматичне безшовне відкриття екранної пульт-клавіатури для ТВ та проєкторів.\n' +
      '• 💻 БЕЗПЕКА WINDOWS ТА ЗАХИСТ ВІД SMARTSCREEN: повні метадані PE-видавця Vinegret.Net, безпечна пісочниця Electron, обробка схеми cinemavault:// без шелл-ін\'єкцій та захист користувача від сторонніх редиректів.\n' +
      '• 📱 ANDROID 16 & SMART TV READY: стабільна робота на всіх типах пультів (D-Pad, Air Mouse, проєкторний режим курсора), апаратне прискорення 60 FPS та відсутність реклами.';
    let publishedAt = new Date().toISOString().slice(0, 10);

    try {
      const bust = Date.now();
      // 1. Check GitHub Releases API
      const rel = await httpGetJson(
        `https://api.github.com/repos/${GITHUB_REPO}/releases/latest?t=${bust}`,
        5500
      );
      if (rel && typeof rel.tag_name === 'string') {
        const tagVer = rel.tag_name.replace(/^v/i, '').trim();
        if (tagVer) {
          latestVersion = tagVer;
          apkDownloadUrl = `https://github.com/${GITHUB_REPO}/raw/main/CinemaVault-PRO-v${tagVer}.apk`;
          winDownloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${tagVer}/CinemaVault-PRO-v${tagVer}-Windows.exe`;
          macDownloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${tagVer}/CinemaVault-PRO-v${tagVer}-macOS.dmg`;
        }
        if (rel.html_url) releasePageUrl = rel.html_url;
        if (rel.body && typeof rel.body === 'string' && rel.body.trim().length > 10) {
          releaseNotes = rel.body.trim();
        }
        if (rel.published_at) {
          publishedAt = String(rel.published_at).slice(0, 10);
        }
        // Check if release has attached .apk / .exe / .dmg assets
        if (Array.isArray(rel.assets)) {
          const apkAsset = rel.assets.find(
            (a: any) =>
              typeof a?.browser_download_url === 'string' &&
              a.browser_download_url.toLowerCase().endsWith('.apk')
          );
          if (apkAsset) {
            apkDownloadUrl = apkAsset.browser_download_url;
          }
          const winAsset = rel.assets.find(
            (a: any) =>
              typeof a?.browser_download_url === 'string' &&
              a.browser_download_url.toLowerCase().endsWith('.exe')
          );
          if (winAsset) {
            winDownloadUrl = winAsset.browser_download_url;
          }
          const macAsset = rel.assets.find(
            (a: any) =>
              typeof a?.browser_download_url === 'string' &&
              a.browser_download_url.toLowerCase().endsWith('.dmg')
          );
          if (macAsset) {
            macDownloadUrl = macAsset.browser_download_url;
          }
        }
      }

      // 2. Also check raw package.json on main branch (in case a new commit pushed a newer version before creating a release tag)
      const pkg = await httpGetJson(
        `https://raw.githubusercontent.com/${GITHUB_REPO}/main/package.json?t=${bust}`,
        5000
      );
      if (pkg && typeof pkg.version === 'string') {
        const pkgVer = pkg.version.replace(/^v/i, '').trim();
        if (isNewerVersion(latestVersion, pkgVer)) {
          latestVersion = pkgVer;
          apkDownloadUrl = `https://github.com/${GITHUB_REPO}/raw/main/CinemaVault-PRO-v${pkgVer}.apk`;
          winDownloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${pkgVer}/CinemaVault-PRO-v${pkgVer}-Windows.exe`;
          macDownloadUrl = `https://github.com/${GITHUB_REPO}/releases/download/v${pkgVer}/CinemaVault-PRO-v${pkgVer}-macOS.dmg`;
          if (typeof pkg.releaseNotes === 'string' && pkg.releaseNotes.trim().length > 10) {
            releaseNotes = pkg.releaseNotes.trim();
          }
        }
      }
    } catch {
      // Keep default info when offline
    }

    const hasUpdate = isNewerVersion(APP_VERSION, latestVersion);
    if (!hasUpdate) {
      latestVersion = APP_VERSION;
      apkDownloadUrl = DEFAULT_APK_URL;
      winDownloadUrl = DEFAULT_WIN_URL;
      macDownloadUrl = DEFAULT_MAC_URL;
    }

    return {
      currentVersion: APP_VERSION,
      latestVersion,
      hasUpdate,
      apkDownloadUrl,
      winDownloadUrl,
      macDownloadUrl,
      releasePageUrl,
      releaseNotes,
      publishedAt,
      checkedAt: Date.now(),
    };
  },
};
