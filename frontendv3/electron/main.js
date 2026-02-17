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
  const username = 'teszt';
  const password = 'teszt';

  const tokenFile = getTokenFilePath();

  /** @type {import('./controllers/UserController')|null} */
  let userCtrl = null;
  /** @type {import('./controllers/SteamGamesController')|null} */
  let steamCtrl = null;
  /** @type {import('./controllers/GamesController')|null} */
  let gamesCtrl = null;
  /** @type {import('./controllers/EpicGamesController')|null} */
  let epicCtrl = null;

  function getUserCtrl() {
    if (!userCtrl) {
      const UserController = require('./controllers/UserController');
      userCtrl = new UserController({ username, password, tokenFile, serverUrl: backendUrl });
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
      epicCtrl = new EpicGamesController();
    }
    return epicCtrl;
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

  handle('user:get-platform-userid', async (_event, platformName, platformUsername) => {
    return await getUserCtrl().getPlatformUserID(String(platformName), String(platformUsername));
  });

  handle('user:get-owned-games-from-steam', async (_event, platformUsername) => {
    return await getUserCtrl().getOwnedGamesFromSteam(String(platformUsername));
  });

  // Steam game details: renderer passes (appID, cc). Token is fetched here.
  handleAuthed('steam:get-game-details', async ({ token }, appID, cc) => {
    return await getSteamCtrl().getGamesDetails(token, Number(appID), cc ? String(cc) : undefined);
  });

  // Backward/alternate name used by preload API.
  handleAuthed('steam:get-game-details-and-upload', async ({ token }, appID, cc) => {
    return await getSteamCtrl().getGamesDetails(token, Number(appID), cc ? String(cc) : undefined);
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
