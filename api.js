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

const PORT = 3000;
// Replace with your actual Steam API key and Steam ID
const steamApiKey = process.env.STEAM_API_KEY;
app.use(cors());



app.listen(PORT, () => {
   console.log(`Proxy server running at http://localhost:${PORT}`);
});


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

app.get('/api/platform/UserID/:platformname/:platformUsername/:token', async (req, res) => {
    try {
        const platformname = req.params.platformname;
        const platformUsername = req.params.platformUsername;
        const token = req.params.token;
        
        // Extract user ID from token (format: id.token)
        const userId = token.split('.')[0];
        
        // Get platform users for this native user
        const platformUsers = await platformUserCtrl.getByNativeUserId(userId);
        
        if (!platformUsers || platformUsers.length === 0) {
            return res.status(404).json({ error: 'No platform users found for this user' });
        }
        
        // Resolve platform id from platform name
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

app.get("/api/steam/GameDetails/:appId", async (req, res) => {
  const appId = req.params.appId;

  try {
    const data = await fetchSteamAppDetails(appId, {
      cc: "us",
      lang: "en"
    });
    uploadGame(
      'steam',
      data.steam_appid,
      data.name,
      data.capsule_image,
      data.capsule_image,
      data.price_overview?.final / 100 ?? 0,
      data.genres?.map(g => g.description) ?? []
    );
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/games/upload/:token", async (req, res) => {
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
    const nativeUserCtrl = new nativeUserController()
    
    const token = req.params.token;
    const userId = token.split('.')[0];
    const userUniqueToken = token.split('.')[1];

    // Validate token
    const user = await nativeUserCtrl.show(userId);
    if (!user || user.token !== userUniqueToken) {
      return res.status(401).json({ error: 'Invalid token' });
    }

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
    res.status(201).json({ message: 'Game uploaded successfully', gameId: uploadedGame.id });
  } catch (error) {
    console.error('Error in /api/games/upload endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});