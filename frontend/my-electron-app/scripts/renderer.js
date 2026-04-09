

  window.addEventListener('DOMContentLoaded', async () => {
    function ensureNoticeBanner() {
      let el = document.getElementById('notice-banner');
      if (el) return el;

      el = document.createElement('div');
      el.id = 'notice-banner';
      el.className = 'notice-banner';
      el.style.display = 'none';

      const parent = document.getElementById('app-content') || document.body;
      parent.prepend(el);
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
        pre.textContent = safeDetails;
        el.appendChild(pre);
      }
    }

    try {
      const token = await window.electronAPI.getToken();
        const platformName = 'steam';
        const platformUsername = 'freshargetinaccount69912';
        //const platformUsername = 'Szbarni06';

        // These backend calls may be temporarily broken; don't block app startup on them.
        let platformUserID = null;
        try {
          platformUserID = await window.electronAPI.getPlatformUserID(platformName, platformUsername);
        } catch (e) {
          console.warn('getPlatformUserID failed (ignored):', e);
        }

        let appIds = [];
        try {
          const ownedGames = (await window.electronAPI.getOwnedGamesFromSteam(platformUsername));
          console.log('Owned games from Steam:', ownedGames);
          appIds = (Array.isArray(ownedGames) ? ownedGames : [])
            .map((game) => Number(game?.appid ?? game?.appID ?? game?.appId ?? game?.AppId))
            .filter((n) => Number.isFinite(n) && n > 0);
        } catch (e) {
          console.warn('getOwnedGamesFromSteam failed (ignored):', e);
        }

        // If we couldn't get owned games, still validate the Steam-details+upload pipeline with a small sample.
        if (!Array.isArray(appIds) || appIds.length === 0) {
          appIds = [730, 570, 440]; // CS2, Dota 2, TF2
        }

        // Keep startup snappy: limit how many uploads we do on page load.
        for (const appId of appIds.slice(0, 5)) {
          try {
            console.log(await window.electronAPI.getSteamGameDetailsAndUpload(appId));
          } catch (e) {
            console.warn('Failed to fetch Steam details/upload for', appId, e);
          }
          await new Promise((r) => setTimeout(r, 200));
        }

      const tokenDiv = document.getElementsByClassName('hello')[0];
      if (platformUserID) {
        tokenDiv.textContent = `Platform User ID: ${platformUserID}`;
      } else {
        console.error('Failed to get platform user ID');
        tokenDiv.textContent = 'Failed to get platform user ID';
      }
    } catch (error) {
      console.error('Error in DOMContentLoaded:', error);
      const tokenDiv = document.getElementsByClassName('hello')[0];
      if (tokenDiv) {
        tokenDiv.textContent = `Error: ${error.message}`;
      }
    }
  });
