// main.js
const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');

let win, tray;

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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

app.whenReady().then(() => {
  createWindow();

  tray = new Tray(path.join(__dirname, 'icons', 'app-icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => win.show() },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setToolTip('My Electron App');
  tray.setContextMenu(contextMenu);
});
ipcMain.handle('user:get-token', async (event, username) => {
  try {
    const serverurl = 'http://localhost:3000'; //implement in chache later
    const response = await fetch(`${serverurl}/api/native/token/${username}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.text(); // returns "userID.token"
    return data;
  } catch (err) {
    console.error('Failed to fetch token:', err.message);
    return null;
  }
});