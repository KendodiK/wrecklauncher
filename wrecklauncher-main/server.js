// server.js
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cors = require('cors');
require('dotenv').config();
const mysql = require('mysql2');
const { env } = require('process');
const app = express();
const PORT = 3000;
const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});
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

app.listen(PORT, () => {
  console.log(`Proxy server running at http://localhost:${PORT}`);
});