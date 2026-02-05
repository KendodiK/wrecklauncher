

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

        const epicInstalled = await window.electronAPI.getEpicInstalledGames();
        console.log('Epic installed games:', epicInstalled);

        const platformUserID = await window.electronAPI.getPlatformUserID(platformName, platformUsername);
        const ownedGames = (await window.electronAPI.getOwnedGamesFromSteam(platformUsername));
        console.log('Owned games from Steam:', ownedGames);
        const appIds = (Array.isArray(ownedGames) ? ownedGames : [])
          .map((game) => Number(game?.appid ?? game?.appID))
          .filter((n) => Number.isFinite(n) && n > 0);
        for (const appId of appIds) {
          try {
            console.log(await window.electronAPI.getSteamGameDetails(appId));
          } catch (e) {
            console.warn('Failed to fetch Steam details for', appId, e);
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
