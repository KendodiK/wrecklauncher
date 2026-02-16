// Temporary smoke checks (renderer.js style).
// Enable by setting: localStorage.setItem('wreck_smoke', '1') then reload.
// Disable: localStorage.removeItem('wreck_smoke')

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
    return localStorage.getItem('wreck_smoke') === '1';
  } catch {
    return false;
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
    const msg = err instanceof Error ? err.message : String(err);
    lines.push(`== ${label} (ERROR) ==\n${msg}`);
    console.warn(`[smoke] ${label} failed:`, err);
  };
var token;
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
  const appIds = [730, 570, 440];
  for (const appId of appIds) {
    try {
      const details = await api.getSteamGameDetails(token, appId, 'us');
      log(`steamDetails ${appId}`, details);
    } catch (e) {
      warn(`getSteamGameDetails ${appId}`, e);
    }
  }

  // Optional: platform/owned games (requires you to set a real Steam username)
  const steamUsername = (import.meta?.env?.VITE_SMOKE_STEAM_USERNAME || 'freshargetinaccount69912').trim();
  if (steamUsername) {
    try {
      const id = await api.getPlatformUserID('steam', steamUsername);
      log('platformUserID', id);
    } catch (e) {
      warn('getPlatformUserID', e);
    }

    try {
      const owned = await api.getOwnedGamesFromSteam(steamUsername);
      log('ownedGamesFromSteam (first 10)', owned);
      for(const game of owned){
        try {
          const details = await api.getSteamGameDetails(token, game.appid, 'us');
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
  try{
    const details = await api.getAllDetailsByID(token, 730);
    log(`getAllDetailsByID 730`, details);
  } catch (e) {
    warn(`getAllDetailsByID 730`, e);
  }

  // Optional upload pipeline
  // const doUpload = String(import.meta?.env?.VITE_SMOKE_UPLOAD || '') === '1';
  // if (doUpload) {
  //   try {
  //     const upload = await api.getSteamGameDetailsAndUpload(token, 730, 'us');
  //     log('steamDetailsAndUpload 730', upload);
  //   } catch (e) {
  //     warn('getSteamGameDetailsAndUpload 730', e);
  //   }
  // } else {
  //   lines.push('== steamDetailsAndUpload ==\nSkipped (set VITE_SMOKE_UPLOAD=1)');
  // }

  showNotice('Smoke finished', 'See console + details below', lines.join('\n\n'));
}
