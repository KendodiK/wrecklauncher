

  window.addEventListener('DOMContentLoaded', async () => {
    try {
      const username = 'teszt'; // change if needed
      const token = await window.electronAPI.getToken(username);
      const platformUserID = await window.electronAPI.invoke('user:get-platform-userid', 'steam', 'freshargetinaccount69912');
      const ownedGames = await window.electronAPI.invoke('user:get-owned-games-from-steam', 'freshargetinaccount69912');
      for (const game of ownedGames) {
        const appId = game?.appid ?? game?.appID;
        if (!appId) {
          console.warn('Owned game missing appid:', game);
          continue;
        }
        await window.electronAPI.invoke('steam:get-game-details', appId);
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
