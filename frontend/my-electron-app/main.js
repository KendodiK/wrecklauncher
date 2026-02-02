// main.js
const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const Token = require('./scripts/TokenController');
const User = require('./scripts/UserController');
const SteamGamesController = require('./scripts/SteamGamesController');
const username = "teszt" //implement reading from chace later
const password = "teszt" //implement chache later if viable, prob not
const path = require('path');
const fs = require('fs');
const tokenFile = path.join(__dirname, 'user-data', 'token.txt');
const serverurl = 'http://localhost:3000';
const UserController = new User(username, password, tokenFile, serverurl);
const SteamGamesCtrl = new SteamGamesController();
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
  async () => {
  await UserController.getToken();
  await UserController.getOwnedGamesFromSteam();
};
});
ipcMain.handle('user:get-token', async (event) => {
  return await UserController.getToken();
});
ipcMain.handle('user:get-platform-userid', async (event, platformName, platformUsername) => {
  return await UserController.getPlatformUserID(platformName, platformUsername);  
});
ipcMain.handle('user:get-owned-games-from-steam', async (event, platformUsername) => {
  return await UserController.getOwnedGamesFromSteam(platformUsername);  
});
ipcMain.handle('steam:get-game-details', async (event, appID, cc) => {
  return await SteamGamesCtrl.getGamesDetails(appID, cc);
});