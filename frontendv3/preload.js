const { contextBridge, ipcRenderer } = require('electron');

// Expose a focused, safe API for the renderer. This mirrors
// the patterns expected by your old ui.js (window.electronAPI
// and window.api.invoke / window.api.*).

contextBridge.exposeInMainWorld('electronAPI', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // Controller helpers (serverless modules in Electron main)
  getToken: () => ipcRenderer.invoke('user:get-token'),
  register: (username, password, email) =>
    ipcRenderer.invoke('user:register', username, password, email),
  getPlatformUserID: (platformName, platformUsername) =>
    ipcRenderer.invoke('user:get-platform-userid', platformName, platformUsername),
  createPlatform: (platformName) => ipcRenderer.invoke('platform:create-platform', platformName),
  createPlatformUser: (platformName, platformUsername, platformPassword, platformProfileId) => ipcRenderer.invoke('platform:create-user', platformName, platformUsername, platformPassword, platformProfileId),
  getPlatform: (platformName) => ipcRenderer.invoke('platform:get', platformName),
  getOwnedGamesFromSteam: (platformUsername) =>
    ipcRenderer.invoke('user:get-owned-games-from-steam', platformUsername),
  getSteamGameDetails: (appID, cc) => ipcRenderer.invoke('steam:get-game-details', appID, cc),
  getSteamGameDetailsAndUpload: (appID, cc) => ipcRenderer.invoke('steam:get-game-details-and-upload', appID, cc),
  getEpicInstalledGames: () => ipcRenderer.invoke('epic:get-installed-games'),

  // GamesController
  getAllDetailsByID: (id) => ipcRenderer.invoke('games:get-all-details-by-id', id),
});

// Optional legacy-style alias used by some code paths
contextBridge.exposeInMainWorld('api', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
});
