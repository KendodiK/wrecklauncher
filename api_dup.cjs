//#region Requires
const apiFunctions = require('./scripts/apiFunctions.js');
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
  await apiFunctions.fetchInitialShopSpecialsData();
  setInterval(apiFunctions.fetchInitialShopSpecialsData, 24 * 60 * 60 * 1000); // Refresh shop specials data every day
});
//#endregion

//#region Midleware
function tokenValidate(req) {
  return async (req, res, next) => {
    try {
      const auth = req.headers?.authorization;
      if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
      }
      const token = auth.slice('bearer '.length).trim();

      const parts = token.split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return res.status(401).json({ error: 'Invalid token format' });
      }

      const [userId, userUniqueToken] = parts;

      const nativeUserCtrl = new nativeUserController();
      const user = await nativeUserCtrl.show(userId);
      if (!user || user.token !== userUniqueToken) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      req.auth = { userId, user, token };

      return next();
    } catch (error) {
      console.error('Error in token validation:', error);
      return res.status(500).json({ error: 'Internal server error during token validation' });
    }
  };
}
//#endregion

//#region APIEndpoints
// -------------------     GET      ------------------ //

app.get('/api/itch/game/:appId', apiFunctions.GETItchGames);

app.get('/api/steam/profile-id/:vanityurl', apiFunctions.GETSteamProfileId); // old path: /api/steam/profile_id/:vanityurl

app.get('/steam/api/get-owned-games', tokenValidate(), apiFunctions.GETOwnedGamesSteam); // old path: /steam/api/getOwnedGames

app.get("/api/games/gamecount", apiFunctions.GETGameCount); //new path v2.3

app.get("/api/games/:id", apiFunctions.GETGameById);
/*
  route: /api/games/app/:appId/all
  params: games.app_id (platform-specific id, e.g. Steam appid)
  headers: -
  body: -

  returns:
    Same shape as /api/games/:id/all.
*/
app.get("/api/games/platforms/:platformId/app-id/:appId/details", apiFunctions.GETGamesByPlatformIdWithAllData); //old path: /api/games/platform/:appId/all
/*
  route: /api/games/:id
  params: games.id
  headers: -
  body: -

  returns: 
    {
      games.id,
      games.app_id,
      games.platform_id,
      games.name,
      games.banner_img,
      games.description,
      games.minimum_requirements,
      games.cost
    }
*/
app.get("/api/games/:id/details", apiFunctions.GETGameByIdWithAllData); //old path: /api/games/:id/all

app.get("/api/games/platform/:platformId/list/:from/details", apiFunctions.GETGamesInListByPlatformId); //old path: /api/games/list/:platformId/all/:from

app.get("/api/games/list/:from", apiFunctions.GETGamesInList);


app.get("/api/search/:needle", apiFunctions.GETSearch);
/*
  route: /api/nativeUser/
  params: -
  headers: auth token
  body: -

  returns: 
    {
      native_user.id,
      native_user.token,
      native_user.user_password,
      native_user.email,
      native_user.bio,
      native_user.pfp
    }
*/
app.get("/api/native-users/:userId", apiFunctions.GETNativeUserById); //old path: /api/nativeUser

app.get("/api/native-users/name/:name", apiFunctions.GETNativeUserByName); //totally new path
/*
  params: native_users.id
  headers: -
  body: -

  returns: 
    {
      {friends.id, native_user.id}
      {friends.id, native_user.id}
      .
      .
      .
    }
*/
app.get("/api/friends/:nativeUserId", apiFunctions.GETFriendsOfNativeUser);
/*
  route: /api/chat/:friendsId
  params: friends.id
  headers: -
  body: from (int, the number where we want to see the messages from)

  returns: 
    {
      [0] {chats.id, chats.friends_id, chats.message, chats.sender_id},
      [1] {chats.id, chats.friends_id, chats.message, chats.sender_id},
      .
      .
      .
      [9] {chats.id, chats.friends_id, chats.message, chats.sender_id},
    }
*/
app.get("/api/messages/:friendsId", apiFunctions.GETChatlogByFriendId); //old path: /api/chat/:friendsId TEST NEEDED!

app.get("/api/platforms", apiFunctions.GETPlatforms); //new path v2.3

app.get("/api/platforms/:platformName", apiFunctions.GETPlatformByPlatromName);

