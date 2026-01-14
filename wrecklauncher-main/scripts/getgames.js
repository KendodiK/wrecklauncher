//76561199194098023
const username = 'teszt';
const steamusername = 'freshargetinaccount69912';
const serverurl = 'http://localhost:3000'
window.addEventListener('load', async function getgames() {
  const url = `${serverurl}/api/steam/OwnedGames/${encodeURIComponent(username)}/${encodeURIComponent(steamusername)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  const data = await response.json();
  console.log(data);
})