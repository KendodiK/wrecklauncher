// Temporary smoke checks (renderer.js style).
// Enabled by default.
// Disable by setting: localStorage.setItem('wreck_smoke', '0') then reload.
// Re-enable by setting: localStorage.setItem('wreck_smoke', '1') then reload.

function ensureNoticeBanner() {
  let el = document.getElementById('notice-banner');
  if (el) return el;

  el = document.createElement('div');
  el.id = 'notice-banner';
  el.style.display = 'none';
  el.style.position = 'fixed';
  el.style.top = '12px';
  el.style.left = '12px';
  el.style.right = '12px';
  el.style.zIndex = '99999';
  el.style.padding = '10px 12px';
  el.style.borderRadius = '10px';
  el.style.background = 'rgba(15, 23, 42, 0.92)';
  el.style.color = '#e2e8f0';
  el.style.border = '1px solid rgba(148, 163, 184, 0.25)';
  el.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
  el.style.fontSize = '12px';
  el.style.maxHeight = '42vh';
  el.style.overflow = 'auto';

  const parent = document.body || document.documentElement;
  parent.appendChild(el);
  return el;
}

function showNotice(title, body, details) {
  const el = ensureNoticeBanner();
  el.style.display = 'block';

  const safeTitle = String(title || '').trim();
  const safeBody = String(body || '').trim();
  const safeDetails = String(details || '').trim();

  el.innerHTML = '';

  const h = document.createElement('div');
  const t = document.createElement('strong');
  t.textContent = safeTitle;
  h.appendChild(t);
  el.appendChild(h);

  if (safeBody) {
    const p = document.createElement('div');
    p.style.marginTop = '6px';
    p.textContent = safeBody;
    el.appendChild(p);
  }

  if (safeDetails) {
    const pre = document.createElement('pre');
    pre.style.marginTop = '8px';
    pre.textContent = safeDetails;
    el.appendChild(pre);
  }
}

function shouldRun() {
  try {
    const v = localStorage.getItem('wreck_smoke');
    if (v === '0') return false;
    if (v === '1') return true;
    return true;
  } catch {
    return true;
  }
}

