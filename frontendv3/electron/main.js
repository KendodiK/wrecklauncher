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
  const backendUrl = process.env.WRECK_BACKEND_URL || 'http://127.0.0.1:3001';

  // Dev-only: allow self-signed certs for localhost HTTPS if explicitly enabled.
  // This keeps traffic encrypted, but disables server identity verification.
  if (process.env.WRECK_INSECURE_LOCALHOST_TLS === '1') {
    try {
      const u = new URL(backendUrl);
      const isLocalhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
      if (isLocalhost && u.protocol === 'https:') {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
        console.warn('[TLS] WRECK_INSECURE_LOCALHOST_TLS=1: TLS verification is disabled for this process (dev-only).');
      }
    } catch {
      // ignore
    }
  }

  const username = process.env.WRECK_USERNAME || 'teszt';
  const password = process.env.WRECK_PASSWORD || 'teszt';

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
      steamCtrl = new SteamGamesController();
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

  ipcMain.handle('user:get-token', async () => {
    // UserController already extends TokenController; avoid a redundant instance.
    return await getUserCtrl().getToken();
  });

  ipcMain.handle('user:get-platform-userid', async (_event, platformName, platformUsername) => {
    return await getUserCtrl().getPlatformUserID(String(platformName), String(platformUsername));
  });

  ipcMain.handle('user:get-owned-games-from-steam', async (_event, platformUsername) => {
    return await getUserCtrl().getOwnedGamesFromSteam(String(platformUsername));
  });

  ipcMain.handle('steam:get-game-details', async (_event, appID, cc) => {
    return await getSteamCtrl().getGamesDetails(Number(appID), cc ? String(cc) : undefined);
  });

  ipcMain.handle('steam:get-game-details-and-upload', async (_event, appID, cc) => {
    const details = await getSteamCtrl().getGamesDetails(Number(appID), cc ? String(cc) : undefined);
    if (!details) return null;

    const token = await getUserCtrl().getToken();
    if (!token) throw new Error('Missing token');

    const genreNames = Array.isArray(details.genres)
      ? details.genres
          .map((g) => (g && typeof g === 'object' ? g.description : null))
          .filter((s) => typeof s === 'string' && s.trim())
      : [];

    const cost = typeof details.price_overview === 'number' ? details.price_overview / 100 : null;

    /** @type {import('./models').UploadGameRequest} */
    const uploadReq = {
      app_id: String(details.appid),
      platform_name: 'steam',
      name: details.name || `steam:${details.appid}`,
      banner_img: details.bannerimg || '',
      description: null,
      minimum_requirements: null,
      cost,
      genre_names: genreNames,
    };

    const upload = await getGamesCtrl().uploadGame(token, uploadReq);
    return { details, upload };
  });

  ipcMain.handle('epic:get-installed-games', async () => {
    return getEpicCtrl().getInstalledGames();
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
