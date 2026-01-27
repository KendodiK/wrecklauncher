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
const PORT = 3000;
// Replace with your actual Steam API key and Steam ID
const steamApiKey = process.env.STEAM_API_KEY;
app.use(cors());
// --- REQUIRE DATABASE HANDLERS AND CONTROLLERS HERE ---
const DatabaseHandler = require('./database/DatabaseHandler');
const DBMaker = require('./database/makers/DBMaker');
const NativeUsersController = require('./database/controllers/NativeUsersController');
const PlatformUsersController = require('./database/controllers/PlatformUsersController');


app.listen(PORT, () => {
    console.log(`Test server is running on http://localhost:${PORT}`);
});

//generateDB();

function generateDB() {
    let databaseHandler = new DatabaseHandler();
    let dbMaker = new DBMaker();
    databaseHandler.createDB().then(() => {
        dbMaker.createTables();
    });
}

(async () => {
    try {
        let userData = {
            "name": "testUser",
            "user_password": "testPassword",
            "pfp": null
        }
        let nativeUsersController = new NativeUsersController();
        //await nativeUsersController.create(userData);
        let userResult = await nativeUsersController.getUserByNameAndPassword("testUser", "testPassword");
        let userId = userResult?.id;

        let platformUserData = {
                    "native_user_id": userId,
                    "platform_user_name": "testPlatformUser",
                    "platform_id": 1,
                    "platform_name": null,
                    "platform_profile_id": "111111111111111",
                    "platform_password": "testPlatformPassword"
                }
        let platformUsersController = new PlatformUsersController();
        let result = await platformUsersController.createUserWhithAllForeginData(platformUserData);
        console.log(result);
    } catch (err) {
        console.error('Error in test code:', err instanceof Error ? err.message : String(err));
    }
})();