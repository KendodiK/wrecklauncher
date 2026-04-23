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
    // Do not auto-expire on generic error text (e.g. transient backend/network issues).
    // Explicit auth expiration is signaled by the main process via 'auth:token-cleared'.
    throw err;
  }
}

// Invokes a channel with token-first args when available, but does not require auth.
function invokeWithOptionalAuth(channel, ...args) {
  const token = getAuthToken();
  if (typeof token === 'string' && token.trim()) {
    return ipcRenderer.invoke(channel, token.trim(), ...args);
  }
  return ipcRenderer.invoke(channel, ...args);
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

function normalizeCountryCode(value) {
  const raw = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(raw) ? raw : null;
}

function inferCountryCodeFromLocale() {
  const localeCandidates = [];
  try {
    const resolved = Intl?.DateTimeFormat?.().resolvedOptions?.().locale;
    if (resolved) localeCandidates.push(resolved);
  } catch {
    // ignore
  }
  if (typeof navigator !== 'undefined' && typeof navigator?.language === 'string' && navigator.language.trim()) {
    localeCandidates.push(navigator.language);
  }

  for (const locale of localeCandidates) {
    const match = String(locale).match(/[-_](?<cc>[A-Za-z]{2})\b/);
    const code = normalizeCountryCode(match?.groups?.cc || match?.[1]);
    if (code) return code;
  }

  return 'DE';
}

const COUNTRY_CACHE_TTL_MS = 30_000;
let cachedCountryCode = null;
let cachedCountryCodeExpiresAt = 0;

function invalidateCountryCodeCache() {
  cachedCountryCode = null;
  cachedCountryCodeExpiresAt = 0;
}

async function resolvePreferredCountryCode(preferred) {
  const direct = normalizeCountryCode(preferred);
  if (direct) return direct;

  const now = Date.now();
  if (cachedCountryCode && now < cachedCountryCodeExpiresAt) {
    return cachedCountryCode;
  }

  try {
    const settings = await ipcRenderer.invoke('settings:get');
    const candidates = [
      settings?.store?.countryCode,
      settings?.display?.countryCode,
      settings?.account?.countryCode,
    ];
    for (const candidate of candidates) {
      const normalized = normalizeCountryCode(candidate);
      if (!normalized) continue;
      cachedCountryCode = normalized;
      cachedCountryCodeExpiresAt = now + COUNTRY_CACHE_TTL_MS;
      return normalized;
    }
  } catch {
    // ignore and use locale fallback
  }

  const fallback = inferCountryCodeFromLocale();
  cachedCountryCode = fallback;
  cachedCountryCodeExpiresAt = now + COUNTRY_CACHE_TTL_MS;
  return fallback;
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
  getSteamGameDetails: async (appID, cc) => {
    const resolvedCountryCode = await resolvePreferredCountryCode(cc);
    return invokeWithOptionalAuth('steam:get-game-details', appID, resolvedCountryCode.toLowerCase());
  },
  getSteamGameDetailsByTitle: async (title, cc) => {
    const resolvedCountryCode = await resolvePreferredCountryCode(cc);
    return invokeWithOptionalAuth('steam:get-game-details-by-title', title, resolvedCountryCode.toLowerCase());
  },
  getSteamGameDetailsAndUpload: async (appID, cc) => {
    const resolvedCountryCode = await resolvePreferredCountryCode(cc);
    return ipcRenderer.invoke('steam:get-game-details-and-upload', appID, resolvedCountryCode.toLowerCase());
  },
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
    return invokeWithOptionalAuth('itch:get-game-details', gameId);
  },
  getItchGameDetailsByTitle: (title) => {
    return invokeWithOptionalAuth('itch:get-game-details-by-title', title);
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
  getGogGameDetails: async (productId, cc) => {
    const resolvedCountryCode = await resolvePreferredCountryCode(cc);
    return invokeWithOptionalAuth('gog:get-game-details', productId, { countryCode: resolvedCountryCode });
  },
  getGogGameDetailsByTitle: async (title, cc) => {
    const resolvedCountryCode = await resolvePreferredCountryCode(cc);
    return invokeWithOptionalAuth('gog:get-game-details-by-title', title, resolvedCountryCode);
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
    * @param {string} [displayName] Optional game title override shown in the downloads list.
   * @returns {Promise<import('./electron/models').TorrentProgress>} Initial snapshot.
   */
    torrentStart: (magnetUri, savePath, displayName) => ipcRenderer.invoke('torrent:start', magnetUri, savePath, displayName),
  /** @param {string} infoHash */
  torrentPause: (infoHash) => ipcRenderer.invoke('torrent:pause', infoHash),
  /** @param {string} infoHash */
  torrentResume: (infoHash) => ipcRenderer.invoke('torrent:resume', infoHash),
  /**
   * @param {string} infoHash
    * @param {boolean} [deleteFiles] Defaults to true; pass false to only detach torrent state.
    * @returns {Promise<{ removedFromClient?: boolean, deleteRequested?: boolean, deletedTargetCount?: number, lockedTargets?: string[], failedTargets?: string[] }>} 
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
  getGames: async (from, countryCode) => {
    const resolvedCountryCode = await resolvePreferredCountryCode(countryCode);
    return ipcRenderer.invoke('games:get-games', from, { countryCode: resolvedCountryCode });
  },
  searchGames: (needle, tags = []) => ipcRenderer.invoke('games:search', needle, { tags }),
  getAllDetailsByID: async (id, countryCode) => {
    const resolvedCountryCode = await resolvePreferredCountryCode(countryCode);
    return ipcRenderer.invoke('games:get-all-details-by-id', id, { countryCode: resolvedCountryCode });
  },
  getAllDetailsByAppIDAndPlatform: async (appId, platform, countryCode) => {
    const resolvedCountryCode = await resolvePreferredCountryCode(countryCode);
    let token = getAuthToken();
    if (!token) {
      try {
        token = await resolveAuthToken();
      } catch {
        token = null;
      }
    }

    return ipcRenderer.invoke('games:get-all-details-by-appid-and-platform', {
      appId,
      platform,
      countryCode: resolvedCountryCode,
      token: token || undefined,
    });
  },
  syncGamePriceByAppIdAndPlatform: async (appId, platform, price, countryCode) => {
    const resolvedCountryCode = await resolvePreferredCountryCode(countryCode);
    let token = getAuthToken();
    if (!token) {
      try {
        token = await resolveAuthToken();
      } catch {
        token = null;
      }
    }

    return ipcRenderer.invoke('games:sync-price', {
      appId,
      platform,
      price,
      countryCode: resolvedCountryCode,
      token: token || undefined,
    });
  },
  // SettingsController
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSetting: async (category, key, value) => {
    const updated = await ipcRenderer.invoke('settings:update', category, key, value);
    invalidateCountryCodeCache();
    return updated;
  },
  updateSettings: async (newSettings) => {
    const updated = await ipcRenderer.invoke('settings:update-bulk', newSettings);
    invalidateCountryCodeCache();
    return updated;
  },
  resetSettings: async () => {
    const defaults = await ipcRenderer.invoke('settings:reset');
    invalidateCountryCodeCache();
    return defaults;
  },
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
