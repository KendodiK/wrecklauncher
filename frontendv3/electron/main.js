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

  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
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
