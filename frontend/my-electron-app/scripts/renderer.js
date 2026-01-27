

  window.addEventListener('DOMContentLoaded', async () => {
    try {
      const username = 'teszt'; // change if needed
      const token = await window.electronAPI.getToken(username);
      console.log('Token received:', token);
      
      const platformUserID = await window.electronAPI.invoke('user:get-platform-userid', 'steam', 'freshargetinaccount69912');
      console.log('Platform User ID:', platformUserID);
      
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
