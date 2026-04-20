const { contextBridge, ipcRenderer } = require('electron');

// Expose a small, safe API to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Generic invoke for compatibility
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),

  // Specific window controls (convenience methods)
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  toDesktop: () => ipcRenderer.invoke('window:to-desktop'),
  // User helpers
  getToken: () => ipcRenderer.invoke('user:get-token'),
  getPlatformUserID: (platformName, platformUsername) =>
    ipcRenderer.invoke('user:get-platform-userid', platformName, platformUsername),
  getOwnedGamesFromSteam: (platformUsername) =>
    ipcRenderer.invoke('user:get-owned-games-from-steam', platformUsername),

  // Steam helpers
  getSteamGameDetails: (appID, cc) => ipcRenderer.invoke('steam:get-game-details', appID, cc),
  getSteamGameDetailsAndUpload: (appID, cc) => ipcRenderer.invoke('steam:get-game-details-and-upload', appID, cc),
});
