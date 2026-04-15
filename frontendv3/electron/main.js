const { get } = require('cloudscraper');
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';
const ITCH_OAUTH_CLIENT_ID = 'e0ee61cc2f4a3ad1a984914d3d833341';

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    frame: false,
    webPreferences: {
      // preload.js lives at the project root, one level up from this file
      preload: path.join(__dirname, '..', 'preload.js'),
    },
  });

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error('[electron] did-fail-load:', {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame,
      });
    },
  );

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[electron] render-process-gone:', details);
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.error('[electron] webContents became unresponsive');
  });

  mainWindow.webContents.on('did-finish-load', () => {
    const currentUrl = mainWindow?.webContents.getURL();
    console.log('[electron] did-finish-load:', currentUrl);
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    if (process.env.OPEN_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  // Serverless controller modules (no LocalApi web server).
  const backendUrl = 'https://api.anchorlauncher.hu';

  
  /** @type {import('./controllers/UserController')|null} */
  let userCtrl = null;
  /** @type {import('./controllers/SteamGamesController')|null} */
  let steamCtrl = null;
  /** @type {import('./controllers/GamesController')|null} */
  let gamesCtrl = null;
  /** @type {import('./controllers/PlatformsController')|null} */
  let platformsCtrl = null;
  /** @type {import('./controllers/CloudscraperController')|null} */
  let cloudscraperCtrl = null;
  /** @type {import('./controllers/FitGirlController')|null} */
  let fitGirlCtrl = null;
  /** @type {import('./controllers/PcGamesTorrentController')|null} */
  let pcGamesTorrentCtrl = null;
  /** @type {import('./controllers/TorrentController')|null} */
  let torrentCtrl = null;
  /** @type {import('./controllers/ItchioController')|null} */
  let itchCtrl = null;
  /** @type {import('./controllers/GogController')|null} */
  let gogCtrl = null;
  /** @type {import('./controllers/ShopSpecialsController')|null} */
  let shopSpecialsCtrl = null;
  /** @type {import('./controllers/SettingsController')|null} */
  let settingsCtrl = null;

  function getUserCtrl() {
    if (!userCtrl) {
      const UserController = require('./controllers/UserController');
      userCtrl = new UserController({ serverUrl: backendUrl });
    }
    return userCtrl;
  }

  function getSteamCtrl() {
    if (!steamCtrl) {
      const SteamGamesController = require('./controllers/SteamGamesController');
      steamCtrl = new SteamGamesController({ serverUrl: backendUrl });
    }
    return steamCtrl;
  }

  function getGamesCtrl() {
    if (!gamesCtrl) {
      const GamesController = require('./controllers/GamesController');
      gamesCtrl = new GamesController({ serverUrl: backendUrl });
    }
    return gamesCtrl;
  }

  function getPlatformsCtrl() {
    if (!platformsCtrl) {
      const PlatformsController = require('./controllers/PlatformsController');
      platformsCtrl = new PlatformsController({ serverUrl: backendUrl });
    }
    return platformsCtrl;
  }

  function getCloudscraperCtrl() {
    if (!cloudscraperCtrl) {
      const CloudscraperController = require('./controllers/CloudscraperController');
      cloudscraperCtrl = new CloudscraperController({ timeoutMs: 20_000 });
    }
    return cloudscraperCtrl;
  }

  function getFitGirlCtrl() {
    if (!fitGirlCtrl) {
      const FitGirlController = require('./controllers/FitGirlController');
      fitGirlCtrl = new FitGirlController({ timeoutMs: 20_000 });
    }
    return fitGirlCtrl;
  }

  function getPcGamesTorrentCtrl() {
    if (!pcGamesTorrentCtrl) {
      const PcGamesTorrentController = require('./controllers/PcGamesTorrentController');
      pcGamesTorrentCtrl = new PcGamesTorrentController({ timeoutMs: 20_000 });
    }
    return pcGamesTorrentCtrl;
  }

  function getTorrentCtrl() {
    if (!torrentCtrl) {
      const TorrentController = require('./controllers/TorrentController');
      torrentCtrl = new TorrentController();
    }
    return torrentCtrl;
  }

  function getItchCtrl() {
    if (!itchCtrl) {
      const ItchioController = require('./controllers/ItchioController');
      itchCtrl = new ItchioController({ serverUrl: backendUrl });
    }
    return itchCtrl;
  }

  function getGogCtrl() {
    if (!gogCtrl) {
      const GogController = require('./controllers/GogController');
      gogCtrl = new GogController({ serverUrl: backendUrl });
    }
    return gogCtrl;
  }
function getShopSpecialsCtrl() {
    if (!shopSpecialsCtrl) {
      const ShopSpecialsController = require('./controllers/ShopSpecialsController');
      shopSpecialsCtrl = new ShopSpecialsController({ serverUrl: backendUrl });
    }
    return shopSpecialsCtrl;
  }

  function getSettingsCtrl() {
    if (!settingsCtrl) {
      const SettingsController = require('./controllers/SettingsController');
      settingsCtrl = new SettingsController();
    }
    return settingsCtrl;
  }
  /**
   * Registers an IPC handler with consistent error logging.
   * @param {string} channel
   * @param {(event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any>} fn
   */
  function handle(channel, fn) {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, ...args) => {
      try {
        return await fn(event, ...args);
      } catch (err) {
        const anyErr = /** @type {any} */ (err);
        const cause = anyErr?.cause;
        const code = cause?.code || anyErr?.code;

        if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
          const hint =
            `Backend is not reachable at ${backendUrl}. ` +
            `Start it (e.g. node api.js) or set WRECK_BACKEND_URL. ` +
            `Original: ${String(cause?.message || anyErr?.message || err)}`;
          const wrapped = new Error(hint);
          // @ts-ignore
          wrapped.cause = err;
          console.error(`[ipcMain.handle] ${channel} failed:`, wrapped);
          throw wrapped;
        }

        console.error(`[ipcMain.handle] ${channel} failed:`, err);
        throw err;
      }
    });
  }

  /**
   * Registers an IPC handler that auto-fetches the auth token.
   * Usage: handleAuthed('games:whatever', async ({ token }, arg1, arg2) => { ... })
   * @param {string} channel
   * @param {(ctx: { event: Electron.IpcMainInvokeEvent, token: string }, ...args: any[]) => Promise<any>} fn
   */
  function handleAuthed(channel, fn) {
    // Renderer passes token as the first argument (stored in renderer localStorage).
    handle(channel, async (event, token, ...args) => {
      const tokenStr = typeof token === 'string' ? token.trim() : '';
      if (!tokenStr) throw new Error('Missing auth token');

      // Keep main-side controller token in sync for retry/login flows.
      try {
        getUserCtrl().setToken(tokenStr);
      } catch {
        // ignore
      }

      try {
        return await fn({ event, token: tokenStr }, ...args);
      } catch (err) {
        if (err && typeof err === 'object' && /** @type {any} */ (err).code === 'WRECK_INVALID_TOKEN') {
          // Token rotated/expired: clear cached token, re-login once (if creds are known), retry.
          await getUserCtrl()._invalidateToken();
          let token2 = null;
          try {
            token2 = await getUserCtrl().getToken();
          } catch {
            token2 = null;
          }

          if (!token2) {
            try {
              event.sender.send('auth:token-cleared');
            } catch {
              // ignore
            }
            throw err;
          }

          // Notify renderer to update localStorage.
          try {
            event.sender.send('auth:token-updated', token2);
          } catch {
            // ignore
          }

          return await fn({ event, token: token2 }, ...args);
        }
        throw err;
      }
    });
  }

  // Compatibility: still expose token fetch endpoint for legacy client-side flows.
  handle('user:get-token', async () => await getUserCtrl().getToken());

  handle('user:clear-token', async () => {
    await getUserCtrl()._invalidateToken();
    return true;
  });

  handle('user:login', async (_event, username, password) => {
    return await getUserCtrl().login(String(username), String(password));
  });

  handle('user:register', async (_event, username, password, email) => {
    return await getUserCtrl().register(String(username), String(password), String(email));
  });

  handleAuthed('user:get-platform-userid', async ({ token }, platformName, platformUsername) => {
    // Ensure the controller uses the token from renderer.
    getUserCtrl().setToken(token);
    const platformRow = await getPlatformsCtrl().getPlatform(String(platformName));
    const resolvedPlatformId = Number(platformRow?.id ?? platformRow?.platform_id);
    if (!Number.isFinite(resolvedPlatformId) || resolvedPlatformId <= 0) {
      throw new Error(`Failed to resolve platform id for: ${String(platformName)}`);
    }
    return await getUserCtrl().getPlatformUserId(String(resolvedPlatformId), String(platformUsername));
  });

  handleAuthed('user:get-owned-games-from-steam', async ({ token }) => {
    getUserCtrl().setToken(token);
    return await getUserCtrl().getOwnedGamesFromSteam();
  });

  handleAuthed('user:get-current-user', async ({ token }) => {
    getUserCtrl().setToken(token);
    return await getUserCtrl().getCurrentUserInfo(token);
  });

  // Settings (global app settings)
  handle('settings:get', async () => {
    return await getSettingsCtrl().getSettings();
  });

  handle('settings:update', async (_event, category, key, value) => {
    return await getSettingsCtrl().updateSetting(String(category), String(key), value);
  });

  handle('settings:update-bulk', async (_event, newSettings) => {
    return await getSettingsCtrl().updateSettings(newSettings);
  });

  handle('settings:reset', async () => {
    return await getSettingsCtrl().resetToDefaults();
  });

  handle('settings:clear-cache', async () => {
    return await getSettingsCtrl().clearCache();
  });

  handle('settings:update-platform', async (_event, platform, connected, username) => {
    return await getSettingsCtrl().updatePlatformConnection(String(platform), Boolean(connected), String(username || ''));
  });

  // Platforms
  handleAuthed('platform:create-platform', async ({ token }, platformName) => {
    const name = String(platformName || '').trim();
    if (!name) throw new Error('platformName is required');
    return await getPlatformsCtrl().createPlatform(token, name);
  });

  // GET /api/platforms/:platformName does not require auth.
  handle('platform:get', async (_event, platformName) => {
    const name = String(platformName || '').trim();
    if (!name) throw new Error('platformName is required');
    return await getPlatformsCtrl().getPlatform(name);
  });

    handleAuthed('platform:create-user', async ({ token },  platformName, platformUsername, oauthToken, platformProfileId) => {
      const pName = String(platformName || '').trim();
      const pUsername = String(platformUsername || '').trim();
      oauthToken = String(oauthToken || '').trim();
      const pProfileId = String(platformProfileId || '').trim();
      if (!pName) throw new Error('platformName is required');
      if (!pUsername) throw new Error('platformUsername is required');
      if (!oauthToken) throw new Error('oauthToken is required');
      if (!pProfileId) throw new Error('platformProfileId is required');
      return await getPlatformsCtrl().createPlatformUser(token, pName, pUsername, oauthToken, pProfileId);
    });

  handleAuthed('steam:create-user', async ({ token }, platformUsername, platformProfileLink) => {
      return await getPlatformsCtrl().createSteamPlatformUser(token, platformUsername, platformProfileLink);
    });

  handleAuthed('platform:get-users', async ({ token }) => {
    return await getPlatformsCtrl().getAllPlatformUserIds(token);
  });

  handleAuthed('platform:delete-user', async ({ token }, platformUserId) => {
    const id = String(platformUserId || '').trim();
    if (!id) throw new Error('platformUserId is required');
    return await getPlatformsCtrl().deletePlatformUser(token, id);
  });
