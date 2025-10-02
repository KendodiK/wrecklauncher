const mysql = require('mysql2/promise');
const {env}=require("process");
// Create the connection to database
let connection;

(async () => {
  try {
    connection = await mysql.createConnection({
      host: env.DB_HOST,
      port: env.DB_PORT,
      user: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      database: env.DB_NAME
    });
    console.log("Database connected successfully");
  } catch (err) {
    console.error("Database connection failed:", err);
  }
})();
//add new chats to 'chats' table
async function addNewChat(friends_id, sender_id, message){
    const query = 'INSERT INTO `chats` (friends_id, message, sender_id) VALUES (?,?,?)'
    try {
        const [result] = await connection.query(query, [friends_id, message, sender_id]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//add new connections to 'connect_genres' table
async function addConnectionToConnect_genre(genre_id, game_id){
    const query = 'INSERT INTO `connect_genres` (genre_id, game_id) VALUES (?,?)'
    try {
        const [result] = await connection.query(query, [genre_id, game_id]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//add new friend connection between users in 'friends' table
async function addFriends(user1_id, user2_id){
    const query = 'INSERT INTO `friens` (user1_id, user2_id) VALUES (?,?)'
    try {
        const [result] = await connection.query(query, [user1_id, user2_id]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//add new game to 'games' table
async function addNewGame(app_id, platform_id, name, banner_img, cost){
    const query = 'INSERT INTO `games` (app_id, platform_id, name, banner_img, cost) VALUES (?,?,?,?,?)'
    try {
        const [result] = await connection.query(query, [app_id, platform_id, name, banner_img, cost]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//add new game-pirate site connection to 'game_pirates' table
async function addGamePirateSiteConnection(game_id, site_id, link){
    const query = 'INSERT INTO `game_priates` (game_id, site_id, link) VALUES (?,?,?)'
    try {
        const [result] = await connection.query(query, [game_id, site_id, link]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//add new genre to 'genres' table 
async function addNewGenre(genre){
    const query = 'INSERT INTO `genres` (genre) VALUES (?)'
    try {
        const [result] = await connection.query(query, [genre]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//add new native user to 'native_users' table
async function addNewNativeUser(name, password, pfp){
    const query = 'INSERT INTO `native_users` (name, user_password, pfp) VALUES (?,?,?)'
    try {
        const [result] = await connection.query(query, [name, password, pfp]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//add new pirate site to 'pirate_sites' table
async function addNewPirateSite(name){
    const query = 'INSERT INTO `pirate_sites` (name) VALUES (?)'
    try {
        const [result] = await connection.query(query, [name]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//add new platform name to 'platforms' table
async function addNewPlatform(name){
    const query = 'INSERT INTO `platforms` (platform_name) VALUES (?)'
    try {
        const [result] = await connection.query(query, [name]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
    return;
}

//add new platform user to 'platform_users' table
async function addNewPlatformUser(user_id, platform_id, platform_profile_id, platform_password){
    const query = 'INSERT INTO `platform_users` (user_id, platform_id, platform_profile_id, platform_passworld) VALUES (?,?,?,?)'
    try {
        const [result] = await connection.query(query, [user_id, platform_id, platform_profile_id, platform_passworld]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//calls all the functions which needed to add a new native user
//friend_ids is an array which contains all the user's friend's ids
//platform user is a 2-dimensional matrix which has the following:
//     [platform_name, platform_profile_id, platform_password]
async function addNativeUserAllData(nativeUser, nativePassword, pfp, friend_ids, platform_users){
    addNewNativeUser(nativeUser,nativePassword,pfp); //adding the user
    const query = 'SELECT id FROM native_user WHERE name = (?)'
    let nativeUserId;
    try {
        const [result] = await connection.query(query, [nativeUser]);
        nativeUserId = result;
    }
    catch (err) {
        console.log(err)
    }

    for (const friendId of friend_ids) {
        addFriends(nativeUserId,friendId) //idk how we will get the friend idsss; adding the friends one by one
    }

    for (const platformData in platform_users) {
        let platformId;
        do {
            platformId  = getPlatformId(platformData[0]);
            if (platformId == null) {
                addNewPlatform(platformData[0]); //adding platform if it isn't in the db already
            }
        }
        while (platformId != null)
        addNewPlatformUser(nativeUserId, platformId, platformData[1], platformData[2]); //adding platform user infos
    }
}

//calls the functions which needed to add a new game
//pirateSites is a 2-dimensional matrix which contains all the pirate sites were the game can be downloaded:
//   [pirateSiteName, link]
//genres is an array which contains the game's genres
// async function addGameAllData(platform, name, banner_img, cost, pirateSites, genres){
//     var platformId;
//     do {
//         platformId  = await getPlatformId(platform);
//         if (platformId == null) {
//             await addNewPlatform(platform); //adding platform if it isn't in the db already
//         }
//     }
//     while (platformId != null)
//     await addNewGame(app_id, platformId,name,banner_img, pfp, cost); //adding new game

//     for (const pirateSiteData of pirateSites){
//         var pirateSiteId;
//         do {
//             const query = 'SELECT id FROM pirate_sites WHERE name = (?)'
//             try {
//                 const [result] = await connection.query(query, [pirateSiteData[0]]);
//                 pirateSiteId = result;
//             }
//             catch (err) {
//                 console.log(err)
//             }
//             if (pirateSiteId == null){
//                 await addNewPirateSite(pirateSiteData[0]); //adding new pirate site if not exists
//             }
//         }
//         while (pirateSiteId != null)
//         var gameId;
//         const query = 'SELECT id FROM games WHERE name = (?)'
//         try {
//             const [result] = await connection.query(query, [name]);
//             gameId = result;
//         }
//         catch (err) {
//             console.log(err)
//         }
//         await addGamePirateSiteConnection(gameId,pirateSiteId,pirateSiteData[2]) //adding game-pirate site connection
//     }

//     for(const genre of genres){
//         var genreId;
//         do {
//             const query = 'SELECT id FROM genres WHERE name = (?)'
//             try {
//                 const [result] = await connection.query(query, [genre]);
//                 genreId = result;
//             }
//             catch (err) {
//                 console.log(err)
//             }
//             if (genreId == null){
//                 await addNewGenre(genre); //adding new pirate site if not exists
//             }
//         }
//         while (genreId != null)
//         await addConnectionToConnect_genre(genreId,gameId);
//     }
// }
async function addGameAllData(app_id,platform, name, banner_img, cost, pirateSites, genres) {
    try {
      // Ensure platform exists
      let [platformResult] = await connection.execute('SELECT id FROM platforms WHERE platform_name = ?', [platform]);
      let platformId = platformResult[0]?.id;
  
      if (!platformId) {
        await connection.execute('INSERT INTO platforms (platform_name) VALUES (?)', [platform]);
        [platformResult] = await connection.execute('SELECT id FROM platforms WHERE platform_name = ?', [platform]);
        platformId = platformResult[0]?.id;
      }
  
      // Add game
      await connection.execute(
        'INSERT INTO games (app_id,platform_id, name, banner_img, cost) VALUES (?,?, ?, ?, ?)',
        [app_id,platformId, name, banner_img, cost]
      );
  
      // Get game ID
      const [gameResult] = await connection.execute('SELECT id FROM games WHERE name = ?', [name]);
      const gameId = gameResult[0]?.id;
      if (!gameId) throw new Error(`Game ID not found for "${name}"`);
  
      // Add pirate site connections
      try{
      for (const [siteName, link] of pirateSites) {
        let [siteResult] = await connection.execute('SELECT id FROM pirate_sites WHERE name = ?', [siteName]);
        let siteId = siteResult[0]?.id;
  
        if (!siteId) {
          await connection.execute('INSERT INTO pirate_sites (name) VALUES (?)', [siteName]);
          [siteResult] = await connection.execute('SELECT id FROM pirate_sites WHERE name = ?', [siteName]);
          siteId = siteResult[0]?.id;
        }
  
        await connection.execute(
          'INSERT INTO game_pirate_sites (game_id, pirate_site_id, link) VALUES (?, ?, ?)',
          [gameId, siteId, link]
        );
      }}catch{
        console.log("no pirate sites for this game")
      }
  
      // Add genre connections
      for (const genre of genres) {
        let [genreResult] = await connection.execute('SELECT id FROM genres WHERE genre = ?', [genre]);
        let genreId = genreResult[0]?.id;
  
        if (!genreId) {
          await connection.execute('INSERT INTO genres (genre) VALUES (?)', [genre]);
          [genreResult] = await connection.execute('SELECT id FROM genres WHERE genre = ?', [genre]);
          genreId = genreResult[0]?.id;
        }
  
        await connection.execute(
          'INSERT INTO connect_genres (genre_id, game_id) VALUES (?, ?)',
          [genreId, gameId]
        );
      }
  
      console.log(`✅ Game "${name}" added successfully with ID ${gameId}`);
    } catch (err) {
      console.error(`❌ Error adding game "${name}":`, err.message);
    }
  }
async function getPlatformId(platformName){
    const query = 'SELECT id FROM platforms WHERE platform_name = (?)'
    try {
        const [result] = await connection.query(query, [platformName]);
        return result;
    }
    catch (err) {
        console.log(err);
    }
}


module.exports = {addNewGenre, addNewNativeUser, addNewPirateSite, addNewPlatform, addNewPlatformUser, addNativeUserAllData, addGameAllData, getPlatformId}