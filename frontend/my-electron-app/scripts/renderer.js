

  window.addEventListener('DOMContentLoaded', async () => {
    try {
      const username = 'teszt'; // change if needed
      const token = await window.electronAPI.getToken(username);
        const platformName = 'steam';
        const platformUsername = 'freshargetinaccount69912';

        const platformUserID = await window.electronAPI.getPlatformUserID(platformName, platformUsername);
        const ownedGames = await window.electronAPI.getOwnedGamesFromSteam(platformUsername);

        const appIds = (Array.isArray(ownedGames) ? ownedGames : [])
          .map((game) => Number(game?.appid ?? game?.appID))
          .filter((n) => Number.isFinite(n) && n > 0);

        // Fetch one-by-one; the Steam store API can block large batches.
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
