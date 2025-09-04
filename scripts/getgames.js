//76561199194098023
const userID = '76561199194098023';
const apiKey = '434EECE4774CA9E521E678472784C794';
window.addEventListener('load', async function getgames() {
  const response = await fetch('https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key='+apiKey+'&steamid='+userID+'&format=json', {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }})
  const data = await response.json();
  console.log(data);
})