export async function runSmokeControllers() {
  try {
    const hasApi = typeof window !== 'undefined' && !!window.electronAPI;
    console.log(`[smoke] window.electronAPI ${hasApi ? 'is available' : 'is NOT available'}`);
  } catch {
    // ignore
  }
  if (!shouldRun()) return;

  // If explicitly forced on (wreck_smoke === '1'), allow re-running even
  // if the one-run guard was set earlier (useful during dev / HMR).
  let isForced = false;
  try {
    isForced = localStorage.getItem('wreck_smoke') === '1';
  } catch {
    isForced = false;
  }

  // React.StrictMode in dev intentionally mounts/unmounts components twice,
  // which makes effects run twice. Use a global guard so smoke runs once
  // per page load regardless of component remounts / Fast Refresh.
  if (!isForced) {
    try {
      if (globalThis.__wreck_smoke_ran__ === true) return;
      globalThis.__wreck_smoke_ran__ = true;
    } catch {
      // ignore (very old runtimes)
    }
  }

  const api = typeof window !== 'undefined' ? window.electronAPI : null;
  if (!api) {
    showNotice('Smoke disabled', 'window.electronAPI not found (not running in Electron?)');
    return;
  }

  showNotice('Smoke running', 'Calling Electron controller IPC methods...');

  /** @type {string[]} */
  const lines = [];

  const log = (label, value) => {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    lines.push(`== ${label} ==\n${text}`);
    console.log(`[smoke] ${label}:`, value);
  };

  const warn = (label, err) => {
    const anyErr = /** @type {any} */ (err);
    const msg = err instanceof Error ? err.message : String(err);
    const causeMsg = anyErr?.cause?.message ? String(anyErr.cause.message) : '';
    const details = causeMsg && causeMsg !== msg ? `${msg}\nCause: ${causeMsg}` : msg;
    lines.push(`== ${label} (ERROR) ==\n${details}`);
    console.warn(`[smoke] ${label} failed:`, err);
  };

  const invokeFirst = async (channels, ...args) => {
    for (const ch of channels) {
      try {
        return await api.invoke(ch, ...args);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // If the handler doesn't exist, try the next channel.
        if (/No handler registered/i.test(msg) || /Error occurred in handler/i.test(msg)) {
          continue;
        }
        throw e;
      }
    }
    throw new Error(`No IPC handler available. Tried: ${channels.join(', ')}`);
  };

  // Token (optional: some endpoints may not require it, but keeping this verifies auth wiring)
  let token;
  try {
    token = await api.getToken();
    log('token', token);
  } catch (e) {
    warn('getToken', e);
    try {
      token = await api.register('teszt', 'teszt', 'teszt@example.com');
      log('register', token);
    } catch (e2) {
      warn('register', e2);
    }
  }  
  // Platforms
  try {
    const platform = await api.getPlatform('steam');
    log('getPlatform steam', platform);

    if (!platform) {
      const created = await api.createPlatform('steam');
      log('createPlatform steam', created);
    }
  } catch (e) {
    warn('getPlatform steam', e);
    try {
      const created = await api.createPlatform('steam');
      log('createPlatform steam', created);
    } catch (e2) {
      warn('createPlatform steam', e2);
    }
  }
let platformUserId;
  try{
    platformUserId = await api.getPlatformUserID('steam', 'freshargentinaccount69912');
    log('getPlatformUserID steam', platformUserId);    
  }catch(e){
    warn('getPlatformUserID steam', e);
    try {
      const platformUser = await api.createPlatformUser(
        'steam',
        'freshargentinaccount69912',
        'testpassword',
        '76561199194098023',
      );
      log('createPlatformUser', platformUser);
    } catch (e2) {
      warn('createPlatformUser', e2);
    }
  }
  try{
    const owned = await api.getOwnedGamesFromSteam('freshargentinaccount69912');
    log('getOwnedGamesFromSteam', owned);
  }catch(e){
    warn('getOwnedGamesFromSteam', e);
  }
  // try {    const details = await api.getSteamGameDetails(730, 'us');
  //   log('getSteamGameDetails 730', details);
  // } catch (e) {
  //   warn('getSteamGameDetails 730', e);
  // }
  // try{
  //   const install = await api.installSteamGame(238320);
  //   log('installSteamGame 238320', install);
  // } catch (e) {
  //   warn('installSteamGame 238320', e);
  // }
  // try{
  //   const store = await api.storePageSteam(238320);
  //   log('storePageSteam 238320', store);
  // } catch (e) {
  //   warn('storePageSteam 238320', e);
  // }
  try{
    const delete1 = await api.deleteSteamGame(239820);
    log('deleteSteamGame 239820', delete1);
  } catch (e) {
    warn('deleteSteamGame 239820', e);
  }
  // try{
  //   const run = await api.runSteamGame(2193490);
  //   log('runSteamGame 2193490', run);
  // } catch (e) {
  //   warn('runSteamGame 2193490', e);
  // }


  // try {
  //   const epic = await api.getEpicInstalledGames();
  //   log('epicInstalledGames (first 5)', Array.isArray(epic) ? epic.slice(0, 5) : epic);
  // } catch (e) {
  //   warn('getEpicInstalledGames', e);
  // }

  // Steam details (safe sample)
  // const appIds = [730, 570, 440];
  // for (const appId of appIds) {
  //   try {
  //     const details = await api.getSteamGameDetails(appId, 'us');
  //     // log(`steamDetails ${appId}`, details);
  //   } catch (e) {
  //     warn(`getSteamGameDetails ${appId}`, e);
  //   }
  // }

//   // Optional: platform/owned games (requires you to set a real Steam username)
//   const steamUsername = (import.meta?.env?.VITE_SMOKE_STEAM_USERNAME || 'freshargentinaccount69912').trim();
//   if (steamUsername) {
//     try {
//       const id = await api.getPlatformUserID('steam', steamUsername);
//       // log('platformUserID', id);
//     } catch (e) {
//       warn('getPlatformUserID', e);
//     }

//     try {
//       const owned = await api.getOwnedGamesFromSteam(steamUsername);
// //      log('ownedGamesFromSteam (first x)', owned);
//       for(const game of owned){
//         try {
//           const details = await api.getSteamGameDetails(game.appid, 'us');
//           log(`steamDetails ${game.appid}`, details);
//         } catch (e) {
//           warn(`getSteamGameDetails ${game.appid}`, e);
//         }
//       }
//     } catch (e) {
//       warn('getOwnedGamesFromSteam', e);
//     }
//   } else {
//     lines.push('== ownedGamesFromSteam ==\nSkipped (set VITE_SMOKE_STEAM_USERNAME)');
//   }

  // // GamesController.getAllDetailsByID (optional)
  // const smokeGameIdRaw = String(730).trim();
  // if (smokeGameIdRaw) {
  //   try {
  //     const details = await api.getAllDetailsByID(Number(smokeGameIdRaw));
  //     log(`getAllDetailsByID ${smokeGameIdRaw}`, details);
  //   } catch (e) {
  //     warn(`getAllDetailsByID ${smokeGameIdRaw}`, e);
  //   }
  // } else {
  //   lines.push('== getAllDetailsByID ==\nSkipped (set VITE_SMOKE_GAME_ID)');
  // }

  // Optional upload pipeline
  // const doUpload = String(import.meta?.env?.VITE_SMOKE_UPLOAD || '') === '1';
  // if (doUpload) {
  //   try {
  //     const upload = await api.getSteamGameDetailsAndUpload(730, 'us');
  //     log('steamDetailsAndUpload 730', upload);
  //   } catch (e) {
  //     warn('getSteamGameDetailsAndUpload 730', e);
  //   }
  // } else {
  //   lines.push('== steamDetailsAndUpload ==\nSkipped (set VITE_SMOKE_UPLOAD=1)');
  // }

  showNotice('Smoke finished', 'See console + details below', lines.join('\n\n'));
}

// If smoke is explicitly enabled (wreck_smoke === '1'), run automatically
// even in production builds where pages may not call runSmokeControllers.
try {
  if (typeof window !== 'undefined') {
    const forced = (() => {
      try {
        return localStorage.getItem('wreck_smoke') === '1';
      } catch {
        return false;
      }
    })();

    if (forced) {
      const start = () => {
        runSmokeControllers().catch((err) => {
          console.warn('[smoke] auto-run failed:', err);
        });
      };

      if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', start, { once: true });
      } else {
        setTimeout(start, 0);
      }
    }
  }
} catch {
  // ignore
}
