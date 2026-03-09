const express = require('express');
const fetch = require('node-fetch'); // works with v2
const puppeteer = require('puppeteer');
const cors = require('cors');
require('dotenv').config();
const mysql = require('mysql2');
const { env } = require('process');
const app = express();
const https = require('https');
const zlib = require('zlib');
const { platform } = require('os');
const crypto = require('crypto');

const databaseHandler = require('./database/DatabaseHandler');
const DBCreator = require('./database/DBCreator');

const nativeUserController = require('./database/controllers/NativeUsersController');
const platformUsersController = require('./database/controllers/PlatformUsersController');
const platformsController = require('./database/controllers/PlatformsController');
const gamesGenresConnnectionController = require('./database/controllers/GamesGenresConnectionController');
const gamesController = require('./database/controllers/GamesController');
const friendsController = require('./database/controllers/FriendsController');
const chatsController = require('./database/controllers/ChatsController'); 
const shopSpecialsController = require('./database/controllers/ShopSpecialsController');
const { errorMonitor } = require('events');
const { error } = require('console');

const PORT = 3000;
// Replace with your actual Steam API key and Steam ID
const steamApiKey = process.env.STEAM_API_KEY;
const itchApiKey = process.env.ITCH_API_KEY;
const clientId = process.env.IGDB_CLIENT_ID;
const clientSecret = process.env.IGDB_CLIENT_SECRET;
let igdbToken = null;
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Global error handlers to avoid silent exits
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});
process.on('unhandledRejection', (reason, p) => {
  console.error('unhandledRejection at:', p, 'reason:', reason);
});

// Start server and attach listeners for better diagnostics
const server = app.listen(PORT, () => {
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
});


