const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

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
  createWindow();

  // Serverless controller modules (no LocalApi web server).
  const backendUrl = process.env.WRECK_BACKEND_URL || 'http://127.0.0.1:3000';

  //temp
  const username = 'teszt';
  const password = 'teszt';
  const email = 'a@b.c';

  
  /** @type {import('./controllers/UserController')|null} */
  let userCtrl = null;
  /** @type {import('./controllers/SteamGamesController')|null} */
  let steamCtrl = null;
  /** @type {import('./controllers/GamesController')|null} */
  let gamesCtrl = null;
  /** @type {import('./controllers/EpicGamesController')|null} */
  let epicCtrl = null;
  /** @type {import('./controllers/PlatformsController')|null} */
  let platformsCtrl = null;
  /** @type {import('./controllers/CloudscraperController')|null} */
  let cloudscraperCtrl = null;

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

  function getEpicCtrl() {
    if (!epicCtrl) {
      const EpicGamesController = require('./controllers/EpicGamesController');
      epicCtrl = new EpicGamesController({ serverUrl: backendUrl });
    }
    return epicCtrl;
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

  /**
   * Registers an IPC handler with consistent error logging.
   * @param {string} channel
   * @param {(event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<any>} fn
   */
  function handle(channel, fn) {
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

  handle('user:login', async (_event, username, password) => {
    return await getUserCtrl().login(String(username), String(password));
  });

  handle('user:register', async (_event, username, password, email) => {
    return await getUserCtrl().register(String(username), String(password), String(email));
  });

  handleAuthed('user:get-platform-userid', async ({ token }, platformName, platformUsername) => {
    // Ensure the controller uses the token from renderer.
    getUserCtrl().setToken(token);
    return await getUserCtrl().getPlatformUserID(String(platformName), String(platformUsername));
  });

  handleAuthed('user:get-owned-games-from-steam', async ({ token }, platformUsername) => {
    getUserCtrl().setToken(token);
    return await getUserCtrl().getOwnedGamesFromSteam(String(platformUsername));
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

    handleAuthed('platform:create-user', async ({ token },  platformName, platformUsername, platformPassword, platformProfileId) => {
      const pName = String(platformName || '').trim();
      const pUsername = String(platformUsername || '').trim();
      const pPassword = String(platformPassword || '').trim();
      const pProfileId = String(platformProfileId || '').trim();
      if (!pName) throw new Error('platformName is required');
      if (!pUsername) throw new Error('platformUsername is required');
      if (!pPassword) throw new Error('platformPassword is required');
      if (!pProfileId) throw new Error('platformProfileId is required');
      return await getPlatformsCtrl().createPlatformUser(token, pName, pUsername, pPassword, pProfileId);
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

    return await getSteamCtrl().getGamesDetails(token || '', Number(appID), cc ? String(cc) : undefined);
  });

  // Open Steam client install prompt for a Steam AppID.
  handle('steam:install-game', async (_event, appID) => {
    return await getSteamCtrl().clientGameControllUtil(appID, 'install');
  });

  // Open Steam client uninstall prompt for a Steam AppID.
  handle('steam:delete-game', async (_event, appID) => {
    return await getSteamCtrl().clientGameControllUtil(appID, 'uninstall');
  });

  // Open Steam store page for a Steam AppID.
  handle('steam:store-page', async (_event, appID) => {
    return await getSteamCtrl().clientGameControllUtil(appID, 'store');
  });

  // Run/launch a Steam game by AppID.
  handle('steam:run-game', async (_event, appID) => {
    return await getSteamCtrl().clientGameControllUtil(appID, 'run');
  });

  // Game DB details (requires backend support)
  handle('games:get-games', async (_event, from) => {
    return await getGamesCtrl().getGames(Number(from));
  });

  handle('games:get-all-details-by-id', async (event, id) => {
    const senderUrl =
      event?.senderFrame?.url ||
      (typeof event?.sender?.getURL === 'function' ? event.sender.getURL() : '') ||
      '(unknown sender)';
    console.log(`[IPC] games:get-all-details-by-id id=${String(id)} from=${senderUrl}`);
    return await getGamesCtrl().getAllDetailsByID(Number(id));
  });

  handle('epic:get-installed-games', async () => {
    return await getEpicCtrl().getInstalledGames();
  });

  // Cloudscraper helpers
  handle('cloudscraper:fetch', async (_event, url, options) => {
    return await getCloudscraperCtrl().fetch(String(url), options && typeof options === 'object' ? options : {});
  });

  handle('cloudscraper:gog-games-home', async () => {
    return await getCloudscraperCtrl().fetchGogGamesHome();
  });

  handle('cloudscraper:gog-game-page', async (_event, gameSlug) => {
    return await getCloudscraperCtrl().fetchGogGamePage(String(gameSlug));
  });

  handle('cloudscraper:dodi-repacks-home', async () => {
    return await getCloudscraperCtrl().fetchDodiRepacksHome();
  });

  handle('cloudscraper:search-byxatab', async (_event, query, page) => {
    return await getCloudscraperCtrl().searchByxatab(String(query), Number(page || 1));
  });
  handle('cloudscraper:fetch-fitgirl-link', async (_event, gameSlug) => {
    return await getCloudscraperCtrl().fetchFitGirlGamePage(String(gameSlug));  
  });
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
