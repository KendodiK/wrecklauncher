const { contextBridge, ipcRenderer } = require('electron');

const AUTH_TOKEN_KEY = 'wrecklauncher.authToken';

function getAuthToken() {
  try {
    const t = localStorage.getItem(AUTH_TOKEN_KEY);
    return typeof t === 'string' && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

/** @param {string|null|undefined} token */
function setAuthToken(token) {
  try {
    const t = typeof token === 'string' ? token.trim() : '';
    if (!t) localStorage.removeItem(AUTH_TOKEN_KEY);
    else localStorage.setItem(AUTH_TOKEN_KEY, t);
  } catch {
    // ignore
  }
}

// Keep renderer localStorage in sync if main refreshes token.
ipcRenderer.on('auth:token-updated', (_event, token) => {
  setAuthToken(typeof token === 'string' ? token : null);
});
ipcRenderer.on('auth:token-cleared', () => {
  setAuthToken(null);
});

async function invokeWithTokenSync(channel, ...args) {
  const ch = String(channel || '');

  if (ch === 'user:get-token') {
    const local = getAuthToken();
    if (local) return local;
  }

  const result = await ipcRenderer.invoke(ch, ...args);

  if (ch === 'user:login' || ch === 'user:register' || ch === 'user:get-token') {
    if (typeof result === 'string' && result.trim()) {
      setAuthToken(result);
    }
  }

  return result;
}

async function resolveAuthToken() {
  const local = getAuthToken();
  if (local) return local;

  const fetched = await invokeWithTokenSync('user:get-token');
  return typeof fetched === 'string' && fetched.trim() ? fetched.trim() : null;
}

// Expose a focused, safe API for the renderer. This mirrors
// the patterns expected by your old ui.js (window.electronAPI
// and window.api.invoke / window.api.*).

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  toggleDevTools: () => ipcRenderer.send('window:toggle-devtools'),
  invoke: (channel, ...args) => invokeWithTokenSync(channel, ...args),

  // Controller helpers (serverless modules in Electron main)
  getToken: async () => {
    const local = getAuthToken();
    if (local) return local;
    return await invokeWithTokenSync('user:get-token');
  },
  login: async (username, password) => {
    const token = await ipcRenderer.invoke('user:login', username, password);
    if (typeof token === 'string' && token.trim()) setAuthToken(token);
    return token;
  },
  register: async (username, password, email) => {
    const token = await ipcRenderer.invoke('user:register', username, password, email);
    if (typeof token === 'string' && token.trim()) setAuthToken(token);
    return token;
  },
  getPlatformUserID: (platformName, platformUsername) => {
    return resolveAuthToken().then((token) =>
      ipcRenderer.invoke('user:get-platform-userid', token, platformName, platformUsername)
    );
  },
  createPlatform: (platformName) => {
    return resolveAuthToken().then((token) =>
      ipcRenderer.invoke('platform:create-platform', token, platformName)
    );
  },
  createPlatformUser: (platformName, platformUsername, platformPassword, platformProfileId) => {
    return resolveAuthToken().then((token) =>
      ipcRenderer.invoke('platform:create-user', token, platformName, platformUsername, platformPassword, platformProfileId)
    );
  },
  getPlatform: (platformName) => ipcRenderer.invoke('platform:get', platformName),
  //Steam
  getOwnedGamesFromSteam: (platformUsername) => {
    return resolveAuthToken().then((token) =>
      ipcRenderer.invoke('user:get-owned-games-from-steam', token, platformUsername)
    );
  },
  getSteamGameDetails: (appID, cc) => {
    return resolveAuthToken().then((token) =>
      ipcRenderer.invoke('steam:get-game-details', token, appID, cc)
    );
  },
  getSteamGameDetailsAndUpload: (appID, cc) => ipcRenderer.invoke('steam:get-game-details-and-upload', appID, cc),
  installSteamGame: (appID) => ipcRenderer.invoke('steam:install-game', appID),
  deleteSteamGame: (appID) => ipcRenderer.invoke('steam:delete-game', appID),
  storePageSteam: (appID) => ipcRenderer.invoke('steam:store-page', appID),
  runSteamGame: (appID) => ipcRenderer.invoke('steam:run-game', appID),
  getEpicInstalledGames: () => ipcRenderer.invoke('epic:get-installed-games'),
  //Pirate Sites
  cloudscraperFetch: (url, options) => ipcRenderer.invoke('cloudscraper:fetch', url, options),
  cloudscraperDodiRepacksHome: () => ipcRenderer.invoke('cloudscraper:dodi-repacks-home'),
  cloudscraperSearchByxatab: (query, page) => ipcRenderer.invoke('cloudscraper:search-byxatab', query, page),
  FitGirlMagnetLink: (gameName) => ipcRenderer.invoke('fitgirl:magnet-link', gameName),
  PcGamesTorrentMagnetLink: (gameName) => ipcRenderer.invoke('pcgamestorrent:magnet-link', gameName),
  // Torrent
  /**
   * Start downloading a torrent from a magnet URI.
   * Progress events are pushed automatically; subscribe with `onTorrentProgress`.
   * @param {string} magnetUri  Magnet URI returned by fetchFitGirlGameDirectDownloadLink (or any source).
   * @param {string} [savePath] Absolute directory path. Defaults to the OS Downloads folder.
   * @returns {Promise<import('./electron/models').TorrentProgress>} Initial snapshot.
   */
  torrentStart: (magnetUri, savePath) => ipcRenderer.invoke('torrent:start', magnetUri, savePath),
  /** @param {string} infoHash */
  torrentPause: (infoHash) => ipcRenderer.invoke('torrent:pause', infoHash),
  /** @param {string} infoHash */
  torrentResume: (infoHash) => ipcRenderer.invoke('torrent:resume', infoHash),
  /**
   * @param {string} infoHash
   * @param {boolean} [deleteFiles] Pass true to remove downloaded files from disk.
   */
  torrentRemove: (infoHash, deleteFiles) => ipcRenderer.invoke('torrent:remove', infoHash, deleteFiles),
  /** @returns {Promise<import('./electron/models').TorrentProgress[]>} */
  torrentGetStatus: () => ipcRenderer.invoke('torrent:get-status'),
  /**
   * Subscribe to live progress pushes from the main process.
   * Returns an unsubscribe function.
   * @param {(progress: import('./electron/models').TorrentProgress) => void} cb
   * @returns {() => void}
   */
  onTorrentProgress: (cb) => {
    const listener = (_event, progress) => cb(progress);
    ipcRenderer.on('torrent:progress', listener);
    return () => ipcRenderer.removeListener('torrent:progress', listener);
  },
  // GamesController
  getGames: (from) => ipcRenderer.invoke('games:get-games', from),
  getAllDetailsByID: (id) => ipcRenderer.invoke('games:get-all-details-by-id', id),
});

// Optional legacy-style alias used by some code paths
contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  toggleDevTools: () => ipcRenderer.send('window:toggle-devtools'),
  invoke: (channel, ...args) => invokeWithTokenSync(channel, ...args),
});
