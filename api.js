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
const gamesController = require('./database/controllers/GamesController');
const platformsController = require('./database/controllers/PlatformsController');
const friendsController = require('./database/controllers/FriendsController');

const PORT = 3000;
// Replace with your actual Steam API key and Steam ID
const steamApiKey = process.env.STEAM_API_KEY;
app.use(cors());
const path = require('path');
const fs = require('fs');
function loadHttpsOptions() {
  const keyPath = process.env.SSL_KEY_PATH || path.join(__dirname, 'certs', 'localhost-key.pem');
  const certPath = process.env.SSL_CERT_PATH || path.join(__dirname, 'certs', 'localhost-cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }

  let selfsigned;
  try {
    // eslint-disable-next-line global-require
    selfsigned = require('selfsigned');
  } catch {
    throw new Error(
      'TLS cert/key not found. Provide SSL_KEY_PATH and SSL_CERT_PATH (or ./certs/*.pem), or install the `selfsigned` package for a dev self-signed fallback.'
    );
  }

  const attrs = [{ name: 'commonName', value: 'localhost' }];
  const pems = selfsigned.generate(attrs, {
    days: 365,
    keySize: 2048,
    algorithm: 'sha256',
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
        ],
      },
    ],
  });

  console.warn('[TLS] Using a self-signed certificate (dev fallback).');
  console.warn('[TLS] For Electron/Node fetch to trust it, use mkcert and provide cert/key via SSL_KEY_PATH and SSL_CERT_PATH.');
  return { key: pems.private, cert: pems.cert };
}

function startServers() {
  const httpsPort = Number(process.env.HTTPS_PORT || PORT);
  const httpPort = Number(process.env.HTTP_PORT || 3001);
  const httpsOptions = loadHttpsOptions();
  // On some Windows setups, binding to IPv6 only ("::") does not accept IPv4.
  // Start separate listeners on both stacks so `localhost` works reliably.
  const httpsV4 = https.createServer(httpsOptions, app);
  const httpsV6 = https.createServer(httpsOptions, app);
  httpsV4.listen(httpsPort, '127.0.0.1');
  httpsV6.listen(httpsPort, '::1');
  console.log(`API server (HTTPS) running at https://localhost:${httpsPort}`);
  console.log(`API server (HTTP) running at http://localhost:${httpPort}`);
}

startServers();



app.post('/api/login/:username/:password', async (req, res) => {
  try {
    const nativeUserCtrl = new nativeUserController();

    const username = req.params.username;
    const password = req.params.password;
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

app.get('/api/platform/user_id/:platformname/:platformUsername', tokenValidate(), async (req, res) => {
    try {
        const platformname = req.params.platformname;
        const platformUsername = req.params.platformUsername;

        // Extract user ID from token (format: id.token)
        const userId = req.auth.userId;
        
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

app.get('/api/steam/OwnedGames/:username/:steamusername', async (req, res) => {
  try {
    // const steamID = '76561199194098023';
    const steamID = await getUsersSteamID(req.params.username, req.params.steamusername);
    console.log("Steam user id"+steamID);
    if (!steamID) {
      return res.status(404).json({ error: 'Steam ID not found for the given username and steamusername' });
    }
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${steamApiKey}&steamid=${steamID}&format=json`;
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching Steam data:', error);
    res.status(500).json({ error: 'Failed to fetch data from Steam API' });
  }
});

app.get("/api/games/:id", async (req, res) => {
  try {
    const gameId = req.params.id;
    const gameCtrl = new gamesController();
    const game = await gameCtrl.show(gameId);
    return res.json(game);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  }
});

app.get("/api/friends/:nativeUserId", async (req, res) => {
  try {
    const nativeUserId = req.params.nativeUserId;
    const friendsCtrl = new friendsController();
    const friends = await friendsCtrl.getFriendsByNativeUserId(nativeUserId);
    return res.json(friends);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  } 
});

app.get("/api/nativeUser/:id", async (req, res) => {
  try {
    const nativeUserId = req.params.id;
    const nativeUserCtrl = new nativeUserController();
    const user = await nativeUserCtrl.show(nativeUserId);
    return res.json(user);
  } catch (err) {
      return res.status(500).json({ error: err.message });
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
    const userId = req.auth.userId;
    const friendUserId = req.body.friendUserId;

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