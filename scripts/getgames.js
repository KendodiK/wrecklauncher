//76561199194098023
const username = 'teszt';
const steamusername = 'freshargetinaccount69912';
const serverurl = 'http://localhost:3000'
const appid = 22330 // ideiglenes, tesztelésre, majd végig kell lépkedni a játékokon
const gamename = "SILENT HILL f-RUNE"
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// inside your loop
window.addEventListener("DOMContentLoaded", async function getgames() {
  const url = `${serverurl}/api/steam/OwnedGames/${encodeURIComponent(username)}/${encodeURIComponent(steamusername)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  const data = await response.json();
  console.log(data);
  for(let i = 0; i< data.response.game_count; i++){
  // for(let i = 0; i< 10; i++){
    const url2 = `${serverurl}/api/steam/GameDetails/${data.response.games[i].appid}`
    const response2 = await fetch(url2, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  const data2 = await response2.json();
  try{
  const baner_img = data2.header_image;
    const genres = data2.genres.map(item => item.description);
    const name = data2.name;
    const urlPrice = `https://api.steamregionalprices.com/2.0/get/app/${data2.steam_appid}/`
    const responsePrice = await fetch(url2, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  console.log(responsePrice);
  const dataPrice = await responsePrice.json().regions.find(r => r.regionCode === "eu1")?.price;
  console.log(dataPrice);  
    const cost = dataPrice === undefined ? "N/A" : dataPrice.finalPrice;
    const app_id = data2.steam_appid;
    const pirate_sites = [];
    const url3 = `${serverurl}/teszt/`;
  const response3 = await fetch(url3, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: name, banner_img: baner_img, genres: genres, cost: cost, app_id: app_id, platform: "steam", pirate_sites: pirate_sites })
  });
  const data3 = await response3.json();
}
catch{
  continue;}
  await delay(1000); // 300ms between requests
  }
  console.log("Done");
  // const url3 = `${serverurl}/api/freetp/Search/${gamename}`;
  // const response3 = await fetch(url3, {
  //   method: 'GET',
  //   headers: {
  //     'Content-Type': 'application/json',
  //   }
  // });
  // const data3 = await response3.json();
  // console.log(data3);
  // const url3 = `${serverurl}/api/pcgamestorrentscom/games/${gamename}`;
  // const response3 = await fetch(url3, {
  //   method: 'GET',
  //   headers: {
  //     'Content-Type': 'application/json',
  //   }
  // });
  // console.log(response3);
  // const data3 = await response3.json();
  // console.log(data3);
  // const url3 = `${serverurl}/teszt/`;
  // const response3 = await fetch(url3, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //   }
  // });
  // console.log(response3);
  // const data3 = await response3.json();
  // console.log(data3);
})