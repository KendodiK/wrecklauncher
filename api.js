const express = require('express');
const fetch = require('node-fetch'); // works with v2
const puppeteer = require('puppeteer');
const cors = require('cors');
require('dotenv').config();
const mysql = require('mysql2');
const mysqlPromise = require('mysql2/promise');
const { env } = require('process');
const app = express();
const https = require('https');
const zlib = require('zlib');
const { platform } = require('os');
const crypto = require('crypto');

const databaseHandler = require('./database/DatabaseHandler');
const databaseMaker = require('./database/makers/DBMaker');
const DBMaker = require('./database/makers/DBMaker');

const nativeUserController = require('./database/controllers/NativeUsersController');
const platformUsersController = require('./database/controllers/PlatformUsersController');
const platformsController = require('./database/controllers/PlatformsController');
const gamesGenresConnnectionController = require('./database/controllers/GamesGenresConnectionController');
const gamesController = require('./database/controllers/GamesController');
const friendsController = require('./database/controllers/FriendsController');
const chatsController = require('./database/controllers/ChatsController'); 
const NativeUsersController = require('./database/controllers/NativeUsersController');
const PlatformUsersController = require('./database/controllers/PlatformUsersController');
const PlatformsController = require('./database/controllers/PlatformsController');

const PORT = 3000;
// Replace with your actual Steam API key and Steam ID
const steamApiKey = process.env.STEAM_API_KEY;
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

async function ensureDatabaseSchema() {
  const maker = new DBMaker();
  await maker.createTables().then(async () => {
    console.log('Database tables created successfully');
    await new NativeUsersController().create({
      name: "teszt",
      user_password: "teszt",
      email: "test@example.com"
    }).then(async result => {
    console.log("Test user created with ID:", result.id);
    await new PlatformsController().create({ name: "steam" }).then(async platformResult => {
      console.log("Test platform created with ID:", platformResult.id);
      await new PlatformUsersController().create({
        native_user_id: result.id,
        platform_id: platformResult.id,
        platform_user_name: "freshargentinaccount69912",
        platform_profile_id: "76561199194098023",
        platform_password: "teszt"
      }).then(() => {
        console.log("Test platform user created successfully");
      }).catch(err => {
        console.error("Error creating test platform user:", err);
      });
    }).catch(err => {
      console.error("Error creating test platform:", err);
    });
  }).catch(err => {
    console.error("Error creating test user:", err);
  });
}).catch(err => {
  console.error('Error creating database tables:', err);
  throw err;
});
}

async function startServer() {
  try {
    await ensureDatabaseSchema();
    console.log('Database schema ready.');
  } catch (err) {
    console.error('Database schema initialization failed:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`Proxy server running at http://localhost:${PORT}`);
  });
}

startServer();

// ------------------- Debug (opt-in) ------------------ //

function _stripOuterQuotes(value) {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

if (process.env.WRECK_DEBUG_DBINFO === '1') {
  app.get('/api/debug/dbinfo', async (req, res) => {
    const cfg = {
      host: _stripOuterQuotes(process.env.DB_HOST || 'localhost'),
      port: Number(_stripOuterQuotes(process.env.DB_PORT || '3306')),
      user: _stripOuterQuotes(process.env.DB_USERNAME || 'root'),
      password: _stripOuterQuotes(process.env.DB_PASSWORD || ''),
      database: _stripOuterQuotes(process.env.DB_NAME || 'wrecklauncher'),
    };

    try {
      const conn = await mysqlPromise.createConnection(cfg);
      const [infoRows] = await conn.query('SELECT @@hostname AS hostname, @@port AS port, DATABASE() AS databaseName');
      const [countRows] = await conn.query('SELECT COUNT(*) AS games_count FROM games');
      await conn.end();

      return res.json({
        env: { host: cfg.host, port: cfg.port, user: cfg.user, database: cfg.database },
        mysql: Array.isArray(infoRows) ? infoRows[0] : infoRows,
        games: Array.isArray(countRows) ? countRows[0] : countRows,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        error: msg,
        env: { host: cfg.host, port: cfg.port, user: cfg.user, database: cfg.database },
      });
    }
  });
}


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
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: `Internal server error during token validation: ${msg}` });
    }
  };
}

// ------------------- API Endpoints ------------------ //



// -------------------     GET      ------------------ //

app.get('/api/steam/key', tokenValidate(), async (req, res) => {
  try {
    if (!steamApiKey || (typeof steamApiKey === 'string' && !steamApiKey.trim())) {
      return res.status(500).json({ error: 'STEAM_API_KEY is not configured on the backend' });
    }
    console.log('Received request for Steam API key');
    return res.json({ steamApiKey });
  } catch (error) {
    console.error('Error in /api/steam/key endpoint:', error);
    return res.status(500).json({ error: error.message });
  }});

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

    const gamesGenresCtrl = new gamesGenresConnnectionController();
    const gameGenres = await gamesGenresCtrl.getByGameId(gameId);
    game.genres = gameGenres;

    const platformCtrl = new platformsController();
    const platform = platformCtrl.show(game.platform_id);
    game.platfrom = platform; //ennek így nem kéne működnie tesztelés needed !!!

    return res.json(game);
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
    console.log("Login attempt for username:", username);
    console.log("Password provided:", password);
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

    const existingUser = await nativeUserCtrl.getUserByName(username); //Kell hogy egyedi legyen a név????
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const userData = {
      name: username,
      user_password: password,
      email: email,
    }
    const created = await nativeUserCtrl.create(userData);
    const user = await nativeUserCtrl.show(created.id);
    return res.status(201).json({ user, token: created.id + "." + created.token });
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
    const gameId = await gameCtrl.getGameIdByAppId(req.body.app_id);
    if (gameId) {
      return res.status(400).json({ message: 'Game with the same app_id already exists', gameId: gameId });
    }
  } catch (error) {
    console.error('Error in /api/games/upload endpoint:', error);
    return res.status(500).json({ error: error.message });
  }

  try {
    let platf_name = req.body.platform_name ?? null;
    let platf_id = req.body.platform_id ?? null;
    if (platf_id == null && platf_name == null) {
      return res.status(400).json({message: 'Cannot upload, no data for platform.\nPlease give platform name or platform id if its in the db'})
    }

    const gameData = {
      "app_id": req.body.app_id,
      "platform_id": platf_id,
      "platform_name": platf_name,
      "name": req.body.name,
      "banner_img": req.body.banner_img,
      "description": req.body.description ?? null,
      "minimum_requirements": req.body.minimum_requirements ?? null,
      "cost": req.body.cost ?? null,
    }

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
    return res.json(updatedGame);
  } catch (err) {
    console.error('Error in /api/games/:id endpoint:', error);
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