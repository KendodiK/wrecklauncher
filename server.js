// server.js
const express = require('express');
// const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fetch = require('node-fetch'); // works with v2
const puppeteer = require('puppeteer');
const cors = require('cors');
require('dotenv').config();
const mysql = require('mysql2');
const { env } = require('process');
const app = express();
const https = require('https');
const zlib = require('zlib');
const databaseHandler = require('./database/database_handler');
const { platform } = require('os');
const PORT = 3000;
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});
// Replace with your actual Steam API key and Steam ID
const steamApiKey = process.env.STEAM_API_KEY;
app.use(cors());

async function getUsersSteamID(username, steamusername) {
  return new Promise((resolve, reject) => {
    const query = `
      SELECT pu.platform_profile_id
      FROM native_users u
      JOIN platform_users pu ON u.id = pu.user_id
      WHERE u.name = ? AND pu.platform_username = ?
    `;

    connection.query(query, [username, steamusername], (err, results) => {
      if (err) {
        console.error('Query error:', err);
        return reject(err);
      }

      if (results.length > 0) {
        resolve(results[0].platform_profile_id);
      } else {
        resolve(null);
      }
    });
  });
}


async function uploadGame(platformname, name, banner_img, pfp, cost, genres) {
  //check before upload

  return databaseHandler.addGameAllData(
    platformname,
    name,
    banner_img,
    pfp,
    cost,
    genres
  );
}
app.get('/api/steam/UserID/:username/:steamusername', async (req, res) => {
    const username = req.params.username;
    const steamusername = req.params.steamusername;
    const steam_userid = await getUsersSteamID(username, steamusername);
    res.json({ steam_userid: steam_userid });
});

app.get('/api/steam/OwnedGames/:username/:steamusername', async (req, res) => {
  try {
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

    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
// app.get('/api/steam/GameDetails/:appId', (req, res) => {
//   const appId = req.params.appId;

//   https.get({
//     hostname: 'store.steampowered.com',
//     path: `/api/appdetails?appids=${appId}&cc=us`,
//     headers: {
//       'Accept-Encoding': 'identity',
//       'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
//     }
//   }, (response) => {
//     let rawData = '';

//     response.on('data', (chunk) => {
//       rawData += chunk;
//     });

//     response.on('end', () => {
//       try {
//         const parsedData = JSON.parse(rawData);
//         const gameData = parsedData[appId]?.data;

//         if (gameData) {

//           const price = gameData.price_overview
//             ? gameData.price_overview.initial/100
//             : 0;
        
        
//           const genres = Array.isArray(gameData.genres)
//             ? gameData.genres.map(g => g.description)
//             : [];
        
//           uploadGame(
//             "steam",
//             appId,
//             gameData.name,
//             gameData.capsule_image,
//             gameData.capsule_image,
//             price,
//             genres
//           );
        
//           return res.json(gameData);
        
//         } else {
//           console.log(rawData);
//           res.status(404).json({ error: 'Game data not found' });
//         }
//       } catch (e) {
//         console.error('Failed to parse JSON:', e);
//         console.log(rawData);
//         res.status(500).json({ error: 'Invalid JSON response from Steam API' });
//       }
//     });

//     response.on('error', (err) => {
//       console.error('HTTPS response error:', err);
//       res.status(500).json({ error: 'Failed to receive data from Steam API' });
//     });
//   }).on('error', (err) => {
//     console.error('HTTPS request error:', err);
//     res.status(500).json({ error: 'Failed to fetch Steam API' });
//   });
// });
function fetchSteamAppDetails(appId, {
  cc = "us",
  lang = "en",
  timeout = 8000,
  retries = 5,
  retryDelay = 500 // ms
} = {}) {

  return new Promise((resolve, reject) => {

    function attempt(tryNumber) {

      const options = {
        hostname: "store.steampowered.com",
        path: `/api/appdetails?appids=${appId}&cc=${cc}&l=${lang}`,
        method: "GET",
        headers: {
          "Accept-Encoding": "identity",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
        },
        timeout
      };

      const req = https.get(options, (res) => {
        let data = "";

        if (res.statusCode === 429) {
          if (tryNumber < retries) {
            const wait = retryDelay * tryNumber;
            console.log(`Steam 429 for ${appId}, retrying in ${wait}ms`);
            return setTimeout(() => attempt(tryNumber + 1), wait);
          } else {
            return reject(new Error(`Steam HTTP Error 429 (too many retries)`));
          }
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Steam HTTP Error: ${res.statusCode}`));
        }

        res.on("data", chunk => data += chunk);

        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            const appData = parsed[appId];

            if (!appData || !appData.success)
              return reject(new Error(`Steam returned success=false for AppID ${appId}`));

            resolve(appData.data);
          } catch (err) {
            reject(new Error("Failed to parse Steam JSON: " + err.message));
          }
        });
      });

      req.on("error", reject);

      req.on("timeout", () => {
        req.destroy();
        reject(new Error("Steam API request timed out"));
      });
    }

    attempt(1);
  });
}
app.get('/api/freetp/Search/:gameName', (req, res) => {
  const gameName = req.params.gameName;
  const postData = `query=${encodeURIComponent(gameName)}`;

  const options = {
    hostname: 'freetp.org',
    path: '/engine/ajax/search.php',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Content-Length': Buffer.byteLength(postData),
      'Accept-Encoding': 'gzip',
      'User-Agent': 'Mozilla/5.0',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://freetp.org/',
      'Cookie': 'PHPSESSID=your-valid-session-id; cf_clearance=your-valid-clearance-token'
    }
  };

  const request = https.request(options, (response) => {
    let stream = response;

    if (response.headers['content-encoding'] === 'gzip') {
      stream = response.pipe(zlib.createGunzip());
    }

    let html = '';
    stream.on('data', chunk => html += chunk.toString());

    stream.on('end', () => {
      try {
        console.log(html);
        // Match the first <a href="..."> inside a .heading block
        const match = html.match(/<div class="heading">.*?<a href="([^"]+)"/);
        const firstLinkMatch = html.match(/<a\s+href="(https:\/\/freetp\.org\/[^"]+\.html)"/i);
        if (firstLinkMatch && firstLinkMatch[1]) {
          const firstLink = firstLinkMatch[1];
          res.json({ link: firstLink });
        } else {
          res.status(404).json({ error: 'No valid game link found in HTML' });
        }      
      } catch (err) {
        console.error('Error parsing HTML:', err);
        res.status(500).json({ error: 'Failed to extract link' });
      }
    });
  });

  request.on('error', err => {
    console.error('Request error:', err);
    res.status(500).json({ error: 'Failed to fetch from freetp.org' });
  });

  request.write(postData);
  request.end();
});
//online-fix.me, freetp.org
app.listen(PORT, () => {
  console.log(`Proxy server running at http://localhost:${PORT}`);
});