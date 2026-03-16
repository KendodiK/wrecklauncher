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

function notifyAuthExpired() {
  setAuthToken(null);
  try {
    window.dispatchEvent(new CustomEvent('wreck:auth-expired'));
  } catch {
    // ignore
  }
}

ipcRenderer.on('auth:token-cleared', () => {
  notifyAuthExpired();
});

// Invokes an authed IPC channel: resolves the token, passes it as first arg,
// and fires wreck:auth-expired (→ login redirect) if auth fails.
async function invokeAuthed(channel, ...args) {
  const token = await resolveAuthToken();
  if (!token) {
    notifyAuthExpired();
    throw new Error('Missing auth token');
  }
  try {
    return await ipcRenderer.invoke(channel, token, ...args);
  } catch (err) {
    const msg = String(err?.message || '').toLowerCase();
    if (
      msg.includes('missing auth token') ||
      msg.includes('invalid token') ||
      msg.includes('unauthorized')
    ) {
      notifyAuthExpired();
    }
    throw err;
  }
}

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
    return invokeAuthed('user:get-platform-userid', platformName, platformUsername);
  },
  createPlatform: (platformName) => {
    return invokeAuthed('platform:create-platform', platformName);
  },
  createPlatformUser: (platformName, platformUsername, platformPassword, platformProfileId) => {
    return invokeAuthed('platform:create-user', platformName, platformUsername, platformPassword, platformProfileId);
  },
  createSteamPlatformUser: (platformUsername, platformProfileLink) => {
    return invokeAuthed('steam:create-user', platformUsername, platformProfileLink);
  },
  getPlatformUsers: () => {
    return invokeAuthed('platform:get-users');
  },
  deletePlatformUser: (platformUserId) => {
    return invokeAuthed('platform:delete-user', platformUserId);
  },
  getPlatform: (platformName) => ipcRenderer.invoke('platform:get', platformName),
  //Steam
  getOwnedGamesFromSteam: (platformUsername) => {
    return invokeAuthed('user:get-owned-games-from-steam', platformUsername);
  },
  getSteamGameDetails: (appID, cc) => {
    return invokeAuthed('steam:get-game-details', appID, cc);
  },
  getSteamGameDetailsAndUpload: (appID, cc) => ipcRenderer.invoke('steam:get-game-details-and-upload', appID, cc),
  installSteamGame: (appID) => ipcRenderer.invoke('steam:install-game', appID),
  deleteSteamGame: (appID) => ipcRenderer.invoke('steam:delete-game', appID),
  storePageSteam: (appID) => ipcRenderer.invoke('steam:store-page', appID),
  runSteamGame: (appID) => ipcRenderer.invoke('steam:run-game', appID),
  getEpicInstalledGames: () => ipcRenderer.invoke('epic:get-installed-games'),
  // itch.io
  getItchInstalledGames: () => ipcRenderer.invoke('itch:get-installed-games'),
  getItchGameDetails: (gameId) => {
    return invokeAuthed('itch:get-game-details', gameId);
  },
  openItchGame: (gameId) => ipcRenderer.invoke('itch:open-game', gameId),
  installItchGame: (gameId) => ipcRenderer.invoke('itch:install-game', gameId),
  // GOG
  getGogInstalledGames: () => ipcRenderer.invoke('gog:get-installed-games'),
  getGogGameDetails: (productId) => {
    return invokeAuthed('gog:get-game-details', productId);
  },
  openGogGame: (productId) => ipcRenderer.invoke('gog:open-game', productId),
  runGogGame: (productId) => ipcRenderer.invoke('gog:run-game', productId),
  installGogGame: (productId) => ipcRenderer.invoke('gog:install-game', productId),
  //Pirate Sites
  cloudscraperFetch: (url, options) => ipcRenderer.invoke('cloudscraper:fetch', url, options),
  cloudscraperDodiRepacksHome: () => ipcRenderer.invoke('cloudscraper:dodi-repacks-home'),
  cloudscraperSearchByxatab: (query, page) => ipcRenderer.invoke('cloudscraper:search-byxatab', query, page),
  FitGirlMagnetLink: (gameName) => ipcRenderer.invoke('fitgirl:magnet-link', gameName),
  PcGamesTorrentMagnetLink: (gameName) => ipcRenderer.invoke('pcgamestorrent:magnet-link', gameName),
  ComingSoonGames: (from) => ipcRenderer.invoke('shop-specials:coming-soon', from),
  DiscountedGames: (from) => ipcRenderer.invoke('shop-specials:discounted', from),
  FeaturedGames: (from) => ipcRenderer.invoke('shop-specials:featured', from),
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
  
  // SettingsController
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSetting: (category, key, value) => ipcRenderer.invoke('settings:update', category, key, value),
  updateSettings: (newSettings) => ipcRenderer.invoke('settings:update-bulk', newSettings),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  clearCache: () => ipcRenderer.invoke('settings:clear-cache'),
  updatePlatformConnection: (platform, connected, username) => 
    ipcRenderer.invoke('settings:update-platform', platform, connected, username),
});

 //getAllDetailsByAppIDAndPlatform: (platform, appId) => ipcRenderer.invoke('games:get-all-details-by-appid-and-platform', {platform}, {appId}),

// Optional legacy-style alias used by some code paths
contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  toggleDevTools: () => ipcRenderer.send('window:toggle-devtools'),
  invoke: (channel, ...args) => invokeWithTokenSync(channel, ...args),
});
