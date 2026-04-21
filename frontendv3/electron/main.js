const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, shell } = require('electron');
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';
const ITCH_OAUTH_CLIENT_ID = 'e0ee61cc2f4a3ad1a984914d3d833341';
const GOG_OAUTH_CLIENT_ID = '46899977096215655';
const devServerUrl = String(
  process.env.VITE_DEV_SERVER_URL || `http://localhost:${String(process.env.VITE_DEV_PORT || '5173')}`,
).trim();

let mainWindow;
/** @type {Tray|null} */
let appTray = null;
let appIsQuitting = false;
/** @type {() => Promise<Tray|null>} */
let ensureTray = async () => appTray;
/** @type {() => void} */
let showMainWindowFromTray = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
};

const ALLOWED_EXTERNAL_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'steam:',
  'goggalaxy:',
  'itch:',
  'magnet:',
]);

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function normalizeOpenExternalUrl(value) {
  const rawUrl = String(value || '').trim();
  if (!rawUrl) return null;

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null;
  return parsed.toString();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 1024,
    minHeight: 700,
    frame: false,
    webPreferences: {
      // preload.js lives at the project root, one level up from this file
      preload: path.join(__dirname, '..', 'preload.js'),
    },
  });

  mainWindow.setMinimumSize(1024, 700);

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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const normalizedUrl = normalizeOpenExternalUrl(url);
    if (normalizedUrl) {
      void shell.openExternal(normalizedUrl).catch((error) => {
        console.warn('[electron] Failed to open external URL from renderer:', normalizedUrl, error);
      });
    }
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (appIsQuitting) return;
    event.preventDefault();
    mainWindow.hide();
    void ensureTray();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL(devServerUrl);
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
  const persistedAuthPath = path.join(app.getPath('userData'), 'auth.json');
  const HARDWARE_PROFILE_CACHE_TTL_MS = 2 * 60_000;
  /** @type {{ value: any, expiresAt: number }} */
  let hardwareProfileCache = { value: null, expiresAt: 0 };
  /** @type {Promise<any>|null} */
  let hardwareProfileInFlight = null;

  /**
   * @returns {string|null}
   */
  function readPersistedAuthToken() {
    try {
      if (!fs.existsSync(persistedAuthPath)) return null;
      const raw = String(fs.readFileSync(persistedAuthPath, 'utf8') || '').trim();
      if (!raw) return null;

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        const fallback = raw.replace(/^"(.*)"$/, '$1').trim();
        return fallback || null;
      }

      if (typeof parsed === 'string' && parsed.trim()) {
        return parsed.trim();
      }

      const token = typeof parsed?.token === 'string' ? parsed.token.trim() : '';
      return token || null;
    } catch {
      return null;
    }
  }

  /**
   * @param {string|null|undefined} token
   * @returns {void}
   */
  function writePersistedAuthToken(token) {
    const normalized = String(token || '').trim();
    if (!normalized) {
      clearPersistedAuthToken();
      return;
    }

    try {
      fs.mkdirSync(path.dirname(persistedAuthPath), { recursive: true });
      fs.writeFileSync(
        persistedAuthPath,
        JSON.stringify({ token: normalized, updatedAt: new Date().toISOString() }, null, 2),
        'utf8'
      );
    } catch (err) {
      console.warn('[auth] Failed to persist token to auth.json:', err);
    }
  }

  /**
   * @returns {void}
   */
  function clearPersistedAuthToken() {
    try {
      if (fs.existsSync(persistedAuthPath)) {
        fs.unlinkSync(persistedAuthPath);
      }
    } catch (err) {
      console.warn('[auth] Failed to clear persisted auth token:', err);
    }
  }

  /**
   * @returns {Promise<Electron.NativeImage>}
   */
  async function buildTrayIcon() {
    try {
      const icon = await app.getFileIcon(process.execPath, { size: 'small' });
      if (icon && !icon.isEmpty()) return icon;
    } catch {
      // ignore and fallback
    }

    // Last-resort tiny fallback icon to avoid Tray constructor failures.
    const fallbackPngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAqklEQVQ4T7WSsQnCQBBF3y4I2wsWkQ2khY2VhY2VlY2FhY1dY2VhYQf0kM4S8Y0hP0gkS4R8xwQ3k4hP5mB2W6xqk7v7b8kQ0xj3l0o9a0j2Q5J3q9wXkW4z0Q2GmA5F7bIYQ7M+6S8JX1GxKfQj0XlQd9mWm2VgQ5m8qk8wSx+q1A8eM7l+8CqK7x7V5r4oNw2L8vJHkU2Nf6k0f0x5+3q1mYf7wNf0kN7uL6w8nQ3m9w7F2g6r5S3N8oW7wH7JfQfG9u4S0AAAAASUVORK5CYII=';
    return nativeImage.createFromDataURL(`data:image/png;base64,${fallbackPngBase64}`);
  }

  showMainWindowFromTray = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      createWindow();
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
  };

  ensureTray = async () => {
    if (appTray) return appTray;

    const icon = await buildTrayIcon();
    appTray = new Tray(icon);
    appTray.setToolTip('WreckLauncher');

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Open WreckLauncher',
        click: () => {
          showMainWindowFromTray();
        },
      },
      {
        label: 'Quit WreckLauncher',
        click: () => {
          appIsQuitting = true;
          if (appTray) {
            try { appTray.destroy(); } catch { /* ignore */ }
            appTray = null;
          }
          app.quit();
        },
      },
    ]);

    appTray.setContextMenu(contextMenu);
    appTray.on('click', () => {
      showMainWindowFromTray();
    });
    appTray.on('double-click', () => {
      showMainWindowFromTray();
    });

    return appTray;
  };

  
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
  /** @type {import('./controllers/XatabController')|null} */
  let xatabCtrl = null;
  /** @type {import('./controllers/OnlineFixMeController')|null} */
  let onlineFixMeCtrl = null;
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
  /** @type {import('./controllers/PirateLibraryController')|null} */
  let pirateLibraryCtrl = null;
  /** @type {import('./controllers/LibraryCacheController')|null} */
  let libraryCacheCtrl = null;
  /** @type {import('./controllers/TorrentStateCacheController')|null} */
  let torrentStateCacheCtrl = null;

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
      pcGamesTorrentCtrl = new PcGamesTorrentController({ timeoutMs: 20_000, redirectTimeoutMs: 25_000 });
    }
    return pcGamesTorrentCtrl;
  }

  function getXatabCtrl() {
    if (!xatabCtrl) {
      const XatabController = require('./controllers/XatabController');
      xatabCtrl = new XatabController({ timeoutMs: 20_000 });
    }
    return xatabCtrl;
  }

  function getOnlineFixMeCtrl() {
    if (!onlineFixMeCtrl) {
      const OnlineFixMeController = require('./controllers/OnlineFixMeController');
      onlineFixMeCtrl = new OnlineFixMeController({ timeoutMs: 20_000 });
    }
    return onlineFixMeCtrl;
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

  function getPirateLibraryCtrl() {
    if (!pirateLibraryCtrl) {
      const PirateLibraryController = require('./controllers/PirateLibraryController');
      pirateLibraryCtrl = new PirateLibraryController();
    }
    return pirateLibraryCtrl;
  }

  function getLibraryCacheCtrl() {
    if (!libraryCacheCtrl) {
      const LibraryCacheController = require('./controllers/LibraryCacheController');
      libraryCacheCtrl = new LibraryCacheController();
    }
    return libraryCacheCtrl;
  }

  function getTorrentStateCacheCtrl() {
    if (!torrentStateCacheCtrl) {
      const TorrentStateCacheController = require('./controllers/TorrentStateCacheController');
      torrentStateCacheCtrl = new TorrentStateCacheController();
    }
    return torrentStateCacheCtrl;
  }

  const bootToken = readPersistedAuthToken();
  if (bootToken) {
    try {
      getUserCtrl().setToken(bootToken);
    } catch {
      // ignore
    }
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
        writePersistedAuthToken(tokenStr);
      } catch {
        // ignore
      }

      try {
        return await fn({ event, token: tokenStr }, ...args);
      } catch (err) {
        if (err && typeof err === 'object' && /** @type {any} */ (err).code === 'WRECK_INVALID_TOKEN') {
          // Verify once before invalidating session to avoid false logouts from transient errors.
          let tokenDefinitelyInvalid = true;
          try {
            await getUserCtrl().getCurrentUserInfo(tokenStr);
            tokenDefinitelyInvalid = false;
          } catch (verifyErr) {
            const verifyCode = verifyErr && typeof verifyErr === 'object'
              ? String((/** @type {any} */ (verifyErr)).code || '').trim()
              : '';
            if (verifyCode !== 'WRECK_INVALID_TOKEN') {
              tokenDefinitelyInvalid = false;
            }
          }

          if (!tokenDefinitelyInvalid) {
            throw err;
          }

          // Token rotated/expired: clear cached token, re-login once (if creds are known), retry.
          await getUserCtrl()._invalidateToken();
          let token2 = null;
          try {
            token2 = await getUserCtrl().getToken();
          } catch {
            token2 = null;
          }

          if (!token2) {
            clearPersistedAuthToken();
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

          try {
            getUserCtrl().setToken(token2);
            writePersistedAuthToken(token2);
          } catch {
            // ignore
          }

          return await fn({ event, token: token2 }, ...args);
        }
        throw err;
      }
    });
  }

  handle('shell:open-external-url', async (_event, rawUrl) => {
    const normalizedUrl = normalizeOpenExternalUrl(rawUrl);
    if (!normalizedUrl) {
      throw new Error(`Invalid external URL: ${String(rawUrl || '')}`);
    }

    await shell.openExternal(normalizedUrl);
    return { ok: true, url: normalizedUrl };
  });

  handle('system:get-local-hardware-profile', async () => {
    const now = Date.now();
    if (hardwareProfileCache.value && hardwareProfileCache.expiresAt > now) {
      return hardwareProfileCache.value;
    }

    if (hardwareProfileInFlight) {
      return await hardwareProfileInFlight;
    }

    hardwareProfileInFlight = (async () => {
    const cpus = os.cpus();
    const cpuModel = String(cpus?.[0]?.model || '').trim();
    const cpuLogicalCores = Number(cpus?.length || 0);
    const cpuSpeedMhz = Number(cpus?.[0]?.speed || 0);
    const cpuSpeedGhz = cpuSpeedMhz > 0
      ? Number((cpuSpeedMhz / 1000).toFixed(2))
      : 0;
    const totalMemoryBytes = Number(os.totalmem() || 0);
    const totalMemoryGb = totalMemoryBytes > 0
      ? Number((totalMemoryBytes / (1024 ** 3)).toFixed(2))
      : 0;

    /** @type {string[]} */
    const gpuModels = [];
    /** @type {number[]} */
    const gpuMemoryMbCandidates = [];
    /** @type {number[]} */
    const freeDiskBytesCandidates = [];

    /** @param {string} value */
    const isLikelySoftwareGpu = (value) => (
      /swiftshader|microsoft basic render driver|software rasterizer|llvmpipe|virtualbox|vmware/i.test(String(value || ''))
    );

    /** @param {string} value */
    const isLikelyVirtualGpu = (value) => (
      /virtual\s*display|parsec|usb\s*mobile\s*monitor|displaylink|indirect\s*display|remote\s*display|mirage/i.test(String(value || ''))
    );

    /** @param {string} value */
    const pushGpuModel = (value) => {
      const normalized = String(value || '').trim();
      if (!normalized) return;
      if (/^name$/i.test(normalized)) return;
      if (/^unknown$/i.test(normalized)) return;
      if (/^0x[0-9a-f]+$/i.test(normalized)) return;

      if (!gpuModels.some((entry) => entry.toLowerCase() === normalized.toLowerCase())) {
        gpuModels.push(normalized);
      }
    };

    /** @param {number} value */
    const pushGpuMemoryMb = (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) return;
      const normalized = Math.round(numeric);
      if (normalized <= 0) return;
      if (!gpuMemoryMbCandidates.includes(normalized)) {
        gpuMemoryMbCandidates.push(normalized);
      }
    };

    /** @param {number} value */
    const pushFreeDiskBytes = (value) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) return;
      const normalized = Math.floor(numeric);
      if (normalized <= 0) return;
      if (!freeDiskBytesCandidates.includes(normalized)) {
        freeDiskBytesCandidates.push(normalized);
      }
    };

    const hasOnlySoftwareGpu = () => (
      gpuModels.length > 0 && gpuModels.every((entry) => isLikelySoftwareGpu(entry))
    );

    const hasLikelyRealGpu = () => (
      gpuModels.some((entry) => !isLikelySoftwareGpu(entry) && !isLikelyVirtualGpu(entry))
    );

    const hasLikelyNvidiaGpu = () => (
      gpuModels.some((entry) => {
        const lower = String(entry || '').toLowerCase();
        if (!lower) return false;
        if (isLikelySoftwareGpu(lower) || isLikelyVirtualGpu(lower)) return false;
        return /nvidia|geforce|gtx|rtx/.test(lower);
      })
    );

    const isAdapterRamCapLike = () => {
      const currentMax = gpuMemoryMbCandidates.length > 0
        ? Math.max(...gpuMemoryMbCandidates)
        : 0;
      return currentMax >= 4000 && currentMax <= 4096 && hasLikelyRealGpu();
    };

    /**
     * @param {string} file
     * @param {string[]} args
     * @param {number} timeoutMs
     * @returns {Promise<string>}
     */
    const runCommand = async (file, args, timeoutMs = 8_000) => {
      return await new Promise((resolve, reject) => {
        execFile(
          file,
          args,
          {
            windowsHide: true,
            timeout: timeoutMs,
            maxBuffer: 1024 * 1024,
          },
          (err, stdout) => {
            if (err) {
              reject(err);
              return;
            }
            resolve(String(stdout || ''));
          },
        );
      });
    };

    /** @param {string} text */
    const parseGpuNamesFromText = (text) => {
      const lines = String(text || '')
        .split(/\r?\n/g)
        .map((line) => String(line || '').trim())
        .filter(Boolean);

      for (const line of lines) {
        pushGpuModel(line);
      }
    };

    /** @param {string} text */
    const parseUnsignedIntegerLines = (text) => {
      const lines = String(text || '')
        .split(/\r?\n/g)
        .map((line) => String(line || '').trim())
        .filter(Boolean);

      /** @type {number[]} */
      const out = [];
      for (const line of lines) {
        if (!/^\d+$/.test(line)) continue;
        const parsed = Number(line);
        if (!Number.isFinite(parsed) || parsed <= 0) continue;
        out.push(parsed);
      }
      return out;
    };

    /** @param {number[]} values */
    const pushGpuMemoryBytesValues = (values) => {
      for (const bytesValue of values || []) {
        const numeric = Number(bytesValue);
        if (!Number.isFinite(numeric) || numeric <= 0) continue;
        const mb = numeric / (1024 ** 2);
        pushGpuMemoryMb(mb);
      }
    };

    /** @param {string} value */
    const parseMemoryTextToMb = (value) => {
      const normalized = String(value || '').trim();
      if (!normalized) return null;

      const numericMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*(tb|gb|mb|kb|bytes|byte|b)?/i);
      if (!numericMatch || !numericMatch[1]) return null;

      let numericText = String(numericMatch[1]).replace(/\s+/g, '');
      if (numericText.includes(',') && numericText.includes('.')) {
        const lastComma = numericText.lastIndexOf(',');
        const lastDot = numericText.lastIndexOf('.');
        if (lastComma > lastDot) {
          numericText = numericText.replace(/\./g, '').replace(',', '.');
        } else {
          numericText = numericText.replace(/,/g, '');
        }
      } else if (numericText.includes(',')) {
        if (/^\d{1,3}(,\d{3})+$/.test(numericText)) {
          numericText = numericText.replace(/,/g, '');
        } else {
          numericText = numericText.replace(',', '.');
        }
      } else if (numericText.includes('.')) {
        if (/^\d{1,3}(\.\d{3})+$/.test(numericText)) {
          numericText = numericText.replace(/\./g, '');
        }
      }

      const numeric = Number(numericText);
      if (!Number.isFinite(numeric) || numeric <= 0) return null;

      const unit = String(numericMatch[2] || '').toLowerCase();
      if (unit === 'tb') return numeric * 1024 * 1024;
      if (unit === 'gb') return numeric * 1024;
      if (unit === 'mb') return numeric;
      if (unit === 'kb') return numeric / 1024;
      if (unit === 'bytes' || unit === 'byte' || unit === 'b') return numeric / (1024 ** 2);

      // Heuristic for numeric-only values: treat large values as bytes.
      if (numeric > 1024 * 1024) return numeric / (1024 ** 2);
      if (numeric > 1024) return numeric / 1024;
      return numeric;
    };

    /**
     * @param {string} text
     * @param {string} tagName
     * @returns {string}
     */
    const extractXmlTag = (text, tagName) => {
      const match = String(text || '').match(new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
      return match && match[1] ? String(match[1]).trim() : '';
    };

    /** @param {string} filePath */
    const readTextFileBestEffort = async (filePath) => {
      const data = await fs.promises.readFile(filePath);
      if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
        return data.toString('utf16le');
      }
      return data.toString('utf8');
    };

    /** @param {number[]} values */
    const pushFreeDiskBytesValues = (values) => {
      for (const bytesValue of values || []) {
        pushFreeDiskBytes(bytesValue);
      }
    };

    const loadWindowsGpuHardware = async () => {
      if (process.platform !== 'win32') return;

      try {
        const wmicOutput = await runCommand('wmic', ['path', 'win32_VideoController', 'get', 'Name'], 8_000);
        parseGpuNamesFromText(wmicOutput);
      } catch {
        // Ignore WMIC availability/runtime errors and fall back to PowerShell.
      }

      try {
        const wmicRamOutput = await runCommand('wmic', ['path', 'win32_VideoController', 'get', 'AdapterRAM'], 8_000);
        pushGpuMemoryBytesValues(parseUnsignedIntegerLines(wmicRamOutput));
      } catch {
        // Ignore WMIC memory probing errors and continue to PowerShell fallback.
      }

      if (gpuModels.length < 1 || hasOnlySoftwareGpu()) {
        try {
          const psOutput = await runCommand(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-ExecutionPolicy',
              'Bypass',
              '-Command',
              'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name',
            ],
            10_000,
          );
          parseGpuNamesFromText(psOutput);
        } catch {
          // Ignore fallback errors and keep whatever we already detected.
        }
      }

      if (gpuMemoryMbCandidates.length < 1) {
        try {
          const psRamOutput = await runCommand(
            'powershell.exe',
            [
              '-NoProfile',
              '-NonInteractive',
              '-ExecutionPolicy',
              'Bypass',
              '-Command',
              'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty AdapterRAM',
            ],
            10_000,
          );
          pushGpuMemoryBytesValues(parseUnsignedIntegerLines(psRamOutput));
        } catch {
          // Ignore fallback errors and keep whatever we already detected.
        }
      }
    };

    const loadWindowsGpuMemoryViaNvidiaSmi = async () => {
      if (process.platform !== 'win32') return;

      try {
        const output = await runCommand(
          'nvidia-smi',
          ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
          8_000,
        );

        const lines = String(output || '')
          .split(/\r?\n/g)
          .map((line) => String(line || '').trim())
          .filter(Boolean);

        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length < 2) continue;

          const name = String(parts[0] || '').trim();
          const memoryText = String(parts[1] || '').trim();
          const memoryMb = parseMemoryTextToMb(memoryText);

          if (name) {
            pushGpuModel(name);
          }
          if (memoryMb != null && Number.isFinite(memoryMb) && memoryMb > 0) {
            pushGpuMemoryMb(memoryMb);
          }
        }
      } catch {
        // nvidia-smi is optional; ignore if unavailable.
      }
    };

    const loadWindowsGpuMemoryViaRegistry = async () => {
      if (process.platform !== 'win32') return;

      try {
        const output = await runCommand(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            "$items = Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Video\\*\\0000' -ErrorAction SilentlyContinue; foreach ($i in $items) { $name = [string]$i.DriverDesc; $mem = $i.'HardwareInformation.qwMemorySize'; if (-not $mem) { $mem = $i.'HardwareInformation.MemorySize' }; if ($name -and $mem) { Write-Output ($name + '|' + [string]$mem) } }",
          ],
          8_000,
        );

        const lines = String(output || '')
          .split(/\r?\n/g)
          .map((line) => String(line || '').trim())
          .filter(Boolean);

        for (const line of lines) {
          const sep = line.lastIndexOf('|');
          if (sep <= 0) continue;

          const name = String(line.slice(0, sep) || '').trim();
          const rawBytes = String(line.slice(sep + 1) || '').trim();
          const bytes = Number(rawBytes);

          if (name) {
            pushGpuModel(name);
          }

          if (!name || isLikelySoftwareGpu(name) || isLikelyVirtualGpu(name)) continue;
          if (!Number.isFinite(bytes) || bytes <= 0) continue;

          pushGpuMemoryBytesValues([bytes]);
        }
      } catch {
        // Registry probing may fail in restricted environments; ignore.
      }
    };

    const loadWindowsGpuMemoryViaDxDiag = async () => {
      if (process.platform !== 'win32') return;

      const xmlPath = path.join(
        os.tmpdir(),
        `wreck-dxdiag-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.xml`,
      );

      try {
        await runCommand('dxdiag', ['/whql:off', '/x', xmlPath], 25_000);

        const xml = await readTextFileBestEffort(xmlPath);
        const blocks = String(xml || '').match(/<DisplayDevice>[\s\S]*?<\/DisplayDevice>/gi) || [];

        for (const block of blocks) {
          const cardName = extractXmlTag(block, 'CardName') || extractXmlTag(block, 'Description');
          if (cardName) {
            pushGpuModel(cardName);
          }

          const skipVirtual = isLikelySoftwareGpu(cardName) || isLikelyVirtualGpu(cardName);
          if (skipVirtual) continue;

          const dedicated = extractXmlTag(block, 'DedicatedMemory');
          const adapterRam = extractXmlTag(block, 'AdapterRAM');
          const displayMemory = extractXmlTag(block, 'DisplayMemory');

          const dedicatedMb = parseMemoryTextToMb(dedicated);
          if (dedicatedMb != null && dedicatedMb > 0) {
            pushGpuMemoryMb(dedicatedMb);
            continue;
          }

          const adapterMb = parseMemoryTextToMb(adapterRam);
          if (adapterMb != null && adapterMb > 0) {
            pushGpuMemoryMb(adapterMb);
            continue;
          }

          const displayMb = parseMemoryTextToMb(displayMemory);
          if (displayMb != null && displayMb > 0) {
            pushGpuMemoryMb(displayMb);
          }
        }
      } catch {
        // dxdiag can be unavailable or blocked; ignore and keep detected values.
      } finally {
        await fs.promises.unlink(xmlPath).catch(() => {});
      }
    };

    const loadWindowsFreeDiskSpace = async () => {
      if (process.platform !== 'win32') return;

      try {
        const wmicDiskOutput = await runCommand(
          'wmic',
          ['logicaldisk', 'where', 'DriveType=3', 'get', 'FreeSpace'],
          8_000,
        );
        pushFreeDiskBytesValues(parseUnsignedIntegerLines(wmicDiskOutput));
      } catch {
        // Ignore WMIC disk probing errors and continue to PowerShell fallback.
      }

      if (freeDiskBytesCandidates.length > 0) return;

      try {
        const psDiskOutput = await runCommand(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            'Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" | Select-Object -ExpandProperty FreeSpace',
          ],
          10_000,
        );
        pushFreeDiskBytesValues(parseUnsignedIntegerLines(psDiskOutput));
      } catch {
        // Ignore fallback errors and keep defaults.
      }
    };

    try {
      const gpuInfo = await app.getGPUInfo('basic');
      const devices = Array.isArray(gpuInfo?.gpuDevice) ? gpuInfo.gpuDevice : [];
      for (const device of devices) {
        const deviceName = String(device?.deviceString || '').trim();
        const vendorName = String(device?.vendorString || '').trim();
        pushGpuModel(deviceName);
        pushGpuModel(vendorName);
      }
    } catch {
      // Ignore GPU probing errors and return CPU/RAM only.
    }

    if (gpuModels.length < 1 || hasOnlySoftwareGpu()) {
      await loadWindowsGpuHardware();
    } else if (gpuMemoryMbCandidates.length < 1) {
      await loadWindowsGpuHardware();
    }

    const getGpuMemoryMbMax = () => (
      gpuMemoryMbCandidates.length > 0 ? Math.max(...gpuMemoryMbCandidates) : 0
    );

    const shouldProbeGpuMemoryViaNvidiaSmi = () => {
      if (process.platform !== 'win32') return false;

      const currentMax = getGpuMemoryMbMax();
      if (currentMax < 1) return hasLikelyNvidiaGpu();

      // Win32 AdapterRAM is often capped around 4GB for larger cards.
      const adapterRamCapLike = isAdapterRamCapLike();
      return adapterRamCapLike && hasLikelyNvidiaGpu();
    };

    const shouldProbeGpuMemoryViaRegistry = () => {
      if (process.platform !== 'win32') return false;

      const currentMax = getGpuMemoryMbMax();
      if (currentMax < 1 && hasLikelyRealGpu()) return true;
      return isAdapterRamCapLike();
    };

    const shouldProbeGpuMemoryViaDxDiag = () => {
      if (process.platform !== 'win32') return false;

      // dxdiag is expensive; use it only when VRAM is still unknown.
      return getGpuMemoryMbMax() < 1 && hasLikelyRealGpu();
    };

    if (shouldProbeGpuMemoryViaNvidiaSmi()) {
      await loadWindowsGpuMemoryViaNvidiaSmi();
    }

    if (shouldProbeGpuMemoryViaRegistry()) {
      await loadWindowsGpuMemoryViaRegistry();
    }

    if (shouldProbeGpuMemoryViaDxDiag()) {
      await loadWindowsGpuMemoryViaDxDiag();
    }

    await loadWindowsFreeDiskSpace();

    const gpuMemoryMbMax = getGpuMemoryMbMax();
    const freeDiskBytesMax = freeDiskBytesCandidates.length > 0
      ? Math.max(...freeDiskBytesCandidates)
      : 0;
    const freeDiskGbMax = freeDiskBytesMax > 0
      ? Number((freeDiskBytesMax / (1024 ** 3)).toFixed(2))
      : 0;

    const profile = {
      platform: process.platform,
      arch: process.arch,
      cpuModel,
      cpuLogicalCores,
      cpuSpeedMhz,
      cpuSpeedGhz,
      totalMemoryBytes,
      totalMemoryGb,
      gpuModels,
      gpuMemoryMbMax,
      freeDiskBytesMax,
      freeDiskGbMax,
    };

    hardwareProfileCache = {
      value: profile,
      expiresAt: Date.now() + HARDWARE_PROFILE_CACHE_TTL_MS,
    };

    return profile;
    })();

    try {
      return await hardwareProfileInFlight;
    } finally {
      hardwareProfileInFlight = null;
    }
  });

  // Compatibility: still expose token fetch endpoint for legacy client-side flows.
  handle('user:get-token', async () => {
    let token = null;
    try {
      token = await getUserCtrl().getToken();
    } catch {
      token = null;
    }

    const normalizedRuntimeToken = typeof token === 'string' ? token.trim() : '';
    if (normalizedRuntimeToken) {
      writePersistedAuthToken(normalizedRuntimeToken);
      return normalizedRuntimeToken;
    }

    const persisted = readPersistedAuthToken();
    if (persisted) {
      try {
        getUserCtrl().setToken(persisted);
      } catch {
        // ignore
      }
      return persisted;
    }

    return null;
  });

  handle('user:clear-token', async () => {
    const ctrl = getUserCtrl();
    if (ctrl && typeof ctrl.clearSession === 'function') {
      await ctrl.clearSession();
    } else {
      await ctrl._invalidateToken();
    }
    clearPersistedAuthToken();
    return true;
  });

  handle('user:login', async (_event, username, password) => {
    const token = await getUserCtrl().login(String(username), String(password));
    const normalized = typeof token === 'string' ? token.trim() : '';
    if (normalized) {
      try {
        getUserCtrl().setToken(normalized);
      } catch {
        // ignore
      }
      writePersistedAuthToken(normalized);
    }
    return token;
  });

  handle('user:register', async (_event, username, password, email) => {
    const token = await getUserCtrl().register(String(username), String(password), String(email));
    const normalized = typeof token === 'string' ? token.trim() : '';
    if (normalized) {
      try {
        getUserCtrl().setToken(normalized);
      } catch {
        // ignore
      }
      writePersistedAuthToken(normalized);
    }
    return token;
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

  handleAuthed('user:get-owned-games-from-steam-by-native-userid', async ({ token }, nativeUserId) => {
    getUserCtrl().setToken(token);
    return await getUserCtrl().getOwnedGamesFromSteamByNativeUserId(nativeUserId);
  });

  handleAuthed('user:get-current-user', async ({ token }) => {
    getUserCtrl().setToken(token);
    return await getUserCtrl().getCurrentUserInfo(token);
  });

  handleAuthed('user:update-profile', async ({ token }, profilePatch) => {
    getUserCtrl().setToken(token);
    return await getUserCtrl().updateCurrentUserProfile(profilePatch, token);
  });

  handleAuthed('friends:get-mine', async ({ token }, nativeUserId) => {
    getUserCtrl().setToken(token);
    const normalizedNativeUserId = String(nativeUserId || '').trim();
    return await getUserCtrl().getFriendsWithProfiles(normalizedNativeUserId || null);
  });

  handleAuthed('native-users:search', async ({ token }, name) => {
    getUserCtrl().setToken(token);
    return await getUserCtrl().searchNativeUsersByName(String(name || '').trim());
  });

  handleAuthed('native-users:get-by-id', async ({ token }, nativeUserId) => {
    getUserCtrl().setToken(token);
    return await getUserCtrl().getNativeUserById(String(nativeUserId || '').trim());
  });

  handleAuthed('friends:add', async ({ token }, friendUserId) => {
    getUserCtrl().setToken(token);
    return await getUserCtrl().addFriend(friendUserId);
  });

  handleAuthed('friends:delete', async ({ token }, friendshipId) => {
    getUserCtrl().setToken(token);
    return await getUserCtrl().deleteFriend(friendshipId);
  });

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
    if (typeof process?.env?.LC_ALL === 'string' && process.env.LC_ALL.trim()) {
      localeCandidates.push(process.env.LC_ALL);
    }
    if (typeof process?.env?.LANG === 'string' && process.env.LANG.trim()) {
      localeCandidates.push(process.env.LANG);
    }

    for (const locale of localeCandidates) {
      const match = String(locale).match(/[-_](?<cc>[A-Za-z]{2})\b/);
      const code = normalizeCountryCode(match?.groups?.cc || match?.[1]);
      if (code) return code;
    }

    return 'DE';
  }

  async function resolvePreferredCountryCode(candidate) {
    const direct = normalizeCountryCode(candidate);
    if (direct) return direct;

    try {
      const settings = await getSettingsCtrl().getSettings();
      const candidates = [
        settings?.store?.countryCode,
        settings?.display?.countryCode,
        settings?.account?.countryCode,
      ];
      for (const entry of candidates) {
        const normalized = normalizeCountryCode(entry);
        if (normalized) return normalized;
      }
    } catch {
      // ignore and use locale fallback
    }

    return inferCountryCodeFromLocale();
  }

  // Settings (global app settings)
  handle('settings:get', async () => {
    return await getSettingsCtrl().getSettings();
  });

  handle('library-cache:get', async (_event, keyRaw) => {
    return getLibraryCacheCtrl().get(keyRaw);
  });

  handle('library-cache:set', async (_event, keyRaw, value, expiresAtRaw) => {
    return getLibraryCacheCtrl().set(keyRaw, value, expiresAtRaw);
  });

  handle('library-cache:invalidate', async (_event, keyRaw) => {
    return getLibraryCacheCtrl().invalidate(keyRaw);
  });

  handle('torrent-cache:get', async (_event, keyRaw) => {
    return getTorrentStateCacheCtrl().get(keyRaw);
  });

  handle('torrent-cache:set', async (_event, keyRaw, value) => {
    return getTorrentStateCacheCtrl().set(keyRaw, value);
  });

  handle('torrent-cache:invalidate', async (_event, keyRaw) => {
    return getTorrentStateCacheCtrl().invalidate(keyRaw);
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

    const countryCode = await resolvePreferredCountryCode(cc);
    return await getSteamCtrl().getGameDetails(token || '', Number(appID), countryCode.toLowerCase());
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

    const countryCode = await resolvePreferredCountryCode(cc);
    return await getSteamCtrl().getGameDetailsByTitle(token || '', titleText, countryCode.toLowerCase());
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
    const rawCountryCode =
      opts && typeof opts === 'object' && typeof opts.countryCode === 'string'
        ? opts.countryCode
        : 'DE';
    const countryCode = await resolvePreferredCountryCode(rawCountryCode);
    return await getGamesCtrl().getGames(Number(from), countryCode);
  });

  handle('games:search', async (_event, needle, opts) => {
    const normalizedNeedle = String(needle || '').trim();
    const tags = opts && typeof opts === 'object' && Array.isArray(opts.tags)
      ? opts.tags.map((tag) => String(tag || '').trim()).filter((tag) => !!tag)
      : [];
    return await getGamesCtrl().searchGames(normalizedNeedle, { tags });
  });
  function makeNameSlug(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  }

  const PIRATE_SCRAPE_TIMEOUT_MS = 5_000;
  const PIRATE_SCRAPE_CACHE_TTL_MS = 8 * 60_000;
  const PIRATE_SCRAPE_EMPTY_CACHE_TTL_MS = 2 * 60_000;
  /** @type {Map<string, { expiresAt: number, sites: Array<{ name: string, url: string }> }>} */
  const pirateScrapeCache = new Map();
  /** @type {Map<string, Promise<Array<{ name: string, url: string }>>>} */
  const pirateScrapeInFlight = new Map();

  /**
   * @template T
   * @param {Promise<T>} promise
   * @param {number} timeoutMs
   * @returns {Promise<{ timedOut: boolean, value: T|null, error?: unknown }>}
   */
  function withSoftTimeout(promise, timeoutMs) {
    return new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve({ timedOut: true, value: null });
      }, Math.max(0, Number(timeoutMs) || 0));

      Promise.resolve(promise)
        .then((value) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({ timedOut: false, value });
        })
        .catch((error) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({ timedOut: false, value: null, error });
        });
    });
  }

  /**
   * @param {string} slug
   * @returns {Array<{ name: string, url: string }>|null}
   */
  function readPirateScrapeCache(slug) {
    const entry = pirateScrapeCache.get(slug);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      pirateScrapeCache.delete(slug);
      return null;
    }
    return Array.isArray(entry.sites) ? entry.sites : null;
  }

  /**
   * @param {string} slug
   * @param {Array<{ name: string, url: string }>} sites
   */
  function writePirateScrapeCache(slug, sites) {
    const normalizedSites = Array.isArray(sites)
      ? sites
        .map((site) => {
          const name = String(site?.name || '').trim();
          const url = String(site?.url || '').trim();
          if (!url) return null;
          return { name, url };
        })
        .filter(Boolean)
      : [];

    pirateScrapeCache.set(slug, {
      expiresAt: Date.now() + (normalizedSites.length > 0 ? PIRATE_SCRAPE_CACHE_TTL_MS : PIRATE_SCRAPE_EMPTY_CACHE_TTL_MS),
      sites: normalizedSites,
    });
  }

  async function getPirateSitesForGame(name) {
    const slug = makeNameSlug(name);
    if (!slug) return [];

    const cachedSites = readPirateScrapeCache(slug);
    if (cachedSites) return cachedSites;

    const inFlight = pirateScrapeInFlight.get(slug);
    if (inFlight) {
      return await inFlight;
    }

    const scrapePromise = (async () => {
      const fitGirlTask = (async () => {
        try {
          const fitGirlLink = await getFitGirlCtrl().fitGirlMagnetLink(slug);
          return fitGirlLink ? { name: 'FitGirl Repacks', url: fitGirlLink } : null;
        } catch (error) {
          console.warn('Failed to fetch FitGirl link:', error);
          return null;
        }
      })();

      const pcGamesTask = (async () => {
        try {
          console.log('Attempting to fetch PCGamesTorrent link for game:', slug);
          const pcGamesTorrentLink = await getPcGamesTorrentCtrl().pcGamesTorrentMagnetLink(slug);
          return pcGamesTorrentLink ? { name: 'PCGamesTorrent', url: pcGamesTorrentLink } : null;
        } catch (error) {
          console.warn('Failed to fetch PCGamesTorrent link:', error);
          return null;
        }
      })();

      const xatabTask = (async () => {
        try {
          console.log('Attempting to fetch Xatab link for game:', slug);
          const xatabLink = await getXatabCtrl().xatabMagnetLink(slug);
          return xatabLink ? { name: 'Xatab', url: xatabLink } : null;
        } catch (error) {
          console.warn('Failed to fetch Xatab link:', error);
          return null;
        }
      })();

      const onlineFixMeTask = (async () => {
        try {
          // Online-Fix expects a space-encoded title segment (e.g. "Night%20Shippers").
          const onlineFixSlug = encodeURIComponent(String(name || '').trim());
          console.log('Attempting to fetch OnlineFixMe link for game (encoded):', onlineFixSlug);
          const link = await getOnlineFixMeCtrl().onlineFixMeMagnetLink(onlineFixSlug);
          return link ? { name: 'Online-Fix.me', url: link } : null;
        } catch (error) {
          console.warn('Failed to fetch OnlineFixMe link:', error);
          return null;
        }
      })();

      const settled = await Promise.allSettled([fitGirlTask, pcGamesTask, xatabTask, onlineFixMeTask]);
      const sites = settled
        .filter((result) => result.status === 'fulfilled' && result.value)
        .map((result) => result.value);

      writePirateScrapeCache(slug, sites);
      return sites;
    })();

    pirateScrapeInFlight.set(slug, scrapePromise);
    try {
      return await scrapePromise;
    } finally {
      pirateScrapeInFlight.delete(slug);
    }
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function normalizePirateSiteName(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    if (raw.includes('fitgirl')) return 'fitgirl';
    if (raw.includes('pcgames')) return 'pcgames';
    if (raw.includes('xatab') || raw.includes('byxatab')) return 'xatab';
    return raw.replace(/[^a-z0-9]+/g, '');
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  function normalizePirateSiteLink(value) {
    return String(value || '').trim();
  }

  /**
   * @param {any} site
   * @returns {{ nameKey: string, displayName: string, link: string }|null}
   */
  function normalizePirateSiteEntry(site) {
    if (site == null) return null;

    if (typeof site === 'string') {
      const link = normalizePirateSiteLink(site);
      if (!link) return null;
      return { nameKey: '', displayName: '', link };
    }

    if (typeof site !== 'object') return null;

    const rawName = String(site.site_name ?? site.siteName ?? site.name ?? site.label ?? '').trim();
    const link = normalizePirateSiteLink(site.link ?? site.url ?? site.href ?? '');
    if (!link) return null;

    return {
      nameKey: normalizePirateSiteName(rawName),
      displayName: rawName,
      link,
    };
  }

  /**
   * @param {Array<any>|null|undefined} backendSites
   * @param {Array<any>|null|undefined} scrapedSites
   * @returns {{ sitesToSync: Array<{ name: string, url: string }>, mergedSites: Array<{ site_name: string, link: string }> }}
   */
  function buildPirateSiteSyncPlan(backendSites, scrapedSites) {
    const backendNormalized = Array.isArray(backendSites)
      ? backendSites.map((entry) => normalizePirateSiteEntry(entry)).filter(Boolean)
      : [];
    const scrapedNormalized = Array.isArray(scrapedSites)
      ? scrapedSites.map((entry) => normalizePirateSiteEntry(entry)).filter(Boolean)
      : [];

    const backendByName = new Map();
    const backendLinks = new Set();
    for (const site of backendNormalized) {
      backendLinks.add(site.link.toLowerCase());
      if (site.nameKey && !backendByName.has(site.nameKey)) {
        backendByName.set(site.nameKey, site);
      }
    }

    /** @type {Array<{ name: string, url: string }>} */
    const sitesToSync = [];
    for (const scraped of scrapedNormalized) {
      if (scraped.nameKey) {
        const current = backendByName.get(scraped.nameKey);
        if (!current || current.link.toLowerCase() !== scraped.link.toLowerCase()) {
          sitesToSync.push({
            name: scraped.displayName || scraped.nameKey,
            url: scraped.link,
          });
        }
        continue;
      }

      if (!backendLinks.has(scraped.link.toLowerCase())) {
        sitesToSync.push({
          name: scraped.displayName || 'Pirate Download',
          url: scraped.link,
        });
      }
    }

    const mergedByKey = new Map();
    for (const site of backendNormalized) {
      const key = site.nameKey || `link:${site.link.toLowerCase()}`;
      mergedByKey.set(key, {
        site_name: site.displayName || site.nameKey || 'Pirate Download',
        link: site.link,
      });
    }

    for (const site of scrapedNormalized) {
      const key = site.nameKey || `link:${site.link.toLowerCase()}`;
      mergedByKey.set(key, {
        site_name: site.displayName || site.nameKey || 'Pirate Download',
        link: site.link,
      });
    }

    return {
      sitesToSync,
      mergedSites: Array.from(mergedByKey.values()),
    };
  }

  /**
   * @param {{
   *   token: string,
   *   appId: number,
   *   platform: string,
   *   countryCode: string,
   *   syncPlan: { sitesToSync: Array<{ name: string, url: string }> },
   *   logPrefix?: string,
   *   rethrowInvalidToken?: boolean,
   * }} params
   */
  async function uploadPirateSiteSyncPlan(params) {
    const {
      token,
      appId,
      platform,
      countryCode,
      syncPlan,
      logPrefix = '',
      rethrowInvalidToken = true,
    } = params;

    if (!token || !syncPlan || !Array.isArray(syncPlan.sitesToSync) || syncPlan.sitesToSync.length < 1) {
      return null;
    }

    try {
      const uploadSummary = await getGamesCtrl().uploadPirateSites(
        token,
        appId,
        platform,
        syncPlan.sitesToSync,
        countryCode,
      );
      console.log(`${logPrefix}Uploaded scraped pirate site changes:`, {
        attempted: syncPlan.sitesToSync.length,
        ...uploadSummary,
      });
      return uploadSummary;
    } catch (error) {
      if (rethrowInvalidToken && error && typeof error === 'object' && error.code === 'WRECK_INVALID_TOKEN') {
        throw error;
      }
      console.warn(`${logPrefix}Failed to upload scraped pirate site changes:`, error);
      return null;
    }
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

  /**
   * @param {Electron.WebContents|null|undefined} target
   * @param {{ appId: number, platform: string, pirate_sites: Array<{ site_name: string, link: string }>, source?: string }} payload
   */
  function emitPirateSitesUpdated(target, payload) {
    if (!target || typeof target.send !== 'function') return;
    if (typeof target.isDestroyed === 'function' && target.isDestroyed()) return;
    try {
      target.send('games:pirate-sites-updated', payload);
    } catch {
      // Ignore renderer teardown races.
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
    const rawCountryCode =
      typeof incoming.countryCode === 'string' && incoming.countryCode.trim()
        ? incoming.countryCode.trim()
        : 'DE';
    const countryCode = await resolvePreferredCountryCode(rawCountryCode);
    let token = typeof incoming.token === 'string' ? incoming.token.trim() : '';
    const allowPlatformFallback = incoming.allowPlatformFallback === true;

    if (!Number.isFinite(appId) || appId <= 0) throw new Error('App ID is required');
    if (!platform) throw new Error('Platform is required');

    console.log(
      `[IPC] games:get-all-details-by-appid-and-platform appId=${appId} platform=${platform} fallback=${allowPlatformFallback ? 'on' : 'off'} from=${senderUrl}`
    );

    if (!token) {
      try {
        const persistedToken = await getUserCtrl().getToken();
        token = typeof persistedToken === 'string' ? persistedToken.trim() : '';
      } catch {
        token = '';
      }
    }

    if (token) {
      try {
        getUserCtrl().setToken(token);
      } catch {
        // ignore
      }
    }

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
    let backendPirateSites = Array.isArray(gameDetails.pirate_sites) ? gameDetails.pirate_sites : [];
    if (backendPirateSites.length < 1) {
      const gameId = Number(gameDetails.id);
      if (Number.isFinite(gameId) && gameId > 0) {
        try {
          const byIdDetails = await getGamesCtrl().getAllDetailsByID(gameId, countryCode);
          const byIdPirateSites = Array.isArray(byIdDetails?.pirate_sites) ? byIdDetails.pirate_sites : [];
          if (byIdPirateSites.length > 0) {
            backendPirateSites = byIdPirateSites;
            gameDetails.pirate_sites = byIdPirateSites;
            console.log('Pirate sites loaded from game-id fallback endpoint:', byIdPirateSites.length);
          }
        } catch (error) {
          console.warn('Pirate sites game-id fallback failed:', error);
        }
      }
    }
    console.log('Pirate sites from backend:', backendPirateSites.length);
    // Always return DB state first, then scrape and push updates asynchronously.
    gameDetails.pirate_sites = backendPirateSites;

    const senderWebContents = event?.sender || null;
    const resolvedAppIdForPush = Number(gameDetails.app_id ?? appId);
    const resolvedPlatformForPush = String(gameDetails.platform_name ?? platform ?? '').trim();

    void (async () => {
      try {
        const scrapedPirateSites = await getPirateSitesForGame(gameDetails.name || '');
        const syncPlan = buildPirateSiteSyncPlan(backendPirateSites, scrapedPirateSites);

        console.log('Fetched pirate sites (background):', scrapedPirateSites.length);

        await uploadPirateSiteSyncPlan({
          token,
          appId: gameDetails.app_id ?? appId,
          platform: gameDetails.platform_name ?? platform,
          countryCode,
          syncPlan,
          logPrefix: '[background] ',
          rethrowInvalidToken: false,
        });

        if (Number.isFinite(resolvedAppIdForPush) && resolvedAppIdForPush > 0) {
          emitPirateSitesUpdated(senderWebContents, {
            appId: resolvedAppIdForPush,
            platform: resolvedPlatformForPush,
            pirate_sites: Array.isArray(syncPlan.mergedSites) ? syncPlan.mergedSites : [],
            source: 'scrape',
          });
        }
      } catch (error) {
        console.warn('Background pirate scrape failed:', error);
      }
    })();

    return gameDetails;
  });
  handle('games:get-all-details-by-id', async (event, id, opts) => {
    const senderUrl = getSenderUrl(event);
    const routeCtx = parseStoreRouteContext(senderUrl);
    const rawCountryCode =
      opts && typeof opts === 'object' && typeof opts.countryCode === 'string' && opts.countryCode.trim()
        ? opts.countryCode.trim()
        : 'DE';
    const countryCode = await resolvePreferredCountryCode(rawCountryCode);
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

  handle('games:sync-price', async (_event, payload) => {
    const incoming = payload && typeof payload === 'object' ? payload : {};
    const appId = Number(incoming.appId);
    const platform = String(incoming.platform || '').trim();
    const requestedPrice = Number(incoming.price);
    const countryCode = await resolvePreferredCountryCode(incoming.countryCode);

    if (!Number.isFinite(appId) || appId <= 0) {
      return { ok: false, updated: false, reason: 'invalid-app-id' };
    }
    if (!platform) {
      return { ok: false, updated: false, reason: 'invalid-platform' };
    }
    if (!Number.isFinite(requestedPrice) || requestedPrice <= 0) {
      return { ok: false, updated: false, reason: 'invalid-price' };
    }

    let token = typeof incoming.token === 'string' ? incoming.token.trim() : '';
    if (!token) {
      try {
        const persistedToken = await getUserCtrl().getToken();
        token = typeof persistedToken === 'string' ? persistedToken.trim() : '';
      } catch {
        token = '';
      }
    }

    if (!token) {
      return { ok: false, updated: false, reason: 'missing-token', countryCode };
    }

    try {
      getUserCtrl().setToken(token);
    } catch {
      // ignore
    }

    let details = null;
    try {
      details = await getGamesCtrl().getAllDetailsByAppIDAndPlatform(appId, platform, countryCode);
    } catch (err) {
      if (isNotFoundLikeError(err)) {
        return { ok: false, updated: false, reason: 'not-found', countryCode };
      }
      throw err;
    }

    const gameId = Number(details?.id);
    if (!Number.isFinite(gameId) || gameId <= 0) {
      return { ok: false, updated: false, reason: 'missing-game-id', countryCode };
    }

    const existingCost = Number(details?.cost);
    const isEquivalent = Number.isFinite(existingCost)
      && (
        Math.abs(existingCost - requestedPrice) <= 0.009
        || Math.abs((existingCost * 100) - requestedPrice) <= 0.9
        || Math.abs((requestedPrice * 100) - existingCost) <= 0.9
      );

    if (isEquivalent) {
      return {
        ok: true,
        updated: false,
        gameId,
        cost: existingCost,
        countryCode,
      };
    }

    await getGamesCtrl().updateGame(token, gameId, {
      cost: requestedPrice,
      country_code: countryCode,
    });

    return {
      ok: true,
      updated: true,
      gameId,
      cost: requestedPrice,
      countryCode,
    };
  });

  handle('games:sync-scraped-details', async (_event, payload) => {
    const incoming = payload && typeof payload === 'object' ? payload : {};
    const appId = Number(incoming.app_id ?? incoming.appId);
    const rawPlatform = String(incoming.platform_name ?? incoming.platform ?? '').trim();
    const normalizedPlatform = rawPlatform.toLowerCase() === 'gog.com'
      ? 'gog'
      : (rawPlatform.toLowerCase() === 'itch.io' ? 'itchio' : rawPlatform);
    const countryCode = await resolvePreferredCountryCode(incoming.countryCode ?? incoming.country_code);

    if (!Number.isFinite(appId) || appId <= 0) {
      return { ok: false, action: 'skipped', changedFields: [], gameId: null, reason: 'invalid-app-id', countryCode };
    }
    if (!normalizedPlatform) {
      return { ok: false, action: 'skipped', changedFields: [], gameId: null, reason: 'invalid-platform', countryCode };
    }

    let token = typeof incoming.token === 'string' ? incoming.token.trim() : '';
    if (!token) {
      try {
        const persistedToken = await getUserCtrl().getToken();
        token = typeof persistedToken === 'string' ? persistedToken.trim() : '';
      } catch {
        token = '';
      }
    }

    if (!token) {
      return { ok: false, action: 'skipped', changedFields: [], gameId: null, reason: 'missing-token', countryCode };
    }

    try {
      getUserCtrl().setToken(token);
    } catch {
      // ignore
    }

    const toOptionalString = (value) => {
      if (value === null || value === undefined) return null;
      const text = String(value).trim();
      return text ? text : null;
    };

    const normalizedGenreNames = (
      Array.isArray(incoming.genre_names)
        ? incoming.genre_names
        : (Array.isArray(incoming.genreNames) ? incoming.genreNames : [])
    )
      .map((entry) => String(entry || '').trim())
      .filter((entry) => !!entry);

    const costValue = incoming.cost === null || incoming.cost === undefined || incoming.cost === ''
      ? null
      : Number(incoming.cost);

    const scrapedPayload = {
      app_id: appId,
      platform_name: normalizedPlatform,
      name: toOptionalString(incoming.name ?? incoming.title),
      banner_img: toOptionalString(incoming.banner_img ?? incoming.bannerImg ?? incoming.coverImage ?? incoming.heroImage),
      description: toOptionalString(incoming.description ?? incoming.longDescription),
      minimum_requirements: toOptionalString(incoming.minimum_requirements ?? incoming.minimumRequirements),
      genre_names: normalizedGenreNames,
      country_code: countryCode,
    };

    if (Number.isFinite(costValue) && costValue >= 0) {
      scrapedPayload.cost = costValue;
    }

    try {
      const syncResult = await getGamesCtrl().syncScrapedGameWithServer(token, scrapedPayload);
      return {
        ok: true,
        countryCode,
        ...syncResult,
      };
    } catch (error) {
      const reason = error && typeof error === 'object' && error.code === 'WRECK_INVALID_TOKEN'
        ? 'invalid-token'
        : 'sync-failed';
      return {
        ok: false,
        action: 'skipped',
        changedFields: [],
        gameId: null,
        reason,
        countryCode,
        message: error instanceof Error ? error.message : String(error),
      };
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
    const loginResult = await getItchCtrl().login(id);
    return loginResult;
  });

  // Runs itch OAuth and persists the linked account in platform_users for the authed Wreck user.
  handleAuthed('itch:oauth-login-and-upload', async ({ token }, clientId) => {
    const id = String(clientId || ITCH_OAUTH_CLIENT_ID || '').trim();
    if (!id) {
      throw new Error('itch.io OAuth client ID is required. Provide it as argument or set ITCH_OAUTH_CLIENT_ID in main.js.');
    }

    const ctrl = getItchCtrl();
    let profile = null;
    let loginResult = null;

    if (ctrl.isLoggedIn()) {
      try {
        profile = await ctrl.getProfile();
      } catch {
        profile = null;
      }
    }

    if (!profile) {
      loginResult = await ctrl.login(id);
      if (!loginResult || loginResult.success !== true) {
        throw new Error('itch.io OAuth login was cancelled');
      }
      profile = await ctrl.getProfile().catch(() => null);
      const loginUserId = loginResult?.user?.id ?? null;
      const loginUsername = String(loginResult?.user?.username ?? '').trim();
      if (!profile && ((loginUserId !== null && loginUserId !== undefined) || !!loginUsername)) {
        profile = {
          id: loginUserId,
          username: loginUsername || null,
          display_name: (loginResult.user?.display_name ?? loginUsername) || null,
          url: null,
          cover_url: null,
        };
      }
    }

    const oauthToken = String(ctrl.getAccessToken() || '').trim();
    const tokenPrefix = oauthToken.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    const generatedUsername = tokenPrefix ? `itch_${tokenPrefix}` : 'itch_oauth_user';
    const profileUsername = String(
      profile?.username ??
      profile?.display_name ??
      loginResult?.user?.username ??
      generatedUsername
    ).trim() || generatedUsername;

    const profileId = String(
      profile?.id ??
      profile?.user_id ??
      profile?.userid ??
      loginResult?.user?.id ??
      profileUsername
    ).trim() || profileUsername;

    const resolvedProfile = {
      id: profileId,
      username: profileUsername,
      display_name: String(profile?.display_name ?? profileUsername).trim() || profileUsername,
      url: typeof profile?.url === 'string' ? profile.url : null,
      cover_url: typeof profile?.cover_url === 'string' ? profile.cover_url : null,
    };

    if (!oauthToken) throw new Error('itch.io OAuth token is missing after login');

    const platform = await getPlatformsCtrl().getPlatform('itchio');
    const platformId = Number(platform?.id ?? platform?.platform_id);
    if (!Number.isFinite(platformId) || platformId <= 0) {
      throw new Error('Failed to resolve itchio platform ID');
    }

    const platformUsers = await getPlatformsCtrl().getAllPlatformUserIds(token).catch(() => []);
    const existing = Array.isArray(platformUsers)
      ? platformUsers.find((row) => {
          const rowOauthToken = String(row?.oauth_token ?? row?.oauthToken ?? '').trim();
          if (rowOauthToken && rowOauthToken === oauthToken) return true;

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
        profile: resolvedProfile,
        oauthToken,
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
      profile: resolvedProfile,
      oauthToken,
    };
  });

  handle('itch:get-oauth-token', async () => {
    const oauthToken = String(getItchCtrl().getAccessToken() || '').trim();
    return oauthToken || null;
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

  handle('itch:open-game', async (_event, gameId, gameUrl) => {
    return await getItchCtrl().clientGameControlUtil(gameId, 'open', gameUrl);
  });

  handle('itch:run-game', async (_event, gameId, gameUrl, installLocation) => {
    return await getItchCtrl().clientGameControlUtil(gameId, 'run', gameUrl, installLocation);
  });

  handle('itch:install-game', async (_event, gameId, gameUrl) => {
    return await getItchCtrl().clientGameControlUtil(gameId, 'install', gameUrl);
  });

  handle('itch:delete-game', async (_event, gameId, gameUrl, installLocation) => {
    return await getItchCtrl().clientGameControlUtil(gameId, 'uninstall', gameUrl, installLocation);
  });

  // ── GOG ───────────────────────────────────────────────────────────────────

  handle('gog:get-installed-games', async () => {
    return await getGogCtrl().getInstalledGames();
  });

  handle('gog:get-client-id', async () => {
    return GOG_OAUTH_CLIENT_ID;
  });

  handle('gog:get-library', async () => {
    return await getGogCtrl().getLibraryWithUserToken();
  });

  handle('gog:oauth-login', async (_event, clientId) => {
    const id = String(clientId || GOG_OAUTH_CLIENT_ID || '').trim();
    if (!id) {
      throw new Error('GOG OAuth client ID is required. Provide it as argument or set GOG_OAUTH_CLIENT_ID in main.js.');
    }
    const loginResult = await getGogCtrl().login(id);
    return loginResult;
  });

  handleAuthed('gog:oauth-login-and-upload', async ({ token }, clientIdOrOptions) => {
    const hasOptions = !!clientIdOrOptions && typeof clientIdOrOptions === 'object' && !Array.isArray(clientIdOrOptions);
    const requestedClientId = hasOptions ? clientIdOrOptions.clientId : clientIdOrOptions;
    const forceInteractiveLogin = hasOptions
      ? clientIdOrOptions.forceInteractiveLogin !== false
      : true;

    const id = String(requestedClientId || GOG_OAUTH_CLIENT_ID || '').trim();
    if (!id) {
      throw new Error('GOG OAuth client ID is required. Provide it as argument or set GOG_OAUTH_CLIENT_ID in main.js.');
    }

    const ctrl = getGogCtrl();
    let profile = null;
    let loginResult = null;

    if (!forceInteractiveLogin && ctrl.isLoggedIn()) {
      try {
        profile = await ctrl.getProfile();
      } catch {
        profile = null;
      }
    }

    if (!profile) {
      loginResult = await ctrl.login(id);
      if (!loginResult || loginResult.success !== true) {
        const message = String(loginResult?.error || 'GOG OAuth login was cancelled').trim();
        throw new Error(message || 'GOG OAuth login was cancelled');
      }

      profile = await ctrl.getProfile().catch(() => null);
      const loginUserId = loginResult?.user?.id ?? null;
      const loginUsername = String(loginResult?.user?.username ?? '').trim();
      if (!profile && ((loginUserId !== null && loginUserId !== undefined) || !!loginUsername)) {
        profile = {
          id: loginUserId,
          username: loginUsername || null,
          display_name: loginUsername || null,
          url: null,
          cover_url: null,
        };
      }
    }

    const oauthToken = String(ctrl.getAccessToken() || '').trim();
    const tokenPrefix = oauthToken.replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    const generatedUsername = tokenPrefix ? `gog_${tokenPrefix}` : 'gog_oauth_user';

    const profileUsername = String(
      profile?.username ??
      profile?.display_name ??
      loginResult?.user?.username ??
      generatedUsername
    ).trim() || generatedUsername;

    const profileId = String(
      profile?.id ??
      profile?.user_id ??
      loginResult?.user?.id ??
      profileUsername
    ).trim() || profileUsername;

    const resolvedProfile = {
      id: profileId,
      username: profileUsername,
      display_name: String(profile?.display_name ?? profileUsername).trim() || profileUsername,
      url: typeof profile?.url === 'string' ? profile.url : null,
      cover_url: typeof profile?.cover_url === 'string' ? profile.cover_url : null,
    };

    if (!oauthToken) {
      throw new Error('GOG OAuth token is missing after login');
    }

    const platform = await getPlatformsCtrl().getPlatform('gog');
    const platformId = Number(platform?.id ?? platform?.platform_id);
    if (!Number.isFinite(platformId) || platformId <= 0) {
      throw new Error('Failed to resolve gog platform ID');
    }

    const platformUsers = await getPlatformsCtrl().getAllPlatformUserIds(token).catch(() => []);
    const existing = Array.isArray(platformUsers)
      ? platformUsers.find((row) => {
          const rowOauthToken = String(row?.oauth_token ?? row?.oauthToken ?? '').trim();
        if (rowOauthToken && rowOauthToken === oauthToken) return true;

          const rowPlatformId = Number(row?.platform_id ?? row?.platformId ?? row?.platform?.id);
          if (!Number.isFinite(rowPlatformId) || rowPlatformId !== platformId) return false;

          const rowProfileId = String(row?.platform_profile_id ?? row?.platform_prof_id ?? row?.platformProfileId ?? '').trim();
          const rowUsername = String(row?.platform_user_name ?? row?.platformUserName ?? '').trim().toLowerCase();

          if (rowProfileId) return rowProfileId === profileId;
          return rowUsername && rowUsername === profileUsername.toLowerCase();
        })
      : null;

    const existingId = existing?.id ?? existing?.platformUserID ?? existing?.platform_user_id ?? null;
    const existingOauthToken = String(existing?.oauth_token ?? existing?.oauthToken ?? '').trim();

    if (existing && existingOauthToken === oauthToken) {
      return {
        success: true,
        created: false,
        platformUserId: existingId,
        profile: resolvedProfile,
        oauthToken,
      };
    }

    if (existingId !== null && existingId !== undefined) {
      try {
        await getPlatformsCtrl().deletePlatformUser(token, String(existingId));
      } catch {
        // ignore stale entry cleanup errors and proceed with create
      }
    }

    const created = await getPlatformsCtrl().createPlatformUser(
      token,
      'gog',
      profileUsername,
      oauthToken,
      profileId,
    );

    return {
      success: true,
      created: true,
      platformUserId: created?.id ?? created?.platformUserID ?? created?.platform_user_id ?? null,
      profile: resolvedProfile,
      oauthToken,
    };
  });

  handle('gog:get-oauth-token', async () => {
    const oauthToken = String(getGogCtrl().getAccessToken() || '').trim();
    return oauthToken || null;
  });

  handle('gog:oauth-logout', async () => {
    getGogCtrl().logout();
    return { success: true };
  });

  handle('gog:oauth-status', async () => {
    const ctrl = getGogCtrl();
    return {
      isLoggedIn: ctrl.isLoggedIn(),
      hasToken: !!ctrl.getAccessToken(),
    };
  });

  handle('gog:get-profile', async () => {
    return await getGogCtrl().getProfile();
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

    const rawCountryCode =
      opts && typeof opts === 'object'
        ? opts.countryCode
        : (typeof opts === 'string' ? opts : undefined);
    const countryCode = await resolvePreferredCountryCode(rawCountryCode);
    const normalizedOpts = opts && typeof opts === 'object'
      ? { ...opts, countryCode }
      : { countryCode };

    return await getGogCtrl().getGameDetails(
      productIdText,
      token,
      normalizedOpts
    );
  });

  // Supports both call styles:
  // 1) invoke('gog:get-game-details-by-title', token, title, countryCode?)
  // 2) invoke('gog:get-game-details-by-title', title, countryCode?)
  handle('gog:get-game-details-by-title', async (_event, arg1, arg2, arg3) => {
    const looksLikeToken =
      typeof arg1 === 'string' &&
      arg1.includes('.') &&
      typeof arg2 === 'string' &&
      arg2.trim().length > 0;

    let token = '';
    let title = '';
    let countryArg = undefined;
    if (looksLikeToken) {
      token = String(arg1).trim();
      title = String(arg2).trim();
      countryArg = arg3;
    } else {
      title = String(arg1 || '').trim();
      countryArg = arg2;
    }

    if (!title) throw new Error('title is required');

    if (token) {
      try {
        getUserCtrl().setToken(token);
      } catch {
        // ignore
      }
    }

    const rawCountryCode =
      countryArg && typeof countryArg === 'object'
        ? countryArg.countryCode
        : countryArg;
    const countryCode = await resolvePreferredCountryCode(rawCountryCode);
    return await getGogCtrl().getGameDetailsByTitle(title, token, countryCode);
  });

  handle('gog:open-game', async (_event, productId) => {
    return await getGogCtrl().clientGameControlUtil(productId, 'open');
  });

  handle('gog:open-game-view', async (_event, productId) => {
    const id = String(productId || '').trim();
    if (!id || !/^\d+$/.test(id)) {
      throw new Error(`Invalid GOG product ID: ${String(productId)}`);
    }

    const url = `goggalaxy://openGameView/${encodeURIComponent(id)}`;
    await shell.openExternal(url);
    return { ok: true, url };
  });

  handle('gog:run-game', async (_event, productId) => {
    return await getGogCtrl().clientGameControlUtil(productId, 'run');
  });

  handle('gog:install-game', async (_event, productId) => {
    return await getGogCtrl().clientGameControlUtil(productId, 'install');
  });

  handle('gog:delete-game', async (_event, productId) => {
    return await getGogCtrl().clientGameControlUtil(productId, 'uninstall');
  });

  // ── Local pirate library (manual EXE-based entries) ─────────────────────

  handle('pirate-library:get-games', async () => {
    return await getPirateLibraryCtrl().getGames();
  });

  handle('pirate-library:add-game-from-dialog', async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow || null;
    return await getPirateLibraryCtrl().addGameFromDialog(ownerWindow);
  });

  handle('pirate-library:remove-game', async (_event, gameId) => {
    return await getPirateLibraryCtrl().removeGame(String(gameId || ''));
  });

  handle('pirate-library:run-game', async (_event, executablePath) => {
    return await getPirateLibraryCtrl().runGame(String(executablePath || ''));
  });

  // Cloudscraper helpers
  handle('cloudscraper:fetch', async (_event, url, options) => {
    return await getCloudscraperCtrl().fetch(String(url), options && typeof options === 'object' ? options : {});
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

  handle('xatab:magnet-link', async (_event, gameName) => {
    return await getXatabCtrl().xatabMagnetLink(String(gameName));
  });

  handle('onlinefixme:magnet-link', async (_event, gameName) => {
    return await getOnlineFixMeCtrl().onlineFixMeMagnetLink(String(gameName));
  });

  // Resolve byxatab game page URL (returns full game page URL or null)
  handle('xatab:game-page', async (_event, gameName) => {
    return await getXatabCtrl().xatabGamePageUrl(String(gameName));
  });

  
  // ── Torrent controller ────────────────────────────────────────────────────
  // progress events are pushed to the renderer via webContents.send so the
  // renderer only needs ipcRenderer.on('torrent:progress', cb).

  handle('torrent:start', async (event, magnetUri, savePath, displayName) => {
    // Decode all HTML-encoded ampersands that scrapers may leave in the magnet URI.
    const mUri  = String(magnetUri || '').trim()
      .replace(/&#0*38;/g, '&')
      .replace(/&amp;/gi, '&');
    const requestedSavePath = String(savePath || '').trim();
    const requestedDisplayName = String(displayName || '').trim();

    let configuredDefaultSavePath = '';
    if (!requestedSavePath) {
      try {
        const settings = await getSettingsCtrl().getSettings();
        configuredDefaultSavePath = String(
          settings?.downloads?.pirateTorrentsPath
          || settings?.downloads?.path
          || '',
        ).trim();
      } catch {
        configuredDefaultSavePath = '';
      }
    }

    // Keep torrent save path stable and aligned with settings/requested path.
    // Do not append displayName folders here because that can create nested paths
    // on resume when the display name changes after metadata resolution.
    let sPath = requestedSavePath || configuredDefaultSavePath || app.getPath('downloads');

    try {
      fs.mkdirSync(sPath, { recursive: true });
    } catch (mkdirError) {
      console.warn('[torrent:start] failed to prepare save path, falling back to downloads:', mkdirError);
      const fallbackRoot = app.getPath('downloads');
      sPath = fallbackRoot;
      try {
        fs.mkdirSync(sPath, { recursive: true });
      } catch {
        // keep existing sPath if fallback mkdir also fails
      }
    }

    console.log('[torrent:start] sPath:', sPath);
    if (requestedDisplayName) console.log('[torrent:start] displayName:', requestedDisplayName);
    console.log('[torrent:start] tracker count:', (mUri.match(/&tr=/g) || []).length);
    if (!mUri) throw new Error('magnetUri is required');
    const snapshot = await getTorrentCtrl().start(mUri, sPath, (progress) => {
      try { event.sender.send('torrent:progress', progress); } catch { /* window closed */ }
    }, requestedDisplayName || '');
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
    const shouldDeleteFiles = (typeof deleteFiles === 'undefined') ? true : Boolean(deleteFiles);
    /** @param {unknown} err */
    const isLockLikeFsError = (err) => {
      const code = String((/** @type {any} */ (err))?.code || '').toUpperCase();
      if (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES' || code === 'ENOTEMPTY') {
        return true;
      }
      const message = String((/** @type {any} */ (err))?.message || err || '').toLowerCase();
      return (
        message.includes('operation not permitted')
        || message.includes('resource busy')
        || message.includes('in use')
        || message.includes('being used')
      );
    };

    let result;
    try {
      result = await getTorrentCtrl().remove(String(infoHash), shouldDeleteFiles);
    } catch (err) {
      if (!isLockLikeFsError(err)) {
        throw err;
      }

      const lockMessage = String((/** @type {any} */ (err))?.message || err || 'Locked file');
      console.warn('[torrent:remove] lock-like error treated as non-fatal:', lockMessage);
      result = {
        removedFromClient: true,
        deleteRequested: shouldDeleteFiles,
        deletedTargetCount: 0,
        lockedTargets: [],
        failedTargets: [lockMessage],
      };
    }

    if (Array.isArray(result?.lockedTargets) && result.lockedTargets.length > 0) {
      console.warn('[torrent:remove] locked targets not removed:', result.lockedTargets);
    }
    if (Array.isArray(result?.failedTargets) && result.failedTargets.length > 0) {
      console.warn('[torrent:remove] failed targets not removed:', result.failedTargets);
    }
    return result;
  });

  handle('torrent:get-status', () => {
    return getTorrentCtrl().getStatus();
  });

  handle('torrent:open', async (_event, infoHash, savePath) => {
    const normalizedSavePath = String(savePath || '').trim();
    const normalizedInfoHash = String(infoHash || '').trim().toLowerCase();

    let targetPath = normalizedSavePath;
    let torrentName = '';
    if (!targetPath && normalizedInfoHash) {
      const current = getTorrentCtrl().getStatus();
      const match = current.find((item) => String(item?.infoHash || '').trim().toLowerCase() === normalizedInfoHash);
      targetPath = String(match?.savePath || match?.path || '').trim();
      torrentName = String(match?.name || '').trim();
    }

    if (targetPath && normalizedInfoHash && !torrentName) {
      const current = getTorrentCtrl().getStatus();
      const match = current.find((item) => String(item?.infoHash || '').trim().toLowerCase() === normalizedInfoHash);
      torrentName = String(match?.name || '').trim();
    }

    if (!targetPath) {
      throw new Error('Download path is unavailable for this torrent.');
    }

    let folderToOpen = targetPath;
    try {
      if (fs.existsSync(folderToOpen)) {
        const stats = fs.statSync(folderToOpen);
        if (stats.isFile()) {
          folderToOpen = path.dirname(folderToOpen);
        }
      }

      // If a subfolder with the torrent name exists, open that exact folder.
      if (torrentName) {
        const namedFolderCandidate = path.join(folderToOpen, torrentName);
        if (fs.existsSync(namedFolderCandidate) && fs.statSync(namedFolderCandidate).isDirectory()) {
          folderToOpen = namedFolderCandidate;
        }
      }
    } catch {
      // Fall back to opening the original path if fs checks fail.
      folderToOpen = targetPath;
    }

    const openError = await shell.openPath(folderToOpen);
    if (openError) {
      throw new Error(`Failed to open download path: ${openError}`);
    }

    return { ok: true, path: folderToOpen };
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

  let beforeQuitCleanupInProgress = false;
  /** @type {NodeJS.Timeout|null} */
  let forceQuitTimer = null;
  app.on('before-quit', (event) => {
    appIsQuitting = true;

    if (appTray) {
      try { appTray.destroy(); } catch { /* ignore */ }
      appTray = null;
    }

    if (beforeQuitCleanupInProgress) return;
    event.preventDefault();
    beforeQuitCleanupInProgress = true;

    const finishQuit = (forced = false) => {
      if (forceQuitTimer) {
        clearTimeout(forceQuitTimer);
        forceQuitTimer = null;
      }

      if (forced) {
        console.warn('[app] Forcing process exit after quit timeout.');
      }

      app.exit(0);
    };

    forceQuitTimer = setTimeout(() => {
      finishQuit(true);
    }, 6_000);

    Promise.resolve()
      .then(async () => {
        if (torrentCtrl && typeof torrentCtrl.destroy === 'function') {
          await torrentCtrl.destroy();
        }
      })
      .catch((err) => {
        console.warn('[torrent] Failed to destroy torrent client during quit:', err);
      })
      .finally(() => {
        torrentCtrl = null;
        finishQuit(false);
      });
  });

  app.on('activate', () => {
    if (!mainWindow || mainWindow.isDestroyed() || BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      return;
    }
    showMainWindowFromTray();
  });
});



// IPC wiring for window controls – used by MainNavbar via
// window.electronAPI.* and window.api.* from preload.

ipcMain.on('window:minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.minimize();
  }
});

ipcMain.on('window:maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) {
    mainWindow.restore();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window:close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
