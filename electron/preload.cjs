const { contextBridge, ipcRenderer } = require('electron');

const bridgeApi = {
  setPlayerFullscreen: (fullscreen) => {
    ipcRenderer.send('cinema-set-fullscreen', Boolean(fullscreen));
  },
  simulateScreenTap: (normX, normY) => {
    ipcRenderer.send('cinema-simulate-tap', Number(normX) || 0.5, Number(normY) || 0.5);
  },
  openExternalUrl: (url) => {
    if (typeof url === 'string' && url.trim()) {
      ipcRenderer.send('cinema-open-external', url.trim());
    }
  },
  downloadAndInstallApk: (url) => {
    if (typeof url === 'string' && url.trim()) {
      ipcRenderer.send('cinema-download-update', url.trim());
    }
  },
};

try {
  if (process.contextIsolated) {
    contextBridge.exposeInMainWorld('AndroidCinemaBridge', bridgeApi);
  } else {
    window.AndroidCinemaBridge = bridgeApi;
  }
} catch (err) {
  window.AndroidCinemaBridge = bridgeApi;
}
