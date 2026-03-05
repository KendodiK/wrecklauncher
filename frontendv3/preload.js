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
  cloudscraperFetch: (url, options) => ipcRenderer.invoke('cloudscraper:fetch', url, options),
  cloudscraperGogGamesHome: () => ipcRenderer.invoke('cloudscraper:gog-games-home'),
  cloudscraperGogGamePage: (gameSlug) => ipcRenderer.invoke('cloudscraper:gog-game-page', gameSlug),
  cloudscraperDodiRepacksHome: () => ipcRenderer.invoke('cloudscraper:dodi-repacks-home'),
  cloudscraperSearchByxatab: (query, page) => ipcRenderer.invoke('cloudscraper:search-byxatab', query, page),
  fetchFitGirlGameDirectDownloadLink: (gameSlug) => ipcRenderer.invoke('cloudscraper:fetch-fitgirl-link', gameSlug),
  // GamesController
  getAllDetailsByID: (id) => ipcRenderer.invoke('games:get-all-details-by-id', id),
});

// Optional legacy-style alias used by some code paths
contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  invoke: (channel, ...args) => invokeWithTokenSync(channel, ...args),
});
