// main.js
const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const Token = require('./scripts/TokenController');
const User = require('./scripts/UserController');
const username = "teszt" //implement reading from chace later
const password = "teszt" //implement chache later if viable, prob not
const path = require('path');
const tokenFile = path.join(__dirname, 'user-data', 'token.txt');
const TokenContoller = new Token(username, password, tokenFile);
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
  async () => {
  await TokenContoller.getToken();
  await getPlatformUserID('freshargetinaccount69912');}
});
ipcMain.handle('user:get-token', async (event) => {
  return TokenContoller.getToken();
});
ipcMain.handle('user:get-platform-userid', async (event, platformName, platformUsername) => {
  return getPlatformUserID(platformName, platformUsername);
});
async function getPlatformUserID(platformName, platformUsername){
  const serverurl = 'http://localhost:3000';
  try {
    const token = await TokenContoller.getToken();
    console.log("Getting Platform User ID for platform:", platformName, "username:", platformUsername);
    console.log("Token:", token);
    const url = `${serverurl}/api/platform/UserID/${platformName}/${platformUsername}/${token}`;
    console.log("Request URL:", url);
    
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
      });
    } catch (fetchError) {
      console.error("Fetch error (server might not be running):", fetchError.message);
      throw new Error(`Failed to connect to server at ${serverurl}: ${fetchError.message}`);
    }
    
    console.log("Response status:", response.status);
    console.log("Response ok:", response.ok);
    
    let data;
    try {
      data = await response.json();
      console.log("Response data:", data);
    } catch (parseError) {
      console.error("Failed to parse JSON response:", parseError.message);
      throw new Error(`Invalid JSON response from server: ${parseError.message}`);
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}, message: ${data.error || 'Unknown error'}`);
    }
    
    console.log("Platform User ID: " + data.platformUserID);
    return data.platformUserID;
  } catch (error) {
    console.error("Error fetching platform user ID:", error);
    throw error;
  }
}