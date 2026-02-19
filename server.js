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
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const databaseHandler = require('./database/DatabaseHandler');
const databaseMaker = require('./database/DBCreator');
const nativeUserController = require('./database/controllers/NativeUsersController');
//const dbmaker = new databaseMaker('./database/wrecklauncher.sql');
const { platform } = require('os');
const crypto = require('crypto');
const platformUsersController = require('./database/controllers/PlatformUsersController');
const PlatformsController = require('./database/controllers/PlatformsController');
const DBMaker = require('./database/DBCreator');
const PORT = 3000;
// Replace with your actual Steam API key and Steam ID
const steamApiKey = process.env.STEAM_API_KEY;
app.use(cors());

// const dbHandler = new databaseHandler();
// dbHandler.createDB();
// const dbMaker = new databaseMaker();
// dbMaker.createTables();
const platformUserCtrl = new platformUsersController();
const platformsCtrl = new PlatformsController();
const nativeUserCtrl = new nativeUserController();
// (async () => {
//     const users = await nativeUserCtrl.index();
//     console.log(users);
// })();
/**
 * Loads TLS configuration for the HTTPS server.
 *
 * Priority:
 * 1) env vars `SSL_KEY_PATH` + `SSL_CERT_PATH`
 * 2) `./certs/localhost-key.pem` + `./certs/localhost-cert.pem`
 * 3) dev fallback: generate a self-signed cert (requires `selfsigned` dependency)
 *
 * Note: Self-signed certificates are NOT trusted by default. For Electron/Node fetch
 * to work without extra flags, use a trusted dev cert (e.g. mkcert) and point to it.
 */
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

  const httpV4 = http.createServer(app);
  const httpV6 = http.createServer(app);
  httpV4.listen(httpPort, '127.0.0.1');
  httpV6.listen(httpPort, '::1');

  console.log(`API server (HTTPS) running at https://localhost:${httpsPort}`);
  console.log(`API server (HTTP) running at http://localhost:${httpPort}`);
}

startServers();


async function uploadGame(platformname, name, banner_img, pfp, cost, genres) {
  //check before upload
  // return dbHandler.addGameAllData(
  //   platformname,
  //   name,
  //   banner_img,
  //   pfp,
  //   cost,
  //   genres
  // );
}

app.post('/api/login/:username/:password', async (req, res) => {
  try {
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

app.get('/api/steam/key/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const dbToken = (await nativeUserCtrl.show(token.split('.')[0])).token;
    if (!dbToken || dbToken !== token.split('.')[1]) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.json({ steamApiKey: steamApiKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/steam/GameDetails/:appId", async (req, res) => {
  const appId = req.params.appId;

  try {
    const data = await fetchSteamAppDetails(appId, {
      cc: "us",
      lang: "en"
    });
    // uploadGame('steam',data.name,data.capsule_image,data.capsule_image,data.price_overview.intial,data.genres.map(g => g.description));
    uploadGame(
      'steam',
      data.steam_appid,               // ✔ appid
      data.name,
      data.capsule_image,
      data.capsule_image,
      data.price_overview?.final / 100 ?? 0, // ✔ correct price
      data.genres?.map(g => g.description) ?? []
    );
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
