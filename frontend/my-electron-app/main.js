// main.js
const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs/promises');
let win, tray;
const tokenFile = path.join(__dirname, 'user-data', 'token.txt');
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
  generateToken('teszt',true);//username bekérdezés later
});
ipcMain.handle('user:get-token', async (event, username) => {
  return await generateToken(username);
});
/**
 * 
 * saves token to tokenFile, requires fs library
 * 
 * @param {string} token the users userid+"."+token from database
 */
async function saveToken(token) {
  try {
    await fs.mkdir(path.dirname(tokenFile), { recursive: true });
    await fs.writeFile(tokenFile, token, 'utf-8');
    console.log('Token saved to file');
  } catch (err) {
    console.error('Failed to save token:', err.message);
  }
}
/**
 * 
 * gets token from local file from tokenFile and returns it, requires fs library
 * 
 * @returns token or if not found null
 */
async function getToken() {
  try {
    const token = await fs.readFile(tokenFile, 'utf-8');
    return token;
  } catch (err) {
    if (err.code === 'ENOENT') return null; // file not found
    console.error('Failed to read token:', err.message);
    return null;
  }
}
/**
 * 
 * Generates token only if specified or cannot read it from file
 * 
 * @param {string} username native username of the user
 * @param {boolean} generate whether to generate a new token or not, should only generate a new when the app is building itself
 * @returns {string} token (userid.token is the structure of the string)
 */
async function generateToken(username, generate = false) {
  try {
    // 1️⃣ Try reading existing token    
    let token = await getToken();
    if (token && !generate) {
      console.log('Using saved token:', token);
      return token;    
  }
    // 2️⃣ Token doesn't exist → fetch from server
    const serverurl = 'http://localhost:3000';
    const response = await fetch(`${serverurl}/api/native/token/${username}`, {
      method: 'POST',
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    token = await response.text();

    // 3️⃣ Save token for future use
    await saveToken(token);
    console.log('Generated and saved new token:', token);
    return token;
  } catch (err) {
    console.error('Failed to fetch token:', err.message);
    return null;
  }
}