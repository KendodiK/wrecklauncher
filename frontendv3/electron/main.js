const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function getTokenFilePath() {
  // userData is always writable (unlike app.asar)
  const userData = app.getPath('userData');
  const dir = path.join(userData, 'wrecklauncher');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // ignore
  }
  return path.join(dir, 'token.txt');
}

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
  const tokenFile = getTokenFilePath();

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

  function getUserCtrl() {
    if (!userCtrl) {
      const UserController = require('./controllers/UserController');
      userCtrl = new UserController({ serverUrl: backendUrl, tokenFile });
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
    handle(channel, async (event, ...args) => {
      const token = await getUserCtrl().getToken();
      if (!token) throw new Error('Missing auth token');
      return await fn({ event, token }, ...args);
    });
  }

  // UserController already extends TokenController; avoid a redundant instance.
  handle('user:get-token', async () => await getUserCtrl().getToken());

  handle('user:login', async (_event, username, password) => {
    return await getUserCtrl().login(String(username), String(password));
  });

  handle('user:register', async (_event, username, password, email) => {
    return await getUserCtrl().register(String(username), String(password), String(email));
  });

  handle('user:get-platform-userid', async (_event, platformName, platformUsername) => {
    return await getUserCtrl().getPlatformUserID(String(platformName), String(platformUsername));
  });

  handle('user:get-owned-games-from-steam', async (_event, platformUsername) => {
    return await getUserCtrl().getOwnedGamesFromSteam(String(platformUsername));
  });

  // Platforms
  handleAuthed('platform:create-platform', async ({ token }, platformName) => {
    const name = String(platformName || '').trim();
    if (!name) throw new Error('platformName is required');
    try {
      return await getPlatformsCtrl().createPlatform(token, name);
    } catch (err) {
      if (err && typeof err === 'object' && /** @type {any} */ (err).code === 'WRECK_INVALID_TOKEN') {
        // token rotated/expired: clear + retry once
        await getUserCtrl()._invalidateToken();
        const token2 = await getUserCtrl().getToken();
        if (!token2) throw new Error('Missing auth token');
        return await getPlatformsCtrl().createPlatform(token2, name);
      }
      throw err;
    }
  });
<<<<<<< Updated upstream
<<<<<<< Updated upstream
handleAuthed('platform:get', async (platformName) => {
=======
handle('platform:get', async (_event,platformName) => {
>>>>>>> Stashed changes
=======
handle('platform:get', async (_event,platformName) => {
>>>>>>> Stashed changes
  const name = String(platformName || '').trim();
  if (!name) throw new Error('platformName is required');
  try {
    return await getPlatformsCtrl().getPlatform(name);
  } catch (err) {
    throw err;
  }
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
      try {        return await getPlatformsCtrl().createPlatformUser(token, pName, pUsername, pPassword, pProfileId);
      } catch (err) {
        if (err && typeof err === 'object' && /** @type {any} */ (err).code === 'WRECK_INVALID_TOKEN') {
          // token rotated/expired: clear + retry once
          await getUserCtrl()._invalidateToken();
          const token2 = await getUserCtrl().getToken();
          if (!token2) throw new Error('Missing auth token');
          return await getPlatformsCtrl().createPlatformUser(token2, pName, pUsername, pPassword, pProfileId);
        }
        throw err;
      }
    });
  // Steam game details: renderer passes (appID, cc). Token is fetched here.
  handleAuthed('steam:get-game-details', async ({ token }, appID, cc) => {
    return await getSteamCtrl().getGamesDetails(token, Number(appID), cc ? String(cc) : undefined);
  });

  // Open Steam client install prompt for a Steam AppID.
  handle('steam:install-game', async (_event, appID) => {
    return await getSteamCtrl().installGame(appID);
  });

  // Open Steam client uninstall prompt for a Steam AppID.
  handle('steam:delete-game', async (_event, appID) => {
    return await getSteamCtrl().deleteSteamGame(appID);
  });

  // Open Steam store page for a Steam AppID.
  handle('steam:store-page', async (_event, appID) => {
    return await getSteamCtrl().storePageSteam(appID);
  });

  // Run/launch a Steam game by AppID.
  handle('steam:run-game', async (_event, appID) => {
    return await getSteamCtrl().runSteamGame(appID);
  });

  // Backward/alternate name used by preload API.
  handleAuthed('steam:get-game-details-and-upload', async ({ token }, appID, cc) => {
    return await getSteamCtrl().getGamesDetails(token, Number(appID), cc ? String(cc) : undefined);
  });

  // Game DB details (requires backend support)
  handleAuthed('games:get-all-details-by-id', async ({ event, token }, id) => {
    const senderUrl =
      event?.senderFrame?.url ||
      (typeof event?.sender?.getURL === 'function' ? event.sender.getURL() : '') ||
      '(unknown sender)';
    console.log(`[IPC] games:get-all-details-by-id id=${String(id)} from=${senderUrl}`);
    return await getGamesCtrl().getAllDetailsByID(token, Number(id));
  });

  handle('epic:get-installed-games', async () => {
    return await getEpicCtrl().getInstalledGames();
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
