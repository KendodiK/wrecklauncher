

  window.addEventListener('DOMContentLoaded', async () => {
    const username = 'teszt'; // change if needed
    const token = await window.electronAPI.getToken(username);

    const tokenDiv = document.getElementsByClassName('hello')[0];

    if (token) {
      console.log('Token received:', token);
      tokenDiv.textContent = `Token: ${token}`;
    } else {
      console.error('Failed to get token');
      tokenDiv.textContent = 'Failed to get token';
    }
  });