// ------------------- Helper functions ------------------ //
async function fetchIGDBToken() {
  try {
    const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.IGDB_CLIENT_ID}&client_secret=${process.env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`, {
      method: 'POST',
    });
    const data = await response.json();
    return data.access_token;
  } catch (err) {
    console.error('Error fetching IGDB token:', err);
    throw err;
  }
}
async function fetchIGDB(endpoint, query) {
  if (!clientId) {
    throw new Error('Missing IGDB client id (IGDB_CLIENT_ID)');
  }
  if (!igdbToken) {
    throw new Error('Missing IGDB token; fetchIGDBToken() must run first');
  }

  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${igdbToken}`,
      'Content-Type': 'text/plain',
      'Accept': 'application/json',
    },
    // IGDB expects the query as plain text in the request body
    body: query,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`IGDB ${endpoint} HTTP ${response.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    // If IGDB ever returns non-JSON (unexpected), surface the raw body.
    return text;
  }
}

function normalizeIgdbImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function getSteamAppIdFromIgdbGame(igdbGame) {
  const externalGames = igdbGame?.external_games;
  if (!Array.isArray(externalGames) || externalGames.length === 0) return null;

  // IGDB: external_games.category indicates the store/platform.
  // Steam is commonly category = 1.
  const steamEntry = externalGames.find((eg) => Number(eg?.category) === 1);
  const uid = steamEntry?.uid;
  if (uid == null) return null;

  const numeric = Number(uid);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

async function upsertShopSpecialsFromIgdb({ trending = [], upcoming = [] } = {}) {
  // shop_specials.game_id references games.id, so we ensure the games exist first.
  // User requirement: store games as Steam games (platform=steam, app_id=steam appid).
  const platformsCtrl = new platformsController();
  const steamPlatform = await platformsCtrl.create({ name: 'steam' });
  const steamPlatformId = steamPlatform?.id;
  if (!steamPlatformId) {
    throw new Error('Failed to resolve/create steam platform');
  }

  const gamesCtrl = new gamesController();
  const shopSpecialsCtrl = new shopSpecialsController();

  // Make sure DB connection is ready, then wipe existing specials.
  // Note: this will also remove any manually-managed flags (e.g. discounted).
  await shopSpecialsCtrl.ready;
  try {
    await shopSpecialsCtrl.dbConnection.execute('TRUNCATE TABLE shop_specials;');
  } catch (err) {
    // Some MySQL configs restrict TRUNCATE; fall back to DELETE.
    try {
      await shopSpecialsCtrl.dbConnection.execute('DELETE FROM shop_specials;');
    } catch (err2) {
      console.error('Failed to wipe shop_specials table:', err2);
      throw err2;
    }
  }

  async function ensureGameId(igdbGame) {
    const steamAppId = getSteamAppIdFromIgdbGame(igdbGame);
    if (!steamAppId) {
      console.log('Skipping IGDB game: missing Steam appid (external_games category=1):', {
        igdbId: igdbGame?.id,
        name: igdbGame?.name,
      });
      return null;
    }

    const existingGameId = await gamesCtrl.getGameIdByAppIdAndPlatform(steamAppId, steamPlatformId);
    if (existingGameId != null) {
      const numericExisting = Number(existingGameId);
      return Number.isFinite(numericExisting) ? numericExisting : null;
    }

    const gameData = {
      app_id: steamAppId,
      platform_id: steamPlatformId,
      name: igdbGame?.name ?? String(steamAppId),
      banner_img: normalizeIgdbImageUrl(igdbGame?.cover?.url) ?? '',
      description: igdbGame?.summary ?? '',
      minimum_requirements: '',
      cost: null,
    };

    const created = await gamesCtrl.create(gameData);
    const createdId = created?.id;
    const numericCreated = Number(createdId);
    if (!Number.isFinite(numericCreated)) {
      console.warn('Skipping IGDB game: created game missing numeric id', { steamAppId, created });
      return null;
    }
    return numericCreated;
  }

  // Merge flags so each game_id is inserted once.
  const gameIdByAppId = new Map();
  const specialsByGameId = new Map();

  async function addSpecial(igdbGame, flags) {
    const steamAppId = getSteamAppIdFromIgdbGame(igdbGame);
    if (!steamAppId) {
      console.log('Skipping shop_special: missing Steam appid (external_games category=1):', {
        igdbId: igdbGame?.id,
        name: igdbGame?.name,
      });
      return;
    }

    let gameId = gameIdByAppId.get(steamAppId);
    if (gameId == null) {
      gameId = await ensureGameId(igdbGame);
      if (gameId == null) {
        console.warn('Skipping shop_special: could not resolve game id for IGDB game', { steamAppId, name: igdbGame?.name });
        return;
      }
      gameIdByAppId.set(steamAppId, gameId);
    }

    // Extra safety: ensure it's numeric before using as a DB foreign key.
    const numericGameId = Number(gameId);
    if (!Number.isFinite(numericGameId)) {
      console.warn('Skipping shop_special: non-numeric game id', { steamAppId, gameId });
      return;
    }
    gameId = numericGameId;

    const current = specialsByGameId.get(gameId) ?? {
      game_id: gameId,
      featured: false,
      coming_soon: false,
      discounted: false,
    };
    specialsByGameId.set(gameId, {
      ...current,
      featured: current.featured || !!flags.featured,
      coming_soon: current.coming_soon || !!flags.coming_soon,
      // discounted is not provided by IGDB sync; keep false on daily rebuild.
    });
  }

  for (const g of trending) {
    await addSpecial(g, { featured: true });
  }
  for (const g of upcoming) {
    await addSpecial(g, { coming_soon: true });
  }

  for (const special of specialsByGameId.values()) {
    const gameId = special?.game_id;
    if (gameId == null) {
      console.warn('Skipping shop_special insert: missing game_id', special);
      continue;
    }

    // Insert directly to avoid the current ShopSpecialsController.create() foreign-key check bug.
    await shopSpecialsCtrl.dbConnection.execute(
      'INSERT INTO shop_specials (game_id, featured, coming_soon, discounted) VALUES (?, ?, ?, ?);',
      [
        Number(gameId),
        special.featured ? 1 : 0,
        special.coming_soon ? 1 : 0,
        special.discounted ? 1 : 0,
      ]
    );
  }
}

// Main function
async function fetchGamesDaily() {
  try {
    igdbToken = await fetchIGDBToken();
    console.log('Fetched IGDB token successfully');
  } catch (err) {
    console.error('Failed to fetch IGDB token:', err);
    return;
  }

  console.log("Fetching games...");

  let trending = [];
  let upcoming = [];

  // 1️⃣ Trending / Featured
  try {
    trending = await fetchIGDB(
      "games",
      `fields id, name, summary, cover.url, hypes, follows, external_games.category, external_games.uid;
       where external_games.category = 1;
       sort hypes desc;
       limit 100;`
    );
    console.log('Fetched trending games successfully');
    console.log(trending);

    for (const g of trending) {
      const steamAppId = getSteamAppIdFromIgdbGame(g);
      if (!steamAppId) {
        console.log('IGDB game missing Steam appid (external_games category=1):', {
          igdbId: g?.id,
          name: g?.name,
        });
      }
    }
  } catch (err) {
    console.error('Failed to fetch trending games:', err);
  }
  
  // 2️⃣ Coming Soon
  try {
    upcoming = await fetchIGDB(
      "games",
      `fields id, name, summary, cover.url, first_release_date, external_games.category, external_games.uid;
       where first_release_date > ${Math.floor(Date.now() / 1000)} & external_games.category = 1;
       sort first_release_date asc;
       limit 100;`
    );
    console.log('Fetched upcoming games successfully');
    console.log(upcoming);

    for (const g of upcoming) {
      const steamAppId = getSteamAppIdFromIgdbGame(g);
      if (!steamAppId) {
        console.log('IGDB game missing Steam appid (external_games category=1):', {
          igdbId: g?.id,
          name: g?.name,
        });
      }
    }
  } catch (err) {
    console.error('Failed to fetch upcoming games:', err);
  }

  try {
    await upsertShopSpecialsFromIgdb({ trending, upcoming });
    console.log('Uploaded IGDB specials to shop_specials successfully');
  } catch (err) {
    console.error('Failed to upload IGDB specials to shop_specials:', err);
  }
}
// Run immediately
fetchGamesDaily();

// Run every 24 hours
setInterval(fetchGamesDaily, 24 * 60 * 60 * 1000);


// ------------------- Middleware ------------------ //

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

// ------------------- API Endpoints ------------------ //



// -------------------     GET      ------------------ //

app.get('/steam/api/getOwnedGames', tokenValidate(), async (req, res) => { 
  try {
    const { userId } = req.auth;
    const platformUserCtrl = new platformUsersController();
    const platformUsers = await platformUserCtrl.getByNativeUserId(userId);
    const platformCtrl = new platformsController();
    const steamPlatform = await platformCtrl.getByPlatformName('steam');
    if (!steamPlatform) {
      return res.status(400).json(steamPlatform.error ?? { error: 'Steam platform not found in database' });
    }
    let ownedGames = [];
    for (const platformUser of platformUsers) {
      if (Number(platformUser.platform_id) === Number(steamPlatform.id)) {
        const steamApiUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${steamApiKey}&steamid=${platformUser.platform_profile_id}&format=json`;
        const response = await fetch(steamApiUrl);
        if (!response.ok) {
          console.error('Error fetching Steam API:', response.statusText);
          return res.status(500).json({ error: 'Failed to fetch data from Steam API' });
        }
        const data = await response.json();
        ownedGames.push(...data.response.games);
      }
    }
    if (ownedGames.length === 0) {
      return res.status(400).json({ error: 'No owned games found for this user on Steam' });
    }
    return res.json({ ownedGames });
  } catch (error) {
    console.error('Error in /steam/api/getOwnedGames endpoint:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/*
  route: /api/platform/user_id/:platformname/:platformUsername
  params: platformname (string), platformUsername (string)
  headers: auth token
  body: -

  returns: { platform_users.id }
*/
app.get('/api/platform/user_id/:platformname/:platformUsername', tokenValidate(), async (req, res) => {
    try {
        const { platformname, platformUsername } = req.params;

        // Extract user ID from token (format: id.token)
        const { userId } = req.auth;
        
        // Get platform users for this native user
        const platformUserCtrl = new platformUsersController();
        const platformUsers = await platformUserCtrl.getByNativeUserId(userId);
        
        if (!platformUsers || platformUsers.length === 0) {
            return res.status(404).json({ error: 'No platform users found for this user' });
        }
        
        // Resolve platform id from platform name
        const platformsCtrl = new platformsController();
        const platform = await platformsCtrl.getByPlatformName(platformname);
        if (!platform) {
          return res.status(404).json({ error: `Unknown platform: ${platformname}` });
        }

        // Find the matching platform user (platform_users has platform_id, not platform_name)
        const index = platformUsers.findIndex(
          row => row.platform_user_name == platformUsername && Number(row.platform_id) === Number(platform.id)
        );
        if (index === -1) {
            return res.status(404).json({ error: `Platform user not found for ${platformname}:${platformUsername}` });
        }
        
        const platformUserID = platformUsers[index].platform_profile_id;    
        return res.json({ platformUserID: platformUserID });
    } catch (error) {
        console.error("Error in /api/platform/UserID endpoint:", error);
        res.status(500).json({ error: error.message });
    }
});

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
app.get("/api/games/:id", async (req, res) => { //nem biztos hogy kell használni, ha van /games/:id/all -> a libary-hoz.
  try {
    const { id: gameId } = req.params;
    const gameCtrl = new gamesController();
    const game = await gameCtrl.show(gameId);
    return res.json(game);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  }
});

/*
  route: /api/games/app/:appId/all
  params: games.app_id (platform-specific id, e.g. Steam appid)
  headers: -
  body: -

  returns:
    Same shape as /api/games/:id/all.
*/
app.get("/api/games/:appId/all", async (req, res) => {
  try {
    const { appId } = req.params;
    const appIdNum = Number(appId);
    if (!Number.isFinite(appIdNum) || appIdNum <= 0) {
      return res.status(400).json({ error: `Invalid appId: ${String(appId)}` });
    }

    const gameCtrl = new gamesController();
    const gameId = await gameCtrl.getGameIdByAppId(appIdNum);
    if (!gameId) {
      return res.status(404).json({ error: `Game not found by appId: ${appIdNum}` });
    }

    const game = await gameCtrl.getWithAllForeign(gameId);
    if (!game) {
      return res.status(404).json({ error: `Game not found: ${gameId}` });
    }

    const gamesGenresCtrl = new gamesGenresConnnectionController();
    const gameGenres = await gamesGenresCtrl.getByGameId(gameId);
    game.genres = gameGenres;

    return res.json(game);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

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
app.get("/api/games/:id/all", async (req, res) => {
  try {
    const {id: gameId } = req.params;
    const gameCtrl = new gamesController();
    const game = await gameCtrl.getWithAllForeign(gameId);

    if (!game) {
      return res.status(404).json({ error: `Game not found: ${gameId}` });
    }

    const gamesGenresCtrl = new gamesGenresConnnectionController();
    const gameGenres = await gamesGenresCtrl.getByGameId(gameId);
    game.genres = gameGenres;

    return res.json(game);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  }
});

app.get("/api/games/list/:from", async (req, res) => {
  try {
    const { from } = req.params;
    const gamesCtrl = new gamesController();
    const games = await gamesCtrl.getAllGamesFrom(from);
    return res.json(games);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  }
});

/*
  route: /api/friends/:nativeUserId
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
app.get("/api/friends/:nativeUserId", async (req, res) => {
  try {
    const { nativeUserId } = req.params;
    const friendsCtrl = new friendsController();
    const friendsRaw = await friendsCtrl.getFriendsByNativeUserId(nativeUserId);

    const friends = [];
    friendsRaw.forEach(friend => {
      friends.push({
        id: friend.id,
        user_id: (Number(friend.user1_id) !== Number(nativeUserId)) ? friend.user1_id : friend.user2_id
      });
    });

    return res.json(friends);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  } 
});

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
app.get("/api/nativeUser", tokenValidate(), async (req, res) => {
  try {
    const { userId } = req.auth;
    const nativeUserCtrl = new nativeUserController();
    const user = await nativeUserCtrl.show(userId);
    return res.json(user);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  }
});


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
app.get("/api/chat/:friendsId", async (req, res) => {
  try {
    const { friendsId } = req.params;
    const { from } = req.body;
    const chatsCtrl = new chatsController();
    const chatLog = await chatsCtrl.getByFriedsId(friendsId, from);
    return res.json(chatLog);
  } catch (error) {
    console.error('Error in /api/chat endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/platforms/:platformName", async (req, res) => {
  try {
    const { platformName } = req.params;
    const platformCtrl = new platformsController();
    const result = await platformCtrl.getByPlatformName(platformName);
    if (result instanceof Error) {
      return res.status(400).json({ message: 'Iternal server error', error: result });
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/platform_users", tokenValidate(), async (req, res) => {
  try {
    const { userId } = req.auth;
    const platformUserCtrl = new platformUsersController();
    const result = await platformUserCtrl.getByNativeUserId(userId);
    if (result instanceof Error) {
      return res.status(400).json({ message: 'Iternal server error', error: result });
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/shop_specials/:filter/:from", async (req, res) => {
  try {
    const { filter, from } = req.params;
    const shopSpecialsCtrl = new shopSpecialsController();
    let result = shopSpecialsCtrl.getFilteredGamesFrom(filter, from);
    if (result instanceof Error) {
      return res.status(400).json({ message: 'Iternal server error', error: result });
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } 
});

// -------------------     POST      ------------------ //

/*
  route: /api/login/:username/:password
  params: -
  headers: username, password
  body: -

  returns: 
    {
      user auth token (user.id + user.token)
    }
*/
app.post('/api/login/:username/:password', async (req, res) => {
  try {
    const nativeUserCtrl = new nativeUserController();

    const { username, password } = req.params;
    const user = await nativeUserCtrl.getUserByNameAndPassword(username, password);
    console.log("User found:", user);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    await nativeUserCtrl.update(user.id, {token: true});
    const updatedUser = await nativeUserCtrl.show(user.id);
    
    return res.json(user.id + "." + updatedUser.token);
  } catch (error) {
    console.error('Error in /api/login endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

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
app.post('/api/signup', async (req, res) => {
  try {
    const nativeUserCtrl = new nativeUserController();

    const { username, password, email } = req.body;

    const existingUser = await nativeUserCtrl.getUserByNameAndPassword(username, password);

    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const userData = {
      "name": username,
      "user_password": password,
      "email": email,
    };

    const newUser = await nativeUserCtrl.create(userData);
    return res.status(201).json({newUser, token: newUser.id + "." + newUser.token});
  } catch (error) {
    console.error('Error in /api/signup endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});

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
app.post("/api/games", tokenValidate(), async (req, res) => {
  try {
    const gameCtrl = new gamesController();
    const existingGameId = await gameCtrl.getGameIdByAppId(req.body.app_id);
    if (existingGameId != null) {
      return res.status(400).json({ message: 'Game with the same app_id already exists', gameId: existingGameId });
    }

    const platformName = req.body.platform_name ?? null;
    // Backward-compatible: accept the old misspelled key too.
    const platformId = req.body.platform_id ?? req.body.platfomr_id ?? null;
    if (platformId == null && platformName == null) {
      return res.status(400).json({
        message: 'Cannot upload, no data for platform. Please give platform_name or platform_id.'
      });
    }

    const gameData = {
      app_id: req.body.app_id,
      platform_id: platformId,
      platform_name: platformName,
      name: req.body.name,
      banner_img: req.body.banner_img,
      description: req.body.description ?? null,
      minimum_requirements: req.body.minimum_requirements ?? null,
      cost: req.body.cost ?? null,
    };

    const genreNames = req.body.genre_names;

    const gamesCtrl = new gamesController();
    const uploadedGame = await gamesCtrl.uploadWithAll(gameData, null, genreNames);
    return res.status(201).json({ message: 'Game uploaded successfully', gameId: uploadedGame.id });
  } catch (error) {
    console.error('Error in /api/games/upload endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});

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
app.post("/api/friends", tokenValidate(), async (req, res) => {
  try {
    const { userId } = req.auth;
    const { friendUserId } = req.body;

    const friendsCtrl = new friendsController();
    const result = await friendsCtrl.create({ user1_id: userId, user2_id: friendUserId });
    if (result.message.includes('already exists') || result instanceof Error) {
      return res.status(400).json({ message: result.message });
    }
    return res.status(201).json({message: "frinedship created", id: result.id});
  } catch (error) {
    console.error('Error in /api/friends endpoint:', error);
    return res.status(500).json({ error: error.message }); 
  }
});

app.post("/api/platforms", tokenValidate(), async (req, res) => {
  try {
    const { platformName } = req.body;

    const platformCtrl = new platformsController();
    const result = await platformCtrl.create({name: platformName});
    if( result instanceof Error ) {
      return res.status(400).json({ message: result.message });
    }
    return res.status(201).json({message: "platform uploaded", id: result.id})
  } catch (err) {
    console.log('Error in /api/platforms endpoint:', err);
    return res.status(500).json({ error: err.message });
  }
})

app.post("/api/platform_users", tokenValidate(), async (req, res) => {
  try {
    const { userId } = req.auth;

    const { platformUserName, platformId, platfProfId, platformPassword } = req.body || {};
    const missing = [];
    if (platformUserName == null) missing.push('platformUserName');
    if (platformId == null) missing.push('platformId');
    if (platfProfId == null) missing.push('platfProfId');
    if (platformPassword == null) missing.push('platformPassword');
    if (missing.length) {
      return res.status(400).json({ message: 'Missing required fields', missing });
    }

    const data = {
      "native_user_id": userId,
      "platform_user_name": platformUserName,
      "platform_id": platformId,
      "platform_profile_id": platfProfId,
      "platform_password": platformPassword,
    }

    const platformUserCtrl = new platformUsersController();
    const result = await platformUserCtrl.create(data);
    if( result instanceof Error ) {
      return res.status(400).json({ message: result.message });
    }
    return res.status(201).json({ message: "platform user uploaded", id: result.id });
  } catch (err) {
    console.log('Error in /api/platform_users endpoint:', err);
    return res.status(500).json({ error: err.message });
  }
})

// -------------------      PUT       ------------------ //

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
app.put("/api/login", tokenValidate(), async (req, res) => {
  try {
    const { userId } = req.auth;
    const nativeUserCtrl = new nativeUserController();
    const updatedUser = await nativeUserCtrl.update(userId, req.body);
    if (updatedUser instanceof Error) {
      return res.status(400).json({ message: updatedUser.message });
    }
    return res.json(updatedUser);
  } catch (error) {
    console.error('Error in /api/nativeUser/:id endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});

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
app.put("/api/games/:id", async (req, res) => {
  try {
    const { id: gameId } = req.params;

    const gameData = {
      "app_id": req.body.app_id,
      "platform_id": platformId,
      "name": req.body.name,
      "banner_img": req.body.banner_img,
      "description": req.body.description ?? null,
      "minimum_requirements": req.body.minimum_requirements ?? null,
      "cost": req.body.cost ?? null,
    }

    const gamesCtrl = new gamesController();
    const updatedGame = gamesCtrl.update(gameId, gameData);
    if (updatedGame instanceof Error) {
      return res.status(400).json({ message: updatedGame.message });
    }
    return res.json(updatedGame);
  } catch (err) {
    console.error('Error in /api/games/:id endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.put("/api/shop_specials/:gameId", async (req, res) => {
  try {
    const { gameId } = req.params;
    const { featured, coming_soon, discounted } = req.body;
    const shopSpecialsCtrl = new shopSpecialsController();
    const result = await shopSpecialsCtrl.update(gameId, { "featured": featured, "coming_soon": coming_soon, "discounted": discounted });
    if (result instanceof Error) {
      return res.status(400).json({ message: result.message });
    }
    return res.json(result);
  } catch (err) {
    console.error('Error in /api/shop_specials/:gameId endpoint:', error);
    return res.status(500).json({ error: error.message });
  } 
});

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
app.delete("/api/friends/:friendShipId", tokenValidate(), async (req, res) => {
  try {
    const { friendShipId } = req.params;

    const friendsCtrl = new friendsController();
    const result = await friendsCtrl.delete(friendShipId);
    if (result instanceof Error) {
      return res.status(400).json({ message: result.message });
    }
    return res.status(201).json(result);
  } catch (error) {
    console.error('Error in /api/friends endpoint:', error);
    return res.status(500).json({ error: error.message }); 
  }
});