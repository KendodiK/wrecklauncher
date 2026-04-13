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

    if (!token) {
      try {
        token = await api.login('teszt', 'teszt');
        log('login', token);
      } catch (eLogin) {
        warn('login', eLogin);
      }

      if (!token) {
        try {
          token = await api.register('teszt', 'teszt', 'teszt@example.com');
          log('register', token);
        } catch (eRegister) {
          warn('register', eRegister);
        }
      }
    }
  } catch (e) {
    warn('getToken', e);
    try {
      token = await api.login('teszt', 'teszt');
      log('login', token);
    } catch (e2) {
      warn('login', e2);
      try {
        token = await api.register('teszt', 'teszt', 'a@b.c');
        log('register', token);
      } catch (e3) {
        warn('register', e3);
      }
    }
  }  
  try{
    const installedGames = await api.getSteamInstalledGames();
    log('getSteamInstalledGames', installedGames);
  } catch (e) {
    warn('getSteamInstalledGames', e);
  }  
  try{
    console.log('Testing getAllDetailsByAppIDAndPlatform with appId=271590 (GTA V) and platform=steam');
    console.log(token)
    const details = await api.getAllDetailsByAppIDAndPlatform('271590', 'steam', token);
    log('getAllDetailsByAppIDAndPlatform', details);
    
  } catch (e) {
    warn('getAllDetailsByAppIDAndPlatform', e);
  }
  try{
    const magnetlink = await api.FitGirlMagnetLink('grand-theft-auto-v');
    log('FitGirlMagnetLink', magnetlink);
  } catch (e) {
    warn('FitGirlMagnetLink', e);
  }
//  Platforms
  // try {
  //   const platform = await api.getPlatform('steam');
  //   log('getPlatform steam', platform);
  //   if (!platform) {
  //     const created = await api.createPlatform('steam');
  //     log('createPlatform steam', created);
  //   }
  // } catch (e) {
  //   warn('getPlatform steam', e);
  //   try {
  //     const created = await api.createPlatform('steam');
  //     log('createPlatform steam', created);
  //   } catch (e2) {
  //     warn('createPlatform steam', e2);
  //   }
  // }  
    // try {
    //   const platformUser = await api.createSteamPlatformUser(
    //     'teszt',
    //     'https://steamcommunity.com/profiles/76561199194098023/',
    //   );
    //   log('createPlatformUser', platformUser);
    // } catch (e2) {
    //   warn('createPlatformUser', e2);
    // }
  // let platformUsers;
  // try {
  //   platformUsers = await api.getPlatformUsers();
  //   log('getPlatformUsers steam', platformUsers);

  //   if (!Array.isArray(platformUsers) || platformUsers.length === 0) {
  //     try {
  //       const createdUser = await api.createSteamPlatformUser(
  //         'teszt',
  //         'https://steamcommunity.com/profiles/76561199194098023/',
  //       );
  //       log('createPlatformUser', createdUser);
  //     } catch (eCreateUser) {
  //       warn('createPlatformUser', eCreateUser);
  //     }

  //     platformUsers = await api.getPlatformUsers();
  //     log('getPlatformUsers steam after create', platformUsers);
  //   }

  //   if (Array.isArray(platformUsers) && platformUsers.length > 0) {
  //     try {
  //       const firstUser = platformUsers[0] || null;
  //       const firstUserId = firstUser?.id;
  //       if (firstUserId == null) {
  //         throw new Error('No valid platform user id found to delete');
  //       }
  //       const deleted = await api.deletePlatformUser(firstUserId);
  //       log('deletePlatformUser', deleted);
  //       const afterDelete = await api.getPlatformUsers();
  //       log('getPlatformUsers after delete', afterDelete);
  //     } catch (eDelete) {
  //       warn('deletePlatformUser', eDelete);
  //     }
  //   } else {
  //     warn('getPlatformUsers steam', new Error('No platform users found to delete even after create attempt'));
  //   }
  // } catch (e) {
  //   warn('getPlatformUsers steam', e);
  // }


// let platformUserId;
//   try{
//     platformUserId = await api.getPlatformUserID('steam', 'plati69');
//     log('getPlatformUserID steam', platformUserId);    
//   }catch(e){
//     warn('getPlatformUserID steam', e);
//     try {
//       const platformUser = await api.createSteamPlatformUser(
//         'plati69',
//         'https://steamcommunity.com/id/plati69/',
//       );
//       log('createPlatformUser', platformUser);
//     } catch (e2) {
//       warn('createPlatformUser', e2);
//     }
//   }