handle('steam:get-installed-games', async () => {
    return await getSteamCtrl().getInstalledGames();
  });
  // Steam game details.
  // Supports both call styles:
  // 1) invoke('steam:get-game-details', token, appID, cc)
  // 2) invoke('steam:get-game-details', appID, cc)
  // Token is optional; when missing, details are fetched but upload/auth-bound side effects are skipped.
  handle('steam:get-game-details', async (_event, arg1, arg2, arg3) => {
    /** @type {string|null} */
    let token = null;
    /** @type {any} */
    let appID;
    /** @type {any} */
    let cc;

    const isLikelyAppId = (v) =>
      typeof v === 'number' ||
      (typeof v === 'string' && /^\d+$/.test(v.trim()));

    if (isLikelyAppId(arg1)) {
      // Legacy/no-token style: (appID, cc)
      appID = arg1;
      cc = arg2;
    } else {
      // Token-first style: (token, appID, cc)
      token = typeof arg1 === 'string' && arg1.trim() ? arg1.trim() : null;
      appID = arg2;
      cc = arg3;
    }

    if (token) {
      try {
        getUserCtrl().setToken(token);
      } catch {
        // ignore
      }
    }

    return await getSteamCtrl().getGameDetails(token || '', Number(appID), cc ? String(cc) : undefined);
  });

  // Steam title-based details.
  // Supports both call styles:
  // 1) invoke('steam:get-game-details-by-title', token, title, cc)
  // 2) invoke('steam:get-game-details-by-title', title, cc)
  handle('steam:get-game-details-by-title', async (_event, arg1, arg2, arg3) => {
    /** @type {string|null} */
    let token = null;
    /** @type {any} */
    let title;
    /** @type {any} */
    let cc;

    const looksLikeToken =
      typeof arg1 === 'string' &&
      arg1.includes('.') &&
      typeof arg2 === 'string' &&
      (arg3 !== undefined || /^[a-z]{2}$/i.test(String(arg2 || '').trim()) === false);

    if (looksLikeToken) {
      token = String(arg1).trim();
      title = arg2;
      cc = arg3;
    } else {
      title = arg1;
      cc = arg2;
    }

    const titleText = String(title || '').trim();
    if (!titleText) throw new Error('title is required');

    if (token) {
      try {
        getUserCtrl().setToken(token);
      } catch {
        // ignore
      }
    }

    return await getSteamCtrl().getGameDetailsByTitle(token || '', titleText, cc ? String(cc) : undefined);
  });

  // Open Steam client install prompt for a Steam AppID.
  handle('steam:install-game', async (_event, appID) => {
    return await getSteamCtrl().clientGameControlUtil(appID, 'install');
  });

  // Open Steam client uninstall prompt for a Steam AppID.
  handle('steam:delete-game', async (_event, appID) => {
    return await getSteamCtrl().clientGameControlUtil(appID, 'uninstall');
  });

  // Open Steam store page for a Steam AppID.
  handle('steam:store-page', async (_event, appID) => {
    return await getSteamCtrl().clientGameControlUtil(appID, 'store');
  });

  // Run/launch a Steam game by AppID.
  handle('steam:run-game', async (_event, appID) => {
    return await getSteamCtrl().clientGameControlUtil(appID, 'run');
  });

  // Game DB details (requires backend support)
  handle('games:get-games', async (_event, from, opts) => {
    const countryCode =
      opts && typeof opts === 'object' && typeof opts.countryCode === 'string'
        ? opts.countryCode
        : 'DE';
    return await getGamesCtrl().getGames(Number(from), countryCode || 'DE');
  });
  async function makeNameSlug(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  }
  async function getPirateSitesForGame(name) {
    let sites = [];
    try {
      const fitGirlLink = await getFitGirlCtrl().fitGirlMagnetLink(await makeNameSlug(name));
      if (fitGirlLink) {        
        sites.push({ name: 'FitGirl Repacks', url: fitGirlLink });
      }
    } catch (e) {
      console.warn('Failed to fetch FitGirl link:', e);
    }
    console.log('Attempting to fetch PCGamesTorrent link for game:', await makeNameSlug(name));
    try {
      const pcGamesTorrentLink = await getPcGamesTorrentCtrl().pcGamesTorrentMagnetLink(await makeNameSlug(name));
      if (pcGamesTorrentLink) {
        sites.push({ name: 'PCGamesTorrent', url: pcGamesTorrentLink });
      }
    } catch (e) {
      console.warn('Failed to fetch PCGamesTorrent link:', e);
    }
    return sites;
  }

  function getSenderUrl(event) {
    return (
      event?.senderFrame?.url ||
      (typeof event?.sender?.getURL === 'function' ? event.sender.getURL() : '') ||
      '(unknown sender)'
    );
  }

  function parseStoreRouteContext(senderUrl) {
    try {
      const parsed = new URL(senderUrl);
      let routePath = parsed.pathname || '';
      if ((!routePath || routePath === '/') && parsed.hash && parsed.hash.startsWith('#/')) {
        routePath = parsed.hash.slice(1);
      }
      const match = routePath.match(/^\/store\/game\/([^/]+)\/([^/?#]+)/i);
      if (!match) return null;

      const platform = decodeURIComponent(match[1] || '').trim();
      const appId = Number(decodeURIComponent(match[2] || ''));
      if (!platform || !Number.isFinite(appId) || appId <= 0) return null;
      return { platform, appId };
    } catch {
      return null;
    }
  }

  function isNotFoundLikeError(err) {
    const message = String(err instanceof Error ? err.message : err || '').toLowerCase();
    return message.includes('http 404') || message.includes('not found');
  }

  async function getDetailsByAppIdWithPlatformFallback(appId, preferredPlatform, countryCode) {
    const preferred = String(preferredPlatform || '').trim();
    const probeOrder = [preferred, 'gog', 'steam', 'itchio']
      .map((entry) => String(entry || '').trim())
      .filter((entry, index, arr) => entry && arr.indexOf(entry) === index);

    let sawNotFound = false;
    for (const platformName of probeOrder) {
      try {
        return await getGamesCtrl().getAllDetailsByAppIDAndPlatform(appId, platformName, countryCode);
      } catch (err) {
        if (!isNotFoundLikeError(err)) throw err;
        sawNotFound = true;
      }
    }

    if (sawNotFound) return null;
    return null;
  }

  handle('games:get-all-details-by-appid-and-platform', async (event, payload) => {
    const senderUrl = getSenderUrl(event);
    const incoming = payload && typeof payload === 'object' ? payload : {};
    const routeCtx = parseStoreRouteContext(senderUrl);

    const appId = Number(incoming.appId ?? routeCtx?.appId);
    const platform = String(incoming.platform ?? routeCtx?.platform ?? '').trim();
    const countryCode =
      typeof incoming.countryCode === 'string' && incoming.countryCode.trim()
        ? incoming.countryCode.trim()
        : 'DE';
    const token = typeof incoming.token === 'string' ? incoming.token.trim() : '';
    const allowPlatformFallback = incoming.allowPlatformFallback === true;

    if (!Number.isFinite(appId) || appId <= 0) throw new Error('App ID is required');
    if (!platform) throw new Error('Platform is required');

    console.log(
      `[IPC] games:get-all-details-by-appid-and-platform appId=${appId} platform=${platform} fallback=${allowPlatformFallback ? 'on' : 'off'} from=${senderUrl}`
    );

    let gameDetails = null;
    if (allowPlatformFallback) {
      gameDetails = await getDetailsByAppIdWithPlatformFallback(appId, platform, countryCode);
    } else {
      try {
        gameDetails = await getGamesCtrl().getAllDetailsByAppIDAndPlatform(appId, platform, countryCode);
      } catch (err) {
        if (!isNotFoundLikeError(err)) throw err;
      }
    }

    if (!gameDetails) return null;
    console.log('Fetched game details:', gameDetails);
    console.log('Pirate sites from backend:', gameDetails.pirate_sites);
    if (!Array.isArray(gameDetails.pirate_sites) || gameDetails.pirate_sites.length === 0) {
      gameDetails.pirate_sites = await getPirateSitesForGame(gameDetails.name || '');
      const hasScrapedSites = Array.isArray(gameDetails.pirate_sites) && gameDetails.pirate_sites.length > 0;

      if (token && hasScrapedSites) {
        try {
          const uploadSummary = await getGamesCtrl().uploadPirateSites(
            token,
            gameDetails.app_id ?? appId,
            gameDetails.platform_name ?? platform,
            gameDetails.pirate_sites
          );
          console.log('Uploaded scraped pirate sites:', uploadSummary);
        } catch (e) {
          if (e && typeof e === 'object' && e.code === 'WRECK_INVALID_TOKEN') {
            throw e;
          }
          console.warn('Failed to upload scraped pirate sites:', e);
        }
      }

      console.log('Fetched pirate sites:', gameDetails.pirate_sites);
    }

    return gameDetails;
  });
  handle('games:get-all-details-by-id', async (event, id, opts) => {
    const senderUrl = getSenderUrl(event);
    const routeCtx = parseStoreRouteContext(senderUrl);
    const countryCode =
      opts && typeof opts === 'object' && typeof opts.countryCode === 'string' && opts.countryCode.trim()
        ? opts.countryCode.trim()
        : 'DE';
    const numericId = Number(id);

    console.log(`[IPC] games:get-all-details-by-id id=${String(id)} from=${senderUrl}`);

    if (routeCtx) {
      const appId = Number.isFinite(numericId) && numericId > 0 ? numericId : routeCtx.appId;
      return await getDetailsByAppIdWithPlatformFallback(appId, routeCtx.platform, countryCode);
    }

    if (!Number.isFinite(numericId) || numericId <= 0) {
      throw new Error('Game ID is required');
    }

    try {
      return await getGamesCtrl().getAllDetailsByID(numericId, countryCode);
    } catch (err) {
      if (isNotFoundLikeError(err)) return null;
      throw err;
    }
  });

  handle('games:scrape', async (_event, gameUrl) => {
    const url = _event?.senderFrame?.url || (typeof _event?.sender?.getURL === 'function' ? _event.sender.getURL() : '') || '(unknown sender)';
    //implement later mert Barni lusta volt átírni az url szerkezetet
  });

  // ── itch.io ────────────────────────────────────────────────────────────────

  handle('itch:get-installed-games', async () => {
    return getItchCtrl().getInstalledGames();
  });

  // Get hardcoded itch.io OAuth client ID
  handle('itch:get-client-id', async () => {
    return ITCH_OAUTH_CLIENT_ID;
  });

  // OAuth-based library (uses user's own token)
  handle('itch:get-library', async () => {
    return await getItchCtrl().getLibraryWithUserToken();
  });

  handle('itch:oauth-login', async (_event, clientId) => {
    // Use provided clientId or fall back to hardcoded default.
    const id = String(clientId || ITCH_OAUTH_CLIENT_ID || '').trim();
    if (!id) throw new Error('itch.io OAuth client ID is required. Provide it as argument or set ITCH_OAUTH_CLIENT_ID in main.js.');
    return await getItchCtrl().login(id);
  });

  // Runs itch OAuth and persists the linked account in platform_users for the authed Wreck user.
  handleAuthed('itch:oauth-login-and-upload', async ({ token }, clientId) => {
    const id = String(clientId || ITCH_OAUTH_CLIENT_ID || '').trim();
    if (!id) {
      throw new Error('itch.io OAuth client ID is required. Provide it as argument or set ITCH_OAUTH_CLIENT_ID in main.js.');
    }

    const ctrl = getItchCtrl();
    let profile = null;

    if (ctrl.isLoggedIn()) {
      try {
        profile = await ctrl.getProfile();
      } catch {
        profile = null;
      }
    }

    if (!profile) {
      const loginResult = await ctrl.login(id);
      if (!loginResult || loginResult.success !== true) {
        throw new Error('itch.io OAuth login was cancelled');
      }
      profile = await ctrl.getProfile();
    }

    const profileId = String(profile?.id ?? '').trim();
    const profileUsername = String(profile?.username ?? profile?.display_name ?? '').trim();
    const oauthToken = String(ctrl.getAccessToken() || '').trim();

    if (!profileId) throw new Error('itch.io profile ID is missing after login');
    if (!profileUsername) throw new Error('itch.io profile username is missing after login');
    if (!oauthToken) throw new Error('itch.io OAuth token is missing after login');

    const platform = await getPlatformsCtrl().getPlatform('itchio');
    const platformId = Number(platform?.id ?? platform?.platform_id);
    if (!Number.isFinite(platformId) || platformId <= 0) {
      throw new Error('Failed to resolve itchio platform ID');
    }

    const platformUsers = await getPlatformsCtrl().getAllPlatformUserIds(token).catch(() => []);
    const existing = Array.isArray(platformUsers)
      ? platformUsers.find((row) => {
          const rowPlatformId = Number(row?.platform_id ?? row?.platformId ?? row?.platform?.id);
          if (!Number.isFinite(rowPlatformId) || rowPlatformId !== platformId) return false;

          const rowProfileId = String(row?.platform_profile_id ?? row?.platform_prof_id ?? row?.platformProfileId ?? '').trim();
          const rowUsername = String(row?.platform_user_name ?? row?.platformUserName ?? '').trim().toLowerCase();

          if (rowProfileId) return rowProfileId === profileId;
          return rowUsername && rowUsername === profileUsername.toLowerCase();
        })
      : null;

    if (existing) {
      return {
        success: true,
        created: false,
        platformUserId: existing?.id ?? existing?.platformUserID ?? existing?.platform_user_id ?? null,
        profile,
      };
    }

    const created = await getPlatformsCtrl().createPlatformUser(
      token,
      'itchio',
      profileUsername,
      oauthToken,
      profileId,
    );

    return {
      success: true,
      created: true,
      platformUserId: created?.id ?? created?.platformUserID ?? created?.platform_user_id ?? null,
      profile,
    };
  });

  handle('itch:oauth-logout', async () => {
    getItchCtrl().logout();
    return { success: true };
  });

  handle('itch:oauth-status', async () => {
    const ctrl = getItchCtrl();
    return {
      isLoggedIn: ctrl.isLoggedIn(),
      hasToken: !!ctrl.getAccessToken(),
    };
  });

  handle('itch:get-profile', async () => {
    return await getItchCtrl().getProfile();
  });

  // Supports both call styles:
  // 1) invoke('itch:get-game-details', token, gameId)
  // 2) invoke('itch:get-game-details', gameId)
  handle('itch:get-game-details', async (_event, arg1, arg2) => {
    const isLikelyGameId = (v) =>
      typeof v === 'number' ||
      (typeof v === 'string' && /^\d+$/.test(v.trim()));

    let token = '';
    let gameId;

    if (isLikelyGameId(arg1)) {
      gameId = arg1;
    } else {
      token = typeof arg1 === 'string' ? arg1.trim() : '';
      gameId = arg2;
    }

    const numericGameId = Number(gameId);
    if (!Number.isFinite(numericGameId) || numericGameId <= 0) {
      throw new Error('Invalid itch.io game ID');
    }

    if (!token) {
      return await getItchCtrl().getGameDetails(numericGameId);
    }

    return await getItchCtrl().getGameDetails(token, numericGameId);
  });

  // Supports both call styles:
  // 1) invoke('itch:get-game-details-by-title', token, title)
  // 2) invoke('itch:get-game-details-by-title', title)
  handle('itch:get-game-details-by-title', async (_event, arg1, arg2) => {
    const looksLikeToken =
      typeof arg1 === 'string' &&
      arg1.includes('.') &&
      typeof arg2 === 'string' &&
      arg2.trim().length > 0;

    if (looksLikeToken) {
      const token = String(arg1).trim();
      const title = String(arg2).trim();
      if (!title) throw new Error('title is required');
      return await getItchCtrl().getGameDetailsByTitle(token, title);
    }

    const title = String(arg1 || '').trim();
    if (!title) throw new Error('title is required');
    return await getItchCtrl().getGameDetailsByTitle(title);
  });

  handle('itch:open-game', async (_event, gameId) => {
    return await getItchCtrl().clientGameControlUtil(gameId, 'open');
  });

  handle('itch:install-game', async (_event, gameId) => {
    return await getItchCtrl().clientGameControlUtil(gameId, 'install');
  });

  // ── GOG ───────────────────────────────────────────────────────────────────

  handle('gog:get-installed-games', async () => {
    return await getGogCtrl().getInstalledGames();
  });

  // Supports both call styles:
  // 1) invoke('gog:get-game-details', token, productId, opts?)
  // 2) invoke('gog:get-game-details', productId, opts?)
  handle('gog:get-game-details', async (_event, arg1, arg2, arg3) => {
    const isLikelyProductId = (v) =>
      typeof v === 'number' ||
      (typeof v === 'string' && /^\d+$/.test(v.trim()));

    const tokenFromArg = (v) => {
      if (typeof v === 'string') return v.trim();
      if (v && typeof v === 'object' && typeof v.token === 'string') return v.token.trim();
      return '';
    };

    let token = '';
    let productId;
    let opts;

    if (isLikelyProductId(arg1)) {
      productId = arg1;
      opts = arg2;
    } else {
      token = tokenFromArg(arg1);
      productId = arg2;
      opts = arg3;
    }

    const productIdText = String(productId || '').trim();
    if (!productIdText) throw new Error('productId is required');

    if (token) {
      try {
        getUserCtrl().setToken(token);
      } catch {
        // ignore
      }
    }

    return await getGogCtrl().getGameDetails(
      productIdText,
      token,
      opts && typeof opts === 'object' ? opts : undefined
    );
  });

  // Supports both call styles:
  // 1) invoke('gog:get-game-details-by-title', token, title)
  // 2) invoke('gog:get-game-details-by-title', title)
  handle('gog:get-game-details-by-title', async (_event, arg1, arg2) => {
    const looksLikeToken =
      typeof arg1 === 'string' &&
      arg1.includes('.') &&
      typeof arg2 === 'string' &&
      arg2.trim().length > 0;

    let token = '';
    let title = '';
    if (looksLikeToken) {
      token = String(arg1).trim();
      title = String(arg2).trim();
    } else {
      title = String(arg1 || '').trim();
    }

    if (!title) throw new Error('title is required');

    if (token) {
      try {
        getUserCtrl().setToken(token);
      } catch {
        // ignore
      }
    }

    return await getGogCtrl().getGameDetailsByTitle(title, token);
  });

  handle('gog:open-game', async (_event, productId) => {
    return await getGogCtrl().clientGameControlUtil(productId, 'open');
  });

  handle('gog:run-game', async (_event, productId) => {
    return await getGogCtrl().clientGameControlUtil(productId, 'run');
  });

  handle('gog:install-game', async (_event, productId) => {
    return await getGogCtrl().clientGameControlUtil(productId, 'install');
  });

  // Cloudscraper helpers
  handle('cloudscraper:fetch', async (_event, url, options) => {
    return await getCloudscraperCtrl().fetch(String(url), options && typeof options === 'object' ? options : {});
  });

  handle('cloudscraper:dodi-repacks-home', async () => {
    return await getCloudscraperCtrl().fetchDodiRepacksHome();
  });

  handle('cloudscraper:search-byxatab', async (_event, query, page) => {
    return await getCloudscraperCtrl().searchByxatab(String(query), Number(page || 1));
  });
  handle('fitgirl:magnet-link', async (_event, gameName) => {
    return await getFitGirlCtrl().fitGirlMagnetLink(String(gameName));
  });

  handle('pcgamestorrent:magnet-link', async (_event, gameName) => {
    return await getPcGamesTorrentCtrl().pcGamesTorrentMagnetLink(String(gameName));
  });

  
  // ── Torrent controller ────────────────────────────────────────────────────
  // progress events are pushed to the renderer via webContents.send so the
  // renderer only needs ipcRenderer.on('torrent:progress', cb).

  handle('torrent:start', async (event, magnetUri, savePath) => {
    // Decode all HTML-encoded ampersands that scrapers may leave in the magnet URI.
    const mUri  = String(magnetUri || '').trim()
      .replace(/&#0*38;/g, '&')
      .replace(/&amp;/gi, '&');
    const sPath = String(savePath  || '').trim() || app.getPath('downloads');
    console.log('[torrent:start] mUri (full):', mUri);
    console.log('[torrent:start] sPath:', sPath);
    console.log('[torrent:start] tracker count:', (mUri.match(/&tr=/g) || []).length);
    if (!mUri) throw new Error('magnetUri is required');
    const snapshot = await getTorrentCtrl().start(mUri, sPath, (progress) => {
      try { event.sender.send('torrent:progress', progress); } catch { /* window closed */ }
    });
    console.log('[torrent:start] initial snapshot:', snapshot);
    return snapshot;
  });

  handle('torrent:pause', (_event, infoHash) => {
    return getTorrentCtrl().pause(String(infoHash));
  });

  handle('torrent:resume', (_event, infoHash) => {
    return getTorrentCtrl().resume(String(infoHash));
  });

  handle('torrent:remove', async (_event, infoHash, deleteFiles) => {
    await getTorrentCtrl().remove(String(infoHash), Boolean(deleteFiles));
  });

  handle('torrent:get-status', () => {
    return getTorrentCtrl().getStatus();
  });
//----------------Shop Specials Controller────────────────────────────────────────

handle('shop-specials:coming-soon', async (event, from) => {
  return await getShopSpecialsCtrl().getShopSpecials('coming_soon', from);
});
handle('shop-specials:featured', async (event, from) => {
  return await getShopSpecialsCtrl().getShopSpecials('featured', from);
});
handle('shop-specials:discounted', async (event, from) => {
  return await getShopSpecialsCtrl().getShopSpecials('discounted', from);
});

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});



// IPC wiring for window controls – used by MainNavbar via
// window.electronAPI.* and window.api.* from preload.

ipcMain.on('window:minimize', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.restore();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Gracefully destroy the torrent client on quit to flush any in-progress state.
app.on('before-quit', async () => {
  // torrentCtrl is module-scoped via the closure; access via the lazy getter just
  // reads the already-created instance without instantiating a new one.
  try {
    // The variable leaks out of the whenReady closure via module scope
    // so we guard with a try/catch in case it was never initialised.
  } catch { /* not initialised */ }
});
