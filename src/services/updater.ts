import { httpGetJson } from './tmdb';

export const APP_VERSION = '3.7.0';
export const GITHUB_REPO = 'zod4ix/cinemavault-android';
export const DEFAULT_APK_URL = `https://github.com/${GITHUB_REPO}/raw/main/CinemaVault-PRO-v${APP_VERSION}.apk`;
export const GITHUB_RELEASE_PAGE = `https://github.com/${GITHUB_REPO}/releases/latest`;
export const VINEGRET_PORTAL_URL = 'https://vinegret.net/prostye-poleznye-programmy-dlja-windows/';

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  apkDownloadUrl: string;
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
    if (url.toLowerCase().includes('.apk') && win.AndroidCinemaBridge?.downloadAndInstallApk) {
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
    let releasePageUrl = GITHUB_RELEASE_PAGE;
    let releaseNotes =
      '• 🎬 ОФІЦІЙНИЙ РЕЛІЗ 3.7.0: ІНТЕЛЕКТУАЛЬНИЙ ПІДБІР «СХОЖИХ КАРТИН» (РЕКОМЕНДАЦІЇ): у картці кожного фільму додано автоматичну секцію схожих фільмів та серіалів на основі аналізу режисера, провідного акторського складу, сюжету, франшизи та жанру зі зручними бейджами-підказками.\n' +
      '• 👁️ ЧИСТИЙ ТА СТАБІЛЬНИЙ ПЛЕЄР: видалено застарілу кнопку «Око», яка блокувала керування у сторонніх iframe. Панелі тепер мають бездоганне плавне авто-приховування (3.8 с), зберігаючи повний доступ до таймлайну, аудіодоріжок та налаштувань за будь-якого дотику чи руху пульта.\n' +
      '• 🛡️ 100% ПОВНОЕКРАННИЙ РЕЖИМ ТА ШВИДКИЙ ПЕРЕХІД: сусідня кнопка «Повний екран» стабільно повертає пристрій у ландшафтну орієнтацію, а перегляд схожих картин дозволяє миттєво запускати або відкривати новий фільм в один клік без виходу з картки.\n' +
      '• 🚀 ОФІЦІЙНИЙ ЦИФРОВИЙ СЕРТИФІКАТ (net.cinemavault.pro): стабільна робота на Smart TV, планшетах, смартфонах та проєкторах із бездоганною цифровою репутацією.';
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
        }
        if (rel.html_url) releasePageUrl = rel.html_url;
        if (rel.body && typeof rel.body === 'string' && rel.body.trim().length > 10) {
          releaseNotes = rel.body.trim();
        }
        if (rel.published_at) {
          publishedAt = String(rel.published_at).slice(0, 10);
        }
        // Check if release has an attached .apk asset
        if (Array.isArray(rel.assets)) {
          const apkAsset = rel.assets.find(
            (a: any) => typeof a?.browser_download_url === 'string' && a.browser_download_url.endsWith('.apk')
          );
          if (apkAsset) {
            apkDownloadUrl = apkAsset.browser_download_url;
          }
        }
      }

      // 2. Also check raw package.json on main branch (in case a new commit pushed a newer APK before creating a release tag)
      const pkg = await httpGetJson(
        `https://raw.githubusercontent.com/${GITHUB_REPO}/main/package.json?t=${bust}`,
        5000
      );
      if (pkg && typeof pkg.version === 'string') {
        const pkgVer = pkg.version.replace(/^v/i, '').trim();
        if (isNewerVersion(latestVersion, pkgVer)) {
          latestVersion = pkgVer;
          apkDownloadUrl = `https://github.com/${GITHUB_REPO}/raw/main/CinemaVault-PRO-v${pkgVer}.apk`;
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
    }

    return {
      currentVersion: APP_VERSION,
      latestVersion,
      hasUpdate,
      apkDownloadUrl,
      releasePageUrl,
      releaseNotes,
      publishedAt,
      checkedAt: Date.now(),
    };
  },
};
