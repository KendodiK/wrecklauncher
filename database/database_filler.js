import mysql from 'mysql2/promise';

// Create the connection to database
const connection = await mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'wrecklauncher',
});

//add new chats to 'chats' table
async function addNewChat(friends_id, sender_id, message){
    const query = 'INSERT INTO `chats` (friends_id, message, sender_id) VALUES (?,?,?)'
    try {
        const [result] = await connection.execute(query, [friends_id, message, sender_id]);
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
        const [result] = await connection.execute(query, [genre_id, game_id]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//add new firend connection between users in 'friens' table
async function addFriends(user1_id, user2_id){
    const query = 'INSERT INTO `friens` (user1_id, user2_id) VALUES (?,?)'
    try {
        const [result] = await connection.execute(query, [user1_id, user2_id]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//add new game to 'games' table
async function addNewGame(platform_id, name, banner_img, pfp, cost){
    const query = 'INSERT INTO `games` (platform_id, name, banner_img, pfp, cost) VALUES (?,?,?,?,?)'
    try {
        const [result] = await connection.execute(query, [platform_id, name, banner_img, pfp, cost]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//add new game-pirate site connection to 'game_priates' table 
async function addGamePirateSiteConnection(game_id, site_id, link){
    const query = 'INSERT INTO `game_priates` (game_id, site_id, link) VALUES (?,?,?)'
    try {
        const [result] = await connection.execute(query, [game_id, site_id, link]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//add new genre to 'genres' table 
async function addGenre(genre){
    const query = 'INSERT INTO `genres` (genre) VALUES (?)'
    try {
        const [result] = await connection.execute(query, [genre]);
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
        const [result] = await connection.execute(query, [name, password, pfp]);
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
        const [result] = await connection.execute(query, [name]);
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
        const [result] = await connection.execute(query, [name]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//add new platform user to 'platform_users' table
async function addNewPlatformUser(user_id, platform_id, platform_profile_id, platform_passworld){
    const query = 'INSERT INTO `platform_users` (user_id, platform_id, platform_profile_id, platform_passworld) VALUES (?,?,?,?)'
    try {
        const [result] = await connection.execute(query, [user_id, platform_id, platform_profile_id, platform_passworld]);
        console.log(result);
    }
    catch (err) {
        console.log(err)
    }
}

//calls all the functions which needed to add a new native user
//friend_ids is an array which contains all the user's friend's ids
//platform user is a 2 dimensonal matrix which has the folowing:
//     [platform_name, platform_profile_id, platform_password]
async function addNativeUserAllData(nativeUser, nativePassword, pfp, friend_ids, platform_users){
    addNewNativeUser(nativeUser,nativePassword,pfp); //adding the user
    const query = 'SELECT id FROM native_user WHERE name = (?)'
    let nativeUserId;
    try {
        const [result] = await connection.execute(query, [nativeUser]);
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
            const query = 'SELECT id FROM platforms WHERE platform_name = (?)'
            try {
                const [result] = await connection.execute(query, [platformData[0]]);
                platformId = result;
            }
            catch (err) {
                console.log(err)
            }
            if (platformId == null) {
                addNewPlatform(platformData[0]); //adding platform if it isn't in the db already
            }
        }
        while (platformId != null)

        addNewPlatformUser(nativeUserId, platformId, platformData[1], platformData[2]) //adding platform user infos
    }
}