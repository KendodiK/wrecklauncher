// main.js
const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const { spawn } = require('child_process');
const net = require('net');
const http = require('http');
const username = "teszt" //implement reading from chace later
const password = "teszt" //implement chache later if viable, prob not
const path = require('path');
const fs = require('fs');
function getTokenFilePath() {
  // In packaged builds, __dirname points into app.asar (not writable).
  // Use userData so LocalApi can write/read tokens if needed.
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'token.txt')
    : path.join(__dirname, 'user-data', 'token.txt');
}
// Backend base URL passed to LocalApi.
// Prefer HTTP dev port (3001) to avoid TLS trust issues that can slow startup.
const serverurl = process.env.WRECK_BACKEND_URL || 'http://127.0.0.1:3001';
let localApiProcess;
let localApiBaseUrl;
let win, tray;

process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason);
});

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        const status = res.statusCode || 0;
        if (status < 200 || status >= 300) {
          const err = new Error(`HTTP ${status} for ${url}`);
          err.statusCode = status;
          err.body = body;
          reject(err);
          return;
        }
        try {
          resolve(body ? JSON.parse(body) : null);
        } catch (e) {
          const err = new Error(`Invalid JSON from ${url}`);
          err.cause = e;
          err.body = body;
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error(`Timeout for ${url}`));
    });
  });
}

function httpRequestJson(url, method, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      url,
      {
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => {
          const status = res.statusCode || 0;
          if (status < 200 || status >= 300) {
            const err = new Error(`HTTP ${status} for ${url}`);
            err.statusCode = status;
            err.body = text;
            reject(err);
            return;
          }
          try {
            resolve(text ? JSON.parse(text) : null);
          } catch (e) {
            const err = new Error(`Invalid JSON from ${url}`);
            err.cause = e;
            err.body = text;
            reject(err);
          }
        });
      }
    );

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error(`Timeout for ${url}`));
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function runToolJson(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const stderrSnippet = String(stderr || '').trim().slice(0, 2000);
        const err = new Error(
          `Tool failed (exit ${code}): ${command}${stderrSnippet ? `\n\n${stderrSnippet}` : ''}`
        );
        err.code = code;
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
        return;
      }
      try {
        resolve(stdout ? JSON.parse(stdout) : null);
      } catch (e) {
        const err = new Error(`Tool returned invalid JSON: ${command}`);
        err.cause = e;
        err.stderr = stderr;
        err.stdout = stdout;
        reject(err);
      }
    });
  });
}

async function getEpicInstalledGamesNoToken() {
  // Prefer the shipped EXE (Option A). Fall back to the dev JS tool if the EXE isn't present.
  const packagedExePath = path.join(process.resourcesPath, 'tools', 'epic-installed-scan.exe');
  const devExePath = path.join(__dirname, 'tools-bin', 'epic-installed-scan.exe');
  const exePath = app.isPackaged ? packagedExePath : devExePath;

  if (fs.existsSync(exePath)) {
    // In packaged builds, __dirname is inside app.asar, which is not a valid process cwd.
    return await runToolJson(exePath, [], { cwd: path.dirname(exePath), windowsHide: true });
  }

  const scriptPath = path.join(__dirname, 'tools', 'epic-installed-scan.js');
  return await runToolJson('node', [scriptPath], { cwd: __dirname, windowsHide: true });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : null;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(baseUrl, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const health = await httpGetJson(`${baseUrl}/health`);
      if (health && health.ok) return;
    } catch {
      // ignore until timeout
    }
    await sleep(250);
  }
  throw new Error(`LocalApi health check timed out after ${timeoutMs}ms: ${baseUrl}`);
}

async function startLocalApi() {
  const port = await getFreePort();
  if (!port) throw new Error('Failed to allocate a free port for LocalApi');

  const urls = `http://127.0.0.1:${port}`;

  localApiBaseUrl = urls;

  // Packaged build should not depend on the .NET SDK. Prefer a shipped LocalApi EXE.
  const packagedLocalApiExe = path.join(process.resourcesPath, 'localapi', 'WreckLauncher.LocalApi.exe');
  const devLocalApiExe = path.join(__dirname, 'localapi-bin', 'WreckLauncher.LocalApi.exe');
  const localApiExe = app.isPackaged ? packagedLocalApiExe : devLocalApiExe;

  // Dev quality-of-life: prefer `dotnet run` so changes in C# take effect immediately.
  // Packaged builds should never depend on the .NET SDK, so they use the shipped EXE.
  const useExe = app.isPackaged && fs.existsSync(localApiExe);
  const command = useExe ? localApiExe : 'dotnet';
  const args = useExe
    ? ['--urls', urls]
    : ['run', '--project', path.join(__dirname, 'csharp', 'LocalApi', 'WreckLauncher.LocalApi.csproj'), '--urls', urls];

  const spawnCwd = useExe ? path.dirname(localApiExe) : __dirname;

  localApiProcess = spawn(command, args, {
    cwd: spawnCwd,
    env: {
      ...process.env,
      WRECK_USERNAME: username,
      WRECK_PASSWORD: password,
      WRECK_TOKEN_FILE: getTokenFilePath(),
      WRECK_BACKEND_URL: serverurl,
    },
    stdio: 'pipe',
    windowsHide: true,
  });

  // Surface spawn failures to the caller (so app startup can fail gracefully).
  const spawnErrorPromise = new Promise((_, reject) => {
    localApiProcess.once('error', reject);
  });

  localApiProcess.stdout.on('data', (d) => console.log(`[LocalApi] ${String(d).trimEnd()}`));
  localApiProcess.stderr.on('data', (d) => console.warn(`[LocalApi] ${String(d).trimEnd()}`));
  localApiProcess.on('exit', (code, signal) => {
    console.warn(`[LocalApi] exited (code=${code}, signal=${signal})`);
    localApiProcess = undefined;
  });

  await Promise.race([waitForHealth(localApiBaseUrl), spawnErrorPromise]);
  console.log(`[LocalApi] ready at ${localApiBaseUrl}`);
}

