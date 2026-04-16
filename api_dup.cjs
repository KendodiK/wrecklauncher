//#region Requires
const apiFunctions = require('./scripts/apiFunctions.js');
const apiHelpers = require('./scripts/apiHelpers.js');
const fetchShopSpecials = require('./scripts/fetchShopSpecials.js');

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();

const DBCreator = require('./database/DBCreator.js');
const nativeUserController = require('./database/controllers/NativeUsersController.js');
const { platform } = require('process');

const PORT = 3000;
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
//#endregion

//#region StartServer
const server = app.listen(PORT, async () => {
  console.log(`Proxy server running at http://localhost:${PORT}`);  
});


server.on('error', (err) => {
  console.error('Server error:', err);
});

server.on('listening', async () => {
  try {
    const addr = server.address();
    if (typeof addr === 'string') {
      console.log('Server listening on', addr);
    } else {
      console.log('Server listening on', `${addr.address}:${addr.port}`);
    }
  } catch (err) {
    console.error('Error retrieving server address:', err);
  }

  try {
    const databaseCreator = new DBCreator();
    await databaseCreator.createTables();
  } catch (err) {
    console.error('Error creating database tables on startup:', err);
  }
  //await apiFunctions.fetchInitialShopSpecialsData();
  //setInterval(apiFunctions.fetchInitialShopSpecialsData, 24 * 60 * 60 * 1000); // Refresh shop specials data every day
});
//#endregion

//#region Midleware

//#endregion

//#region APIEndpoints
// -------------------     GET      ------------------ //

app.get('/api/itch/game/:appId', apiFunctions.GETItchGames);

app.get('/api/steam/profile-id/:vanityurl', apiFunctions.GETSteamProfileId); // old path: /api/steam/profile_id/:vanityurl

app.get('/steam/api/get-owned-games', apiHelpers.tokenValidate, apiFunctions.GETOwnedGamesSteam); // old path: /steam/api/getOwnedGames

app.get("/api/games/gamecount", apiFunctions.GETGameCount); //new path v2.3

app.get("/api/games/:id", apiFunctions.GETGameById);

app.get("/api/games/platforms/:platformId/app-id/:appId/details", apiFunctions.GETGamesByPlatformIdWithAllData); //old path: /api/games/platform/:appId/all

app.get("/api/games/:id/details", apiFunctions.GETGameByIdWithAllData); //old path: /api/games/:id/all

app.get("/api/games/platform/:platformId/list/:from/details", apiFunctions.GETGamesInListByPlatformId); //old path: /api/games/list/:platformId/all/:from

app.get("/api/games/list/:from", apiFunctions.GETGamesInList);

app.get("/api/search", apiFunctions.GETSearch);

app.get("/api/native-users/:userId", apiFunctions.GETNativeUserById); //old path: /api/nativeUser

app.get("/api/native-users/name/:name", apiFunctions.GETNativeUserByName); //totally new path

app.get("/api/friends/:nativeUserId", apiFunctions.GETFriendsOfNativeUser);

app.get("/api/messages/:friendsId", apiFunctions.GETChatlogByFriendId); //old path: /api/chat/:friendsId TEST NEEDED!

app.get("/api/platforms", apiFunctions.GETPlatforms); //new path v2.3

app.get("/api/platforms/:platformName", apiFunctions.GETPlatformByPlatromName);

app.get("/api/pirate-sites", apiFunctions.GETPirateSites); //new path v2.3

app.get("/api/platform-users/:nativeUserId", apiHelpers.tokenValidate, apiFunctions.GETPlatformUsersByNativeUserId); //old path: /api/platform_users

app.get("/api/shop-specials/:filter/list/:from", apiFunctions.GETShopSpecialsFilteredInList); //old path: /api/shop_specials/:filter/:from

// -------------------     POST      ------------------ //

app.post('/api/native-users', apiFunctions.POSTNewNativeUser); //old path: /api/signup

app.post("/api/games", apiHelpers.tokenValidate, apiFunctions.POSTNewGame);

app.post("/api/prices", apiHelpers.tokenValidate, apiFunctions.POSTNewPrice);

app.post("/api/pirate-sites/:gameId", apiHelpers.tokenValidate, apiFunctions.POSTNewPirateSiteConnectionByGameId); //old path: /api/pirate_sites/:gameId - PUT! - no apiHelpers.tokenValidate

app.post("/api/friends", apiHelpers.tokenValidate, apiFunctions.POSTNewFriends);

app.post("/api/platforms", apiHelpers.tokenValidate, apiFunctions.POSTNewPlatform);

app.post("/api/platform-users", apiHelpers.tokenValidate, apiFunctions.POSTNewPlatformUser); //old path: /api/platform_users

app.post("/api/countries", apiHelpers.tokenValidate, apiFunctions.POSTNewCountry); //old path: /api/counties

app.post("/api/shop-specials/:gameId", apiHelpers.tokenValidate, apiFunctions.POSTNewShopSpecials); // totally new path

// -------------------      PUT       ------------------ //

app.put("/api/native-users", apiHelpers.tokenValidate, apiFunctions.PUTNativeUserProfileInfo); // totally new path

app.put("/api/login", apiHelpers.tokenValidate, apiFunctions.PUTNativeUserLogin);

app.put("/api/games/:gameId", apiHelpers.tokenValidate, apiFunctions.PUTGames); //old path: /api/games/:id no apiHelpers.tokenValidate

app.put("/api/shop-specials/:gameId", apiHelpers.tokenValidate, apiFunctions.PUTShopSpecialsByGameId); //old path: /api/shop_specials/:gameId - no apiHelpers.tokenValidate

app.put("/api/pirate-sites/:siteId/game/:gameId", apiHelpers.tokenValidate, apiFunctions.PUTPirateSitesByGameId); //old path: /api/pirate_sites/:gameId/:siteId - no apiHelpers.tokenValidate

// -------------------     DELETE     ------------------ //

app.delete("/api/friends/:friendShipId", apiHelpers.tokenValidate, apiFunctions.DELETEFriends);

app.delete("/api/platform-users/:platfromUserId", apiHelpers.tokenValidate, apiFunctions.DELETEPlatformUser); //old path: /api/platform_user/:platfromUserId

app.delete("/api/native-users", apiHelpers.tokenValidate, apiFunctions.DELETENAtiveUser); // old path: /api/native_user
//#endregion