app.get("/api/pirate-sites", apiFunctions.GETPirateSites); //new path v2.3

app.get("/api/platform-users/:nativeUserId", tokenValidate(), apiFunctions.GETPlatformUsersByNativeUserId); //old path: /api/platform_users

app.get("/api/shop-specials/:filter/list/:from", apiFunctions.GETShopSpecialsFilteredInList); //old path: /api/shop_specials/:filter/:from

// -------------------     POST      ------------------ //

/*
  route: /api/signup/
  params: -
  headers: -
  body: username, password, email

  returns: 
    {
      {
        native_user.id,
        native_user.token,
        native_user.user_password,
        native_user.email,
        native_user.bio,
        native_user.pfp
      }
      {
        user auth token (user.id + user.token)
      }
    }
*/
app.post('/api/native-users', apiFunctions.POSTNewNativeUser); //old path: /api/signup
/*
  route: /api/games/
  params: -
  headers: auth token
  body: app_id, platform_id || platfrom_name, name, banner_img, description, minimum_requirements, cost, genre_names[]

  returns: 
    {
      message: 'Game uploaded successfully', gameId: uploadedGame.id
    }
*/
app.post("/api/games", tokenValidate(), apiFunctions.POSTNewGame);

app.post("/api/prices", tokenValidate(), apiFunctions.POSTNewPrice);

app.post("/api/pirate-sites/:gameId", tokenValidate(), apiFunctions.POSTNewPirateSiteConnectionByGameId); //old path: /api/pirate_sites/:gameId - PUT! - no tokenValidate()
/*
  route: /api/friends/
  params: -
  headers: auth token
  body: friendUserid (native_user.id)

  returns: 
    {
      message: "frinedship created", id: result.id
    }
*/
app.post("/api/friends", tokenValidate(), apiFunctions.POSTNewFriends);

app.post("/api/platforms", tokenValidate(), apiFunctions.POSTNewPlatform);

app.post("/api/platform-users", tokenValidate(), apiFunctions.POSTNewPlatformUser); //old path: /api/platform_users

app.post("/api/countries", tokenValidate(), apiFunctions.POSTNewCountry); //old path: /api/counties

app.post("/api/shop-specials/:gameId", tokenValidate(), apiFunctions.POSTNewShopSpecials); // totally new path

// -------------------      PUT       ------------------ //

app.put("/api/native-users", tokenValidate(), apiFunctions.PUTNativeUserProfileInfo); // totally new path
/*
  route: /api/login/
  params: -
  headers: auth token
  body: token, name, user_password, email

  returns: 
    {
      native_user.id,
      native_user.token,
      native_user.name
      native_user.user_password,
      native_user.email,
      native_user.bio,
      native_user.pfp
    }
*/
app.put("/api/login", tokenValidate(), apiFunctions.PUTNativeUserLogin);
/*
  route: /api/games/:id
  params: game id
  headers: -
  body: app_id, platform_id, name, banner_img, description || null, minimum_requirements || null

  returns: 
    {
      game.id,
      game.app_id,
      game.platform_id,
      game.name,
      game.banner_img,
      game.description,
      game.minimum_requirements
    }
*/
app.put("/api/games/:gameId", tokenValidate(), apiFunctions.PUTGames); //old path: /api/games/:id no tokenValidate()

app.put("/api/shop-specials/:gameId", tokenValidate(), apiFunctions.PUTShopSpecialsByGameId); //old path: /api/shop_specials/:gameId - no tokenValidate()

app.put("/api/pirate-sites/:siteId/game/:gameId", tokenValidate(), apiFunctions.PUTPirateSitesByGameId); //old path: /api/pirate_sites/:gameId/:siteId - no tokenValidate()

// -------------------     DELETE     ------------------ //

/*
  route: /api/nativeUser/:friendShipId
  params: friends.id
  headers: auth token
  body: -

  returns: 
    {
      message
    }
*/
app.delete("/api/friends/:friendShipId", tokenValidate(), apiFunctions.DELETEFriends);

app.delete("/api/platform-users/:platfromUserId", tokenValidate(), apiFunctions.DELETEPlatformUser); //old path: /api/platform_user/:platfromUserId

app.delete("/api/native-users", tokenValidate(), apiFunctions.DELETENAtiveUser); // old path: /api/native_user
//#endregion