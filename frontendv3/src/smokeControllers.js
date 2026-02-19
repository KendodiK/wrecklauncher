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

  document.body.appendChild(el);
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
  if (!shouldRun()) return;

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

  let token;
  try {
    token = await api.getToken();
    log('token', token);
  } catch (e) {
    warn('getToken', e);
  }

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

  const steamUsername = (import.meta?.env?.VITE_SMOKE_STEAM_USERNAME || 'freshargentinaccount69912').trim();
  if (steamUsername) {
    try {
      const id = await api.getPlatformUserID('steam', steamUsername);
      // log('platformUserID', id);
    } catch (e) {
      warn('getPlatformUserID', e);
    }

    try {
      const owned = await api.getOwnedGamesFromSteam(steamUsername);
//      log('ownedGamesFromSteam (first x)', owned);
      for(const game of owned){
        try {
          const details = await api.getSteamGameDetails(game.appid, 'us');
          log(`steamDetails ${game.appid}`, details);
        } catch (e) {
          warn(`getSteamGameDetails ${game.appid}`, e);
        }
      }
    } catch (e) {
      warn('getOwnedGamesFromSteam', e);
    }
  } else {
    lines.push('== ownedGamesFromSteam ==\nSkipped (set VITE_SMOKE_STEAM_USERNAME)');
  }

  // GamesController.getAllDetailsByID (optional)
  // const smokeGameIdRaw = String(3595230).trim();
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