function stopLocalApi() {
  if (!localApiProcess || localApiProcess.killed) return;
  try {
    localApiProcess.kill();
  } catch (e) {
    console.warn('Failed to stop LocalApi process', e);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),

      // Electron 20+ increasingly encourages sandboxing; however our preload uses
      // Node-style requires (electron ipcRenderer) and a contextBridge API.
      // Make this explicit to avoid "sandboxed_renderer.bundle" failures.
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');
}

ipcMain.handle('window:minimize', () => win.minimize());
ipcMain.handle('window:maximize', () => {
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.handle('window:close', () => win.close());
ipcMain.handle('window:to-desktop', () => win.hide());

app.whenReady().then(async () => {
  // Required: LocalApi is now the only implementation.
  try {
    await startLocalApi();
  } catch (e) {
    console.error('LocalApi failed to start; quitting app.', e);
    app.quit();
    return;
  }

  createWindow();

  // Tray icon is optional; don't crash app startup if missing.
  const trayIconPath = path.join(__dirname, 'img', 'oneletrajz.png');
  if (fs.existsSync(trayIconPath)) {
    tray = new Tray(trayIconPath);
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show App', click: () => win.show() },
      { label: 'Quit', click: () => app.quit() },
    ]);
    tray.setToolTip('My Electron App');
    tray.setContextMenu(contextMenu);
  } else {
    console.warn(`Tray icon not found at ${trayIconPath}; skipping tray.`);
  }
});

app.on('will-quit', () => {
  stopLocalApi();
});

app.on('window-all-closed', () => {
  // Default Electron behavior on Windows is to quit; keep it explicit for clarity.
  console.log('[main] window-all-closed');
  app.quit();
});
ipcMain.handle('user:get-token', async (event) => {
  if (!localApiBaseUrl) throw new Error('LocalApi not ready');
  return await httpGetJson(`${localApiBaseUrl}/user/token`);
});
ipcMain.handle('user:get-platform-userid', async (event, platformName, platformUsername) => {
  if (!localApiBaseUrl) throw new Error('LocalApi not ready');
  try {
    const res = await httpGetJson(
      `${localApiBaseUrl}/platform/userid/${encodeURIComponent(platformName)}/${encodeURIComponent(platformUsername)}`
    );
    return res?.platformUserID ?? null;
  } catch (e) {
    // Don't crash renderer flows if backend has a temporary/broken endpoint.
    console.warn('[ipc] user:get-platform-userid failed:', e);
    return null;
  }
});
ipcMain.handle('user:get-owned-games-from-steam', async (event, platformUsername) => {
  if (!localApiBaseUrl) throw new Error('LocalApi not ready');
  try {
    return await httpGetJson(`${localApiBaseUrl}/steam/owned-games/${encodeURIComponent(platformUsername)}`);
  } catch (e) {
    console.warn('[ipc] user:get-owned-games-from-steam failed:', e);
    return [];
  }
});
ipcMain.handle('steam:get-game-details', async (event, appID, cc) => {
  if (!localApiBaseUrl) throw new Error('LocalApi not ready');
  try {
    const url = new URL(`${localApiBaseUrl}/steam/appdetails/${encodeURIComponent(appID)}`);
    if (cc) url.searchParams.set('cc', cc);
    return await httpGetJson(url.toString());
  } catch (e) {
    console.warn('[ipc] steam:get-game-details failed:', e);
    return null;
  }
});

ipcMain.handle('steam:get-game-details-and-upload', async (event, appID, cc) => {
  if (!localApiBaseUrl) throw new Error('LocalApi not ready');
  try {
    const url = new URL(`${localApiBaseUrl}/steam/appdetails/${encodeURIComponent(appID)}/upload`);
    if (cc) url.searchParams.set('cc', cc);
    return await httpRequestJson(url.toString(), 'POST');
  } catch (e) {
    console.warn('[ipc] steam:get-game-details-and-upload failed:', e);
    return null;
  }
});

ipcMain.handle('epic:get-installed-games', async () => {
  // No-token method: scan local Epic Launcher manifests using our tool.
  // Note: this returns *installed* games, not the full owned library.
  return await getEpicInstalledGamesNoToken();
});