// try{
//   let owned = await api.getOwnedGamesFromSteam('freshargentinaccount69912');
//   owned = owned && Array.isArray(owned) ? owned.slice(0, 15) : owned;
//   log('getOwnedGamesFromSteam', owned);
//   for (const game of owned) {
//     try {
//       const details = await api.getSteamGameDetails(game.appid, 'us');
//       log(`getSteamGameDetails ${game.appid}`, details);
//     } catch (e) {
//       warn(`getSteamGameDetails ${game.appid}`, e);
//     }
//   }
// }
// catch(e){
//   warn('getOwnedGamesFromSteam', e);
// } 
// try{
//   const details = await api.getSteamGameDetails(730, 'us');
//   log('getSteamGameDetails 730', details);
// } catch (e) {
//   warn('getSteamGameDetails 730', e);
// }

  // Cloudscraper smoke checks

  // if (typeof api.fetchFitGirlGameDirectDownloadLink === 'function') {
  //   try {
  //     const gogHome = await api.fetchFitGirlGameDirectDownloadLink('resident-evil-4-2023');
  //     console.log('[smoke] cloudscraperGogGamesHome full response:', gogHome);
  //     log('fetchFitGirlGameDirectDownloadLink resident-evil-4-2023', {
  //       url: gogHome,
  //     });
  //   } catch (e) {
  //     warn('cloudscraperGogGamesHome', e);
  //   }
  // } else {
  //   warn('cloudscraperGogGamesHome', new Error('cloudscraper API is not available in preload'));
  // }

  // if (typeof api.cloudscraperDodiRepacksHome === 'function') {
  //   try {
  //     const dodiHome = await api.cloudscraperDodiRepacksHome();
  //     console.log('[smoke] cloudscraperDodiRepacksHome full response:', dodiHome);
  //     log('cloudscraperDodiRepacksHome', {
  //       ok: dodiHome?.ok,
  //       statusCode: dodiHome?.statusCode,
  //       url: dodiHome?.url,
  //       bodyPreview: typeof dodiHome?.body === 'string' ? dodiHome.body.slice(0, 300) : null,
  //     });
  //   } catch (e) {
  //     warn('cloudscraperDodiRepacksHome', e);
  //   }
  // } else {
  //   warn('cloudscraperDodiRepacksHome', new Error('cloudscraper API is not available in preload'));
  // }

  // if (typeof api.cloudscraperSearchByxatab === 'function') {
  //   try {
  //     const byxatabSearch = await api.cloudscraperSearchByxatab('gta', 1);
  //     console.log('[smoke] cloudscraperSearchByxatab full response:', byxatabSearch);
  //     log('cloudscraperSearchByxatab "gta"', {
  //       ok: byxatabSearch?.ok,
  //       statusCode: byxatabSearch?.statusCode,
  //       url: byxatabSearch?.url,
  //       bodyPreview: typeof byxatabSearch?.body === 'string' ? byxatabSearch.body.slice(0, 300) : null,
  //     });
  //   } catch (e) {
  //     warn('cloudscraperSearchByxatab', e);
  //   }
  // } else {
  //   warn('cloudscraperSearchByxatab', new Error('cloudscraper API is not available in preload'));
  // }

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
  // try{
  //   const delete1 = await api.deleteSteamGame(239820);
  //   log('deleteSteamGame 239820', delete1);
  // } catch (e) {
  //   warn('deleteSteamGame 239820', e);
  // }
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

  // try {   const comingSoon = await api.ComingSoonGames(0);
  //   log('ComingSoonGames', Array.isArray(comingSoon) ? comingSoon.slice(0, 5) : comingSoon);
  // } catch (e) {
  //   warn('ComingSoonGames', e);
  // }
  // try {   const discounted = await api.DiscountedGames(0);
  //   log('DiscountedGames', Array.isArray(discounted) ? discounted.slice(0, 5) : discounted);
  // } catch (e) {
  //   warn('DiscountedGames', e);
  // }
  // try {   const featured = await api.FeaturedGames(0);
  //   log('FeaturedGames', Array.isArray(featured) ? featured.slice(0, 5) : featured);
  // } catch (e) {
  //   warn('FeaturedGames', e);
  // }

  // try{
  //   const games = await api.getGames(1);
  //   log('getGames from 1', games);
  // } catch (e) {
  //   warn('getGames', e);
  // }

  // ── Torrent ──────────────────────────────────────────────────────────────────
  // torrentGetStatus is always safe: it returns whatever is currently active.
  // if (typeof api.torrentGetStatus === 'function') {
  //   try {
  //     const status = await api.torrentGetStatus();
  //     log('torrentGetStatus', status);
  //   } catch (e) {
  //     warn('torrentGetStatus', e);
  //   }
  // } else {
  //   warn('torrentGetStatus', new Error('torrent API not available in preload'));
  // }

  // Full end-to-end: fetch a FitGirl magnet link then start the torrent.
  // Un-comment the block below and set a real slug + save path to test.
  // Progress events stream in via onTorrentProgress for the lifetime of the download.
  
  if (typeof api.PcGamesTorrentMagnetLink === 'function' && typeof api.torrentStart === 'function') {
    // let unsub = null;
    // try {
    //   const slug = 'the-roottrees-are-dead-free-download'; // replace with any igg-games slug
    //   log('PcGamesTorrentMagnetLink', `fetching magnet for "${slug}"…`);
    //   const magnet = await api.PcGamesTorrentMagnetLink(slug);
    //   log('PcGamesTorrentMagnetLink', magnet ?? '(null – no magnet found on page)');
  
      // if (magnet) {
      //   // Subscribe to live progress pushes BEFORE calling start so no event is missed.
      //   unsub = api.onTorrentProgress((p) => {
      //     if (!p || typeof p !== 'object') { console.warn('[smoke] torrent:progress – bad payload', p); return; }
      //     const fmt = (n, decimals = 1) => (typeof n === 'number' && !Number.isNaN(n) ? n.toFixed(decimals) : '?');
      //     const label = `torrent:progress  ${p.name ?? p.infoHash ?? '?'}`;
      //     const summary = {
      //       progress:      `${fmt(p.progress * 100, 2)}%`,
      //       downloadSpeed: `${fmt((p.downloadSpeed ?? 0) / 1024)} KB/s`,
      //       uploadSpeed:   `${fmt((p.uploadSpeed   ?? 0) / 1024)} KB/s`,
      //       downloaded:    `${fmt((p.downloaded    ?? 0) / 1024 / 1024, 2)} MB`,
      //       length:        `${fmt((p.length        ?? 0) / 1024 / 1024, 2)} MB`,
      //       peers:         p.numPeers ?? 0,
      //       timeRemaining: (p.timeRemaining < 0 || !Number.isFinite(p.timeRemaining))
      //         ? '∞'
      //         : `${Math.ceil(p.timeRemaining / 1000)}s`,
      //       paused:        p.paused ?? false,
      //       done:          p.done   ?? false,
      //     };
      //     console.log(`[smoke] ${label}:`, summary);
      //     // Overwrite the previous progress entry so the banner doesn't grow unboundedly.
      //     const entry = `== ${label} ==\n${JSON.stringify(summary, null, 2)}`;
      //     const idx = lines.findIndex((l) => l.startsWith(`== torrent:progress`));
      //     if (idx !== -1) lines[idx] = entry; else lines.push(entry);
      //     showNotice('Smoke – torrent active', 'Live progress below ↓', lines.join('\n\n'));
      //   });
  
      //   // savePath defaults to ~/Downloads – override the second arg if needed.
      //   const initial = await api.torrentStart(magnet /*, 'C:\\Games\\Downloads' */);
      //   log('torrentStart initial snapshot', initial);
      // }
    // } catch (e) {
    //   warn('torrentStart', e);
    // }
    // To stop watching: unsub?.();
    // To pause:         api.torrentPause(infoHash);
    // To resume:        api.torrentResume(infoHash);
    // To remove:        api.torrentRemove(infoHash, deleteFiles);
  }

  // ── Itch.io scrape test ──────────────────────────────────────────────────
  // let itchGames;
  // try {
  //   itchGames = await api.getItchGameDetails(3184368);
  //   log('getItchGameDetails', Array.isArray(itchGames) ? itchGames.slice(0, 5) : itchGames);
  // } catch (e) {
  //   warn('getItchGameDetails', e);
  // }



  // ── GOG scrape test ──────────────────────────────────────────────────────
//   let gogGames;
//   try {
//     gogGames = await api.getGogGameDetails(1900078583);
//     log('getGogGameDetails', gogGames);
//   } catch (e) {
//     warn('getGogGameDetails', e);
//   }
//   showNotice('Smoke done', 'See console + details below', lines.join('\n\n'));
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
