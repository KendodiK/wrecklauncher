// server.js
const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const cors = require('cors');
require('dotenv');
const mysql = require('mysql2');
const { env } = require('process');
const app = express();
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

async function getUsersSteamID(username){
    connection.connect(err => {
        if (err) {
          console.error('Connection error:', err.stack);
          return;
        }
      });
    connection.query('SELECT steam_userid FROM steamaccounts  where username=', (err, results) => {
    if (err) {
        console.error('Query error:', err.stack);
        return;
    }
    console.log('Results:', results);
    return results[0].steam_userid;
    });
    connection.end();
}

app.get('/api/steam/getUserID', async (req, res) => {
    const username = req.query.username;
    const steam_userid = await getUsersSteamID(username);
    res.json({ steam_userid: steam_userid });
});

app.get('api/steam/getOwnedGames', async (req, res) => {
  try {
    const steamID = await getUsersSteamID(req.query.username);
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