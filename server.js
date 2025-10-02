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
const PORT = 3000;
// const connection = mysql.createConnection({
//   host: process.env.DB_HOST,
//   port: process.env.DB_PORT,
//   user: process.env.DB_USERNAME,
//   password: process.env.DB_PASSWORD,
//   database: process.env.DB_NAME
// });
// Replace with your actual Steam API key and Steam ID
const steamApiKey = process.env.STEAM_API_KEY;
app.use(cors());

async function getUsersSteamID(username, steamusername){
  return new Promise((resolve, reject) => {
    const query = `
      SELECT sa.account_id 
      FROM users u
      JOIN steamconnectiontable sct ON u.id = sct.user_id
      JOIN steamaccounts sa ON sa.id = sct.steamaccounts_id
      WHERE u.username = ? AND sa.username = ?
    `;
    connection.query(query, [username, steamusername], (err, results) => {
      if (err) {
        console.error('Query error:', err.stack);
        return reject(err);
      }
      if (results.length > 0) {
        resolve(results[0].account_id);
      } else {
        resolve(null);
      }
    });
  });
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
    console.log(steamID);
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
app.get('/api/steam/GameDetails/:appId', (req, res) => {
  const appId = req.params.appId;

  https.get(`https://store.steampowered.com/api/appdetails?appids=${appId}`, (response) => {
    let rawData = '';

    response.on('data', (chunk) => {
      rawData += chunk;
    });

    response.on('end', () => {
      try {
        const parsedData = JSON.parse(rawData);
        const gameData = parsedData[appId]?.data;

        if (gameData) {
          res.json(gameData); //GameSize benne lehet a requirementsekben, másképp leglálisan nem érhető el, nem scraperülnk, ethikai gondok miatt (robots.txt tiltja az adott oldal scrapelését)
        } else {
          res.status(404).json({ error: 'Game data not found' });
        }
      } catch (e) {
        console.error('Failed to parse JSON:', e);
        res.status(500).json({ error: 'Invalid JSON response from Steam API' });
      }
    });

    response.on('error', (err) => {
      console.error('HTTPS response error:', err);
      res.status(500).json({ error: 'Failed to receive data from Steam API' });
    });
  }).on('error', (err) => {
    console.error('HTTPS request error:', err);
    res.status(500).json({ error: 'Failed to fetch Steam API' });
  });
});
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