// main.js
const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const Token = require('./scripts/TokenController');
const User = require('./scripts/UserController');
const username = "teszt" //implement reading from chace later
const path = require('path');
const tokenFile = path.join(__dirname, 'user-data', 'token.txt');
const TokenContoller = new Token(username,tokenFile);
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
  TokenContoller.getToken();
});
ipcMain.handle('user:get-token', async (event) => {
  return TokenContoller.getToken();
});
