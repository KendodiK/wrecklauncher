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
const DBMaker = require('./database/DBCreator');
const NativeUsersController = require('./database/controllers/NativeUsersController');
const PlatformUsersController = require('./database/controllers/PlatformUsersController');
const GameController = require('./database/controllers/GamesController');
const ShopSpecialsController = require('./database/controllers/ShopSpecialsController');


app.listen(PORT, () => {
    console.log(`Test server is running on http://localhost:${PORT}`);
});

//generateDB();
//tryCreatePlatformUser();
//tryCreateNativeUser(); --- IGNORE ---
//tryGetNativeUser();
//tryChangeNativeUser('be70909f-fac1-11f0-a4d3-68f728710017');
//tryUploadGame();
//tryUploadGameWithAll();
//tryFillShopSpecials();
//tryChangeShopSpecials(3);
tryGetFromShopSpecials();

function generateDB() {
    let databaseHandler = new DatabaseHandler();
    let dbMaker = new DBMaker();
    databaseHandler.createDB().then(() => {
        dbMaker.createTables();
    });
}

async function tryCreatePlatformUser () {
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
};

async function tryGetNativeUser () {
    try {
        let nativeUsersController = new NativeUsersController();
        let userResult = await nativeUsersController.getUserByNameAndPassword("testUser", "testPassword");
        console.log(userResult);
    } catch (err) {
        console.error('Error in test code:', err instanceof Error ? err.message : String(err));
    }
}

async function tryChangeNativeUser (id) {
    try {
        let nativeUsersController = new NativeUsersController();
        let updateData = {
            "token": true,
            "name": "updatedTestUser", }
        let result = await nativeUsersController.update(id, updateData);
        console.log(result);
    } catch (err) {
        console.error('Error in test code:', err instanceof Error ? err.message : String(err));
    }
}

async function tryUploadGame() {
    let gameData = {
        "app_id": 1111,
        "platform_id": 1,
        "name": "testGame",
        "banner_img": "https://...",
        "description": "blaaa blaaa blaaa test desc",
        "minimum_requirements": "testreq1: 200 ap,\ntestreq2: 21iD",
        "cost": 12.50,
    }
    try {
        let gameCntr = new GameController();
        let res = gameCntr.create(gameData)
        console.log(res.message ?? "stg went wrong check db");
    } catch (err) {
        console.error('Error in creating game:', err instanceof Error ? err.message : String(err));
    }
}

async function  tryUploadGameWithAll() {
    let gameData = {
        "app_id": 2222,
        "platform_id": 1,
        "name": "testGame",
        "banner_img": "https://...",
        "description": "blaaa blaaa blaaa test desc",
        "minimum_requirements": "testreq1: 200 ap,\ntestreq2: 21iD",
        "cost": 12.50,
    }

    let genres = [
        "Shooter", "FPS", "Action"
    ]

    try {
        let gameCntr = new GameController();
        let res = gameCntr.uploadWithAll(gameData, null, genres)
        console.log(res.message ?? "stg went wrong check db");
    } catch (err) {
        console.error('Error in creating game:', err instanceof Error ? err.message : String(err));
    }
}

async function tryFillShopSpecials() {
    try {
        const shopCntr = new ShopSpecialsController();
        for (let id = 1; id <= 27; id++) {
            const featured = id % 5 === 0 ? true : false;       // every 5th game
            const coming_soon = id % 7 === 0 ? true : false;    // every 7th game
            const discounted = id % 3 === 0 ? true : false;     // every 3rd game

            if (!featured && !coming_soon && !discounted) {
                console.log(`Skipping game_id=${id} (no flags set)`);
                continue;
            }

            const data = { "game_id": id, "featured": featured, "coming_soon": coming_soon, "discounted": discounted };
            try {
                const res = await shopCntr.create(data);
                console.log(`Inserted shop_specials for game_id=${id}:`, res.message || res);
            } catch (err) {
                console.error(`Error inserting shop_specials for game_id=${id}:`, err instanceof Error ? err.message : String(err));
            }
        }
        console.log('Finished populating shop_specials.');
    } catch (err) {
        console.error('Error in tryFillShopSpecials:', err instanceof Error ? err.message : String(err));
    }
}

async function tryChangeShopSpecials(id) {
    try {
        const shopCntr = new ShopSpecialsController();
        const data = { "featured": false, "coming_soon": false, "discounted": false };
        const res = await shopCntr.update(id, data);
        console.log(`Updated shop_specials for game_id=${id}:`, res.message || res);
    } catch (err) {
        console.error('Error in tryChangeShopSpecials:', err instanceof Error ? err.message : String(err));
    } 
}

async function tryGetFromShopSpecials() {
    const filter = "featured";
    const from = 0;

    try {
        const shopCntr = new ShopSpecialsController();
        const resp = await shopCntr.getFilteredGamesFrom(filter, from);
        console.log('Successfuly got elements form shop_specials table: ', resp[0]);
    } catch (err) {
        console.error('Failed to get elements form shop_specials table: ', err);
    }
}