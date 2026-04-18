const { contextBridge, ipcRenderer } = require('electron');

const AUTH_TOKEN_KEY = 'wrecklauncher.authToken';
const LEGACY_AUTH_TOKEN_KEYS = ['authToken', 'token', 'wreck_auth_token'];

function clearAuthTokenStorage() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  for (const key of LEGACY_AUTH_TOKEN_KEYS) {
    localStorage.removeItem(key);
  }
}

function getAuthToken() {
  try {
    const keys = [AUTH_TOKEN_KEY, ...LEGACY_AUTH_TOKEN_KEYS];
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      const t = typeof raw === 'string' ? raw.trim() : '';
      if (!t) continue;
      if (key !== AUTH_TOKEN_KEY) {
        localStorage.setItem(AUTH_TOKEN_KEY, t);
        for (const legacyKey of LEGACY_AUTH_TOKEN_KEYS) {
          localStorage.removeItem(legacyKey);
        }
      }
      return t;
    }
    return null;
  } catch {
    return null;
  }
}

/** @param {string|null|undefined} token */
function setAuthToken(token) {
  try {
    const t = typeof token === 'string' ? token.trim() : '';
    if (!t) {
      clearAuthTokenStorage();
      return;
    }
    localStorage.setItem(AUTH_TOKEN_KEY, t);
    for (const key of LEGACY_AUTH_TOKEN_KEYS) {
      localStorage.removeItem(key);
    }
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
  getCurrentUser: () => {
    return invokeAuthed('user:get-current-user');
  },
  updateCurrentUserProfile: (profilePatch) => {
    return invokeAuthed('user:update-profile', profilePatch);
  },
  getMyFriends: (nativeUserId) => {
    return invokeAuthed('friends:get-mine', nativeUserId);
  },
  searchNativeUsersByName: (name) => {
    return invokeAuthed('native-users:search', name);
  },
  getNativeUserById: (nativeUserId) => {
    return invokeAuthed('native-users:get-by-id', nativeUserId);
  },
  addFriend: (friendUserId) => {
    return invokeAuthed('friends:add', friendUserId);
  },
  removeFriend: (friendshipId) => {
    return invokeAuthed('friends:delete', friendshipId);
  },
  clearToken: async () => {
    setAuthToken(null);
    try {
      await ipcRenderer.invoke('user:clear-token');
    } catch {
      // ignore
    }
    return true;
  },
  login: async (username, password) => {
    const token = await ipcRenderer.invoke('user:login', username, password);
    if (typeof token === 'string' && token.trim()) setAuthToken(token);
    return token;
  },
  register: async (username, password, email, profile) => {
    const token = await ipcRenderer.invoke('user:register', username, password, email, profile);
    if (typeof token === 'string' && token.trim()) setAuthToken(token);
    return token;
  },
  getPlatformUserId: (platformName, platformUsername) => {
    return invokeAuthed('user:get-platform-userid', platformName, platformUsername);
  },
  getPlatformUserID: (platformName, platformUsername) => {
    return invokeAuthed('user:get-platform-userid', platformName, platformUsername);
  },
  createPlatform: (platformName) => {
    return invokeAuthed('platform:create-platform', platformName);
  },
  createPlatformUser: (platformName, platformUsername, oauthToken, platformProfileId) => {
    return invokeAuthed('platform:create-user', platformName, platformUsername, oauthToken, platformProfileId);
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
  getOwnedGamesFromSteam: () => {
    return invokeAuthed('user:get-owned-games-from-steam' );
  },
  getOwnedGamesFromSteamByNativeUserId: (nativeUserId) => {
    return invokeAuthed('user:get-owned-games-from-steam-by-native-userid', nativeUserId);
  },
  getSteamInstalledGames: () => ipcRenderer.invoke('steam:get-installed-games'),
  getSteamGameDetails: (appID, cc) => {
    return invokeAuthed('steam:get-game-details', appID, cc);
  },
  getSteamGameDetailsByTitle: (title, cc) => {
    return invokeAuthed('steam:get-game-details-by-title', title, cc);
  },
  getSteamGameDetailsAndUpload: (appID, cc) => ipcRenderer.invoke('steam:get-game-details-and-upload', appID, cc),
  installSteamGame: (appID) => ipcRenderer.invoke('steam:install-game', appID),
  deleteSteamGame: (appID) => ipcRenderer.invoke('steam:delete-game', appID),
  storePageSteam: (appID) => ipcRenderer.invoke('steam:store-page', appID),
  runSteamGame: (appID) => ipcRenderer.invoke('steam:run-game', appID),
  // itch.io
  getItchInstalledGames: () => ipcRenderer.invoke('itch:get-installed-games'),
  getItchLibrary: () => ipcRenderer.invoke('itch:get-library'),
  getItchClientId: () => ipcRenderer.invoke('itch:get-client-id'),
  loginItchOAuth: (clientId) => ipcRenderer.invoke('itch:oauth-login', clientId),
  loginItchOAuthAndUpload: (clientId) => invokeAuthed('itch:oauth-login-and-upload', clientId),
  getItchOAuthToken: () => ipcRenderer.invoke('itch:get-oauth-token'),
  logoutItchOAuth: () => ipcRenderer.invoke('itch:oauth-logout'),
  getItchOAuthStatus: () => ipcRenderer.invoke('itch:oauth-status'),
  getItchProfile: () => ipcRenderer.invoke('itch:get-profile'),
  getItchGameDetails: (gameId) => {
    return invokeAuthed('itch:get-game-details', gameId);
  },
  getItchGameDetailsByTitle: (title) => {
    return invokeAuthed('itch:get-game-details-by-title', title);
  },
  runItchGame: (gameId, gameUrl, installLocation) => ipcRenderer.invoke('itch:run-game', gameId, gameUrl, installLocation),
  openItchGame: (gameId, gameUrl) => ipcRenderer.invoke('itch:open-game', gameId, gameUrl),
  installItchGame: (gameId, gameUrl) => ipcRenderer.invoke('itch:install-game', gameId, gameUrl),
  deleteItchGame: (gameId, gameUrl, installLocation) => ipcRenderer.invoke('itch:delete-game', gameId, gameUrl, installLocation),
  // GOG
  getGogInstalledGames: () => ipcRenderer.invoke('gog:get-installed-games'),
  getGogLibrary: () => ipcRenderer.invoke('gog:get-library'),
  getGogClientId: () => ipcRenderer.invoke('gog:get-client-id'),
  loginGogOAuth: (clientId) => ipcRenderer.invoke('gog:oauth-login', clientId),
  loginGogOAuthAndUpload: (clientId) => invokeAuthed('gog:oauth-login-and-upload', clientId),
  getGogOAuthToken: () => ipcRenderer.invoke('gog:get-oauth-token'),
  logoutGogOAuth: () => ipcRenderer.invoke('gog:oauth-logout'),
  getGogOAuthStatus: () => ipcRenderer.invoke('gog:oauth-status'),
  getGogProfile: () => ipcRenderer.invoke('gog:get-profile'),
  getGogGameDetails: (productId) => {
    return invokeAuthed('gog:get-game-details', productId);
  },
  getGogGameDetailsByTitle: (title) => {
    return invokeAuthed('gog:get-game-details-by-title', title);
  },
  openGogGame: (productId) => ipcRenderer.invoke('gog:open-game', productId),
  runGogGame: (productId) => ipcRenderer.invoke('gog:run-game', productId),
  installGogGame: (productId) => ipcRenderer.invoke('gog:install-game', productId),
  deleteGogGame: (productId) => ipcRenderer.invoke('gog:delete-game', productId),
  // Local pirate library
  getPirateLibraryGames: () => ipcRenderer.invoke('pirate-library:get-games'),
  addPirateLibraryGameFromDialog: () => ipcRenderer.invoke('pirate-library:add-game-from-dialog'),
  removePirateLibraryGame: (gameId) => ipcRenderer.invoke('pirate-library:remove-game', gameId),
  runPirateLibraryGame: (executablePath) => ipcRenderer.invoke('pirate-library:run-game', executablePath),
  //Pirate Sites
  cloudscraperFetch: (url, options) => ipcRenderer.invoke('cloudscraper:fetch', url, options),
  cloudscraperDodiRepacksHome: () => ipcRenderer.invoke('cloudscraper:dodi-repacks-home'),
  cloudscraperSearchByxatab: (query, page) => ipcRenderer.invoke('cloudscraper:search-byxatab', query, page),
  fitGirlMagnetLink: (gameName) => ipcRenderer.invoke('fitgirl:magnet-link', gameName),
  pcGamesTorrentMagnetLink: (gameName) => ipcRenderer.invoke('pcgamestorrent:magnet-link', gameName),
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
   * Open the download folder/path for a torrent.
   * @param {string} infoHash
   * @param {string} [savePath]
   */
  torrentOpen: (infoHash, savePath) => ipcRenderer.invoke('torrent:open', infoHash, savePath),
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
  getGames: (from, countryCode = 'DE') => ipcRenderer.invoke('games:get-games', from, { countryCode }),
  searchGames: (needle, tags = []) => ipcRenderer.invoke('games:search', needle, { tags }),
  getAllDetailsByID: (id, countryCode = 'DE') => ipcRenderer.invoke('games:get-all-details-by-id', id, { countryCode }),
  getAllDetailsByAppIDAndPlatform: (appId, platform, countryCode = 'DE') =>
    ipcRenderer.invoke('games:get-all-details-by-appid-and-platform', {
      appId,
      platform,
      countryCode,
      token: getAuthToken() || undefined,
    }),
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
