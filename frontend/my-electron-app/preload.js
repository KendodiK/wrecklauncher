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
  getToken: (username) => ipcRenderer.invoke('user:get-token', username),
});
