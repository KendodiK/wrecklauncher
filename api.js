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
const databaseMaker = require('./database/makers/DBMaker');
const DBMaker = require('./database/makers/DBMaker');

const nativeUserController = require('./database/controllers/NativeUsersController');
const platformUsersController = require('./database/controllers/PlatformUsersController');
const platformsController = require('./database/controllers/PlatformsController');
const gamesGenresConnnectionController = require('./database/controllers/GamesGenresConnectionController');
const gamesController = require('./database/controllers/GamesController');
const friendsController = require('./database/controllers/FriendsController');
const chatsController = require('./database/controllers/ChatsController'); 
const FriendsController = require('./database/controllers/FriendsController');

const PORT = 3000;
// Replace with your actual Steam API key and Steam ID
const steamApiKey = process.env.STEAM_API_KEY;
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.listen(PORT, () => {
   console.log(`Proxy server running at http://localhost:${PORT}`);
});


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

app.get("/api/games/:id/all", async (req, res) => {
  try {
    const {id: gameId } = req.params;
    const gameCtrl = new gamesController();
    const game = await gameCtrl.getGameWithAllForeign(gameId);

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

app.get("/api/nativeUser/:id", async (req, res) => {
  try {
    const { id: nativeUserId } = req.params;
    const nativeUserCtrl = new nativeUserController();
    const user = await nativeUserCtrl.show(nativeUserId);
    return res.json(user);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  }
});

app.get("/api/chat/:friendsId", async (req, res) => {
  try {
    const { friendsId } = req.params;
    const { from } = req.body;
    const chatsCtrl = new chatsController();
    const chatLog = await chatsCtrl.getByFriendsId(friendsId, from);
    return res.json(chatLog);
  } catch (error) {
    console.error('Error in /api/chat endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});

// -------------------     POST      ------------------ //

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

app.post('/api/signup', async (req, res) => {
  try {
    const nativeUserCtrl = new nativeUserController();

    const { username, password, email } = req.body;

    const existingUser = await nativeUserCtrl.getUserByName(username); //Kell hogy egyedi legyen a név????
    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const userData = {
      "username" : username,
      "password" : password,
      "email" : email,
    }
    const newUser = await nativeUserCtrl.create(userData);
    return res.status(201).json(newUser);
  } catch (error) {
    console.error('Error in /api/signup endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post("/api/games/upload/:token", tokenValidate(), async (req, res) => {
  try {
    const gameCtrl = new gamesController();
    const gameId = await gameCtrl.getGameIdByAppId(req.body.app_id);
    if (gameId) {
      return res.status(400).json({ message: 'Game with the same app_id already exists', gameId: gameId });
    }
  } catch (error) {
    console.error('Error in /api/games/upload endpoint:', error);
    res.status(500).json({ error: error.message });
  }

  try {
    const platformCtrl = new platformsController();
    platformId = await platformCtrl.getByPlatformName(req.body.platform_name).id ?? null;

    const gameData = {
      "app_id": req.body.app_id,
      "platform_id": platformId,
      "platform_name": platformId == null ? req.body.platform_name : null,
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

app.post("/api/friends", tokenValidate(), async (req, res) => {
  try {
    const { userId } = req.auth;
    const { friendUserId } = req.body;

    const friendsCtrl = new friendsController();
    const result = await friendsCtrl.create({ user1_id: userId, user2_id: friendUserId });
    if (result.message.includes('already exists') || result instanceof Error) {
      return res.status(400).json({ message: result.message });
    }
    return res.status(201).json(result);
  } catch (error) {
    console.error('Error in /api/friends endpoint:', error);
    return res.status(500).json({ error: error.message }); 
  }
});

// -------------------      PUT       ------------------ //
app.put("/api/login/:id", tokenValidate(), async (req, res) => {
  try {
    const nativeUserId = req.params.id;
    const nativeUserCtrl = new nativeUserController();
    const updatedUser = await nativeUserCtrl.update(nativeUserId, req.body);
    return res.json(updatedUser);
  } catch (error) {
    console.error('Error in /api/nativeUser/:id endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});

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