// Legacy entry point.
// The app's canonical Electron main process entry is `electron/main.js`.
// Keeping this file as a thin delegate avoids "missing IPC handler" issues
// when older scripts/tools still point at `electron-main.js`.

require('./electron/main.js');
