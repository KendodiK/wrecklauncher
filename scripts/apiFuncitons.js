const apiHelpers = require('./apiHelpers.js');
const apiDoc = require('./apiDoc.js');

//#region RequireControllers
const GamesController = require('../database/controllers/GamesController.js');
const GamesGenresConnnectionController = require('../database/controllers/GamesGenresConnectionController.js');
const GamesPirateSitesConnectionController = require('../database/controllers/GamesPirateSitesConnectionController.js');
const FriendsController = require('../database/controllers/FriendsController.js');
const NativeUsersController = require('../database/controllers/NativeUsersController.js');
const ChatsController = require('../database/controllers/ChatsController.js');
const PlatformsController = require('../database/controllers/PlatformsController.js');
const PlatformUsersController = require('../database/controllers/PlatformUsersController.js');
const ShopSpecialsController = require('../database/controllers/ShopSpecialsController.js');
const PricesController = require('../database/controllers/PricesController.js');
//#endregion

// ====================== ///
// ====================== ///
// ======== GET ========= ///
// ====================== ///
// ====================== ///

/**
 * GET /game/:id
 * 
 * @route GET /game/:id
 * @param {Object} req
 * @param {Object} req.params
 * @param {number} req.params.id
 * @param {Object} res
 * 
 * @returns {apiDoc.Game}
 */
module.exports.GETGameById = async function (req, res) {
  try {
    const { id: gameId } = req.params;
    const gameCtrl = new GamesController();
    const game = await gameCtrl.show(gameId);
    return res.status(200).json(game);
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
};

/**
 * :id - (int) gameId
 * @param {Array} req - body: country_code - (string) short code of the country for price
 * @param {*} res - {
 *                  "id": (int) id,
 *                  "app_id": (int) local ID in platform,
 *                  "banner_img": (string) link to banner img,
 *                  "description": (string) short description of the game,
 *                  "minimum_requirements": (string) list of minimum requirements,
 *                  "platform_id": (int) ID of platform which the game is from,
 *                  "platform": (string) name of the platform,
 *                  "price": (int) stored price in given country,
 *                  "currnecy": (string) currency in given country,
 *                  "formated_price": (string) price to display,
 *                  "genres": [
 *                      {
 *                      "id": (int) genre id in DB,
 *                      "genre": (string) the accual genre,
 *                      } ...
 *                  ]
 *                  "priate_sites": [
 *                      {
 *                       
 *                      }
 *                  ]
 *                  }
 * @returns - 200 - res || 500 - error
 */
module.exports.GETGamesByPlatformIdWithAllData = async function (req, res) {
    try {
        const { appId } = req.params;
        const { country_code: countryCode } = req.body;
        const appIdNum = Number(appId);
        if (!Number.isFinite(appIdNum) || appIdNum <= 0) {
            return res.status(400).json({ error: `Invalid appId: ${String(appId)}` });
        }

        const gameCtrl = new GamesController();
        const gameId = await gameCtrl.getGameIdByAppId(appIdNum);
        if (!gameId) {
            return res.status(404).json({ error: `Game not found by appId: ${appIdNum}` });
        }

        const game = await gameCtrl.getWithAllForeign(gameId, countryCode);
        if (!game) {
            return res.status(404).json({ error: `Game not found: ${gameId}` });
        }

        const gamesGenresCtrl = new GamesGenresConnnectionController();
        const resultGg = await gamesGenresCtrl.getByGameId(gameId)
        const gameGenres = resultGg ?? [];
        game.genres = gameGenres;

        const gamesPirateSitesConnCtrl = new GamesPirateSitesConnectionController();
        const resultGs = await gamesPirateSitesConnCtrl.getConnectionsByGameId(gameId); 
        const pirateSites = resultGs ?? [];
        game.pirate_sites = pirateSites;

        return res.json(game);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

module.exports.GETGameByIdWithAllData = async function (req, res) {
    try {
    const {id: gameId } = req.params;
    const { country_code: countryCode } = req.body;
    const gameCtrl = new GamesController();
    const game = await gameCtrl.getWithAllForeign(gameId, countryCode);

    if (!game) {
      return res.status(404).json({ error: `Game not found: ${gameId}` });
    }

    const gamesGenresCtrl = new GamesGenresConnnectionController();
    const gameGenres = await gamesGenresCtrl.getByGameId(gameId);
    game.genres = gameGenres;

    return res.json(game);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  }
}

module.exports.GETGamesInListByPlatformId = async function (req, res) {
    try {
        const { platformId, from } = req.params;
        const { country_code: countryCode } = req.body;

        const gameCtrl = new GamesController();
        const games = await gameCtrl.getAllGamesByPlatformFrom(countryCode, platformId, from);

        if (games instanceof Error) {
            res.status(404).json({ error: games.message });
        }
        return res.json(games);
    } catch (err) {
        return res.status(500).json({ error: err.message })
    }
}

module.exports.GETGamesInList = async function (req, res) {
    try {
        const { from } = req.params;
        const { country_code: countryCode } = req.body;

        const gamesCtrl = new GamesController();
        const games = await gamesCtrl.getAllGamesFrom(countryCode, from);

        return res.json(games);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

module.exports.GETSearch = async function (req, res) {
    try {
        const { needle } = req.params;
        const gameCtrl = new GamesController();
        const result = await gameCtrl.search(needle);
        if (result instanceof Error) {
            return res.status(400).json({ error: result.error });
        }
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

module.exports.GETFriendsOfNativeUser = async function (req, res) {
    try {
        const { nativeUserId } = req.params;
        const friendsCtrl = new FriendsController();
        const friendsRaw = await friendsCtrl.getNativeUserFriends(nativeUserId);

        const friends = [];
        friendsRaw.forEach(friend => {
            friends.push({
                id: friend.id,
                user_id: (Number(friend.user1_id) !== Number(nativeUserId)) ? friend.user1_id : friend.user2_id
            });
        });
        return res.json(friends);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }     
}

module.exports.GETNativeUserById = async function (req, res) {
    try {
        const { userId } = req.params;
        const nativeUserCtrl = new NativeUsersController();
        const result = await nativeUserCtrl.show(userId);
        const user = {
            "id": result.id,
            "name": result.name,
            "bio": result.bio,
            "pfp": result.pfp
        }
        return res.json(user);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

module.exports.GETNativeUserByName = async function (req, res) {
    try {
        const { name } = req.params;
        const nativeUserCtrl = new NativeUsersController();
        const results = await nativeUserCtrl.getuserByName(name);
        if(results.length < 1) {
            return res.status(404).json({ error: "No user with given name in DB"})
        }
        let users = [];
        for (let result of results) {
            let user = {
                "id": result.id,
                "name": result.name,
                "bio": result.bio,
                "pfp": result.pfp
            };
            users.push(user);
        }
        return res.json(users);
    } catch (err) {
        console.error('Error in /api/native-users/name/ endpoint:', error);
        return res.status(500).json({ error: error.message });
    }
}

module.exports.GETChatlogByFriendId = async function (req, res) {
    try {
        const { friendsId } = req.params;
        const { from } = req.body;
        const chatsCtrl = new ChatsController();
        const chatLog = await chatsCtrl.getByFriedsId(friendsId, from);
        return res.json(chatLog);
    } catch (error) {
        console.error('Error in /api/chat endpoint:', error);
        return res.status(500).json({ error: error.message });
    }
}

module.exports.GETPlatformByPlatromName = async function (req, res) {
    try {
        const { platformName } = req.params;
        const platformCtrl = new PlatformsController();
        const result = await platformCtrl.getByPlatformName(platformName);
        if (result instanceof Error) {
            return res.status(400).json({ message: 'Iternal server error', error: result });
        }
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

module.exports.GETPlatformUsersByNativeUserId = async function (req, res) {
    try {
        const { userId } = req.auth;
        const platformUserCtrl = new PlatformUsersController();
        const result = await platformUserCtrl.getByNativeUserId(userId);
        if (result instanceof Error) {
            return res.status(400).json({ message: 'Iternal server error', error: result });
        }
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

module.exports.GETShopSpecialsFilteredInList = async function (req, res) {
    try {
        const { filter, from } = req.params;
        const shopSpecialsCtrl = new ShopSpecialsController();
        let result = await shopSpecialsCtrl.getFilteredGamesFrom(filter, from);
        if (result instanceof Error) {
            return res.status(400).json({ message: 'Iternal server error', error: result });
        }
        return res.json(result);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    } 
}

// ====================== ///
// ====================== ///
// ======== POST ======== ///
// ====================== ///
// ====================== ///

module.exports.POSTNewNativeUser = async function (req, res) {
    try {
        const nativeUserCtrl = new NativeUsersController();
        const { username, password, email } = req.body;

        const existingUser = await nativeUserCtrl.getUserByNameAndPassword(username, password);

        if (existingUser) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        const userData = {
            "name": username,
            "user_password": password,
            "email": email,
        };
        const newUser = await nativeUserCtrl.create(userData);
        return res.status(201).json({newUser, token: newUser.id + "." + newUser.token});
    } catch (error) {
        console.error('Error in /api/signup endpoint:', error);
        return res.status(500).json({ error: error.message });
    }
}

module.exports.POSTNewGame = async function (req, res) {
    try {
        if (apiHelpers.shouldSkipGameBecausePriceMissing(req.body, 'upload', req.body?.name)) {
        return res.status(200).json({ message: 'Skipped upload: non-free game is missing price.' });
        }

        const gamesCtrl = new GamesController();
        const platformCtrl = new PlatformsController();

        let { county_code: countyCode, genre_names: genreNames, cost: price } = req.body;
        const platformName = req.body.platform_name ?? null;
        const platformId = req.body.platform_id ?? null;
        let resolvedPlatformName = platformName ?? await platformCtrl.show(platformId);
        if(!resolvedPlatformName) {
            return res.status(400).json({ error: 'Could not upload no platform name given or DB don`t contain platform with given platform id'})
        }
        let resolvedPlatformId = platformId;
        if(!resolvedPlatformId) {
            const platform = await platformCtrl.getByPlatformName(resolvedPlatformName);
            resolvedPlatformId = platform.id;
        }
        const fallbackBanner = req.body.banner_img ?? null;
        const platformBannerImg = await apiHelpers.getPlatformBannerUrl({
            platformName: resolvedPlatformName,
            appId: req.body.app_id,
            fallbackBanner,
        });

        const gameData = {
            "app_id": req.body.app_id,
            "platform_id": resolvedPlatformId,
            "platform_name": platformName,
            "name": req.body.name,
            "banner_img": platformBannerImg,
            "description": req.body.description ?? null,
            "minimum_requirements": req.body.minimum_requirements ?? null,
        };


        if ((!Array.isArray(genreNames) || genreNames.length === 0) && String(resolvedPlatformName ?? '').trim().toLowerCase() === 'itch') {
            const itchDetails = await apiHelpers.fetchItchGameDetails(req.body.app_id, { includePageDetails: true });
            genreNames = apiHelpers.normalizeGenreNames(itchDetails?.genres ?? []);
        }
        const countyId = await apiHelpers.getCountryIdByCode(countyCode);
        
        const uploadedGame = await gamesCtrl.uploadWithAll(gameData, null, genreNames, {"price": price, "county_id": countyId});
        return res.status(201).json({ message: 'Game uploaded successfully', gameId: uploadedGame.id });
    } catch (err) {
        console.error('Error in /api/games/upload endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
}

module.exports.POSTNewPrice = async function (req, res) {
    try {
        const { price, county_code: countyCode, game_id: gameId } = req.body;
        const pricesCtrl = new PricesController();
    
        const countyId = await apiHelpers.getCountryIdByCode(countyCode);
        const uploadPrice = await pricesCtrl.create({"gameId": gameId, "countyId": countyId, "price": price});
        if(uploadPrice instanceof Error) {
            return res.status(400).json({ error: `Error while createing new price: ${uploadPrice}` })
        }

        return res.status(201).json({ message: `New price added to game (${gameId}) succesfully`});
    } catch (err) {
        console.error('Error in /api/games/upload endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
}

module.exports.POSTNewPirateSiteConnectionByGameId = async function (req, res) {
    try {
        const {gameId} = req.params;
        const {link, site_id: siteId, site_name: siteName} = req.body;
        const gamesPirateSitesConnCtrl = new GamesPirateSitesConnectionController();
        const data = {
            "game_id": gameId,
            "pirate_site_id": siteId ?? null,
            "site_name": siteName ?? null,
            "link": link,
        }
        console.log(".\n.\n.\n", data, "\n.\n.\n");

        const result = await gamesPirateSitesConnCtrl.createWithAll(data);
        if (result instanceof Error) {
            return res.status(400).json({ message: result.message });
        }
        return res.json(result);
    } catch (err) {
        console.error('Error in /api/pirate_sites/:gameId/siteId endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
}

module.exports.POSTNewFriends = async function (req, res) {
    try {
        const { userId } = req.auth;
        const { friend_user_id: friendUserId } = req.body;

        const friendsCtrl = new FriendsController();
        const result = await friendsCtrl.create({ user1_id: userId, user2_id: friendUserId });
        if (result.message.includes('already exists') || result instanceof Error) {
            return res.status(400).json({ message: result.message });
        }
        return res.status(201).json({ message: "friendship created", id: result.id });
    } catch (error) {
        console.error('Error in /api/friends endpoint:', error);
        return res.status(500).json({ error: error.message }); 
    }
}

module.exports.POSTNewPlatform = async function (req, res) {
    try {
        const { platform_name: platformName } = req.body;

        const platformCtrl = new PlatformsController();
        const result = await platformCtrl.create({name: platformName});
        if( result instanceof Error ) {
            return res.status(400).json({ message: result.message });
        }
        return res.status(201).json({message: "platform created", id: result.id})
    } catch (err) {
        console.log('Error in /api/platforms endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
}

module.exports.POSTNewPlatformUser = async function (req, res) {
    try {
        const { userId } = req.auth;

        const { platform_user_name: platformUserName, 
                platform_id: platformId, 
                platform_prof_id: platfProfId, 
                oauth_token: oauthToken 
              } = req.body || {};

        const missing = [];
        if (platformUserName == null) missing.push('platformUserName');
        if (platformId == null) missing.push('platformId');
        if (platfProfId == null) missing.push('platfProfId');
        if (oauthToken == null) missing.push('oauth_token');
        if (missing.length) {
            return res.status(400).json({ message: 'Missing required fields', missing });
        }

        const data = {
            "native_user_id": userId,
            "platform_user_name": platformUserName,
            "platform_id": platformId,
            "platform_profile_id": platfProfId,
            "oauth_token": oauthToken,
        }

        const platformUserCtrl = new PlatformUsersController();
        const result = await platformUserCtrl.create(data);
        if( result instanceof Error ) {
            return res.status(400).json({ message: result.message });
        }
        return res.status(201).json({ message: "platform user uploaded", id: result.id });
    } catch (err) {
        console.log('Error in /api/platform_users endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
}

module.exports.POSTNewCountry = async function (req, res) {
    try {
        const { code } = req.body;
        const id = await apiHelpers.getCountryIdByCode(code);

        if ( id instanceof Error ) {
        return res.status(400).json({ message: res.message });
        }
        return res.status(201).json({ message: "county uploaded", id: id});
    } catch (err) {
        console.log('Error in /api/countries endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
}

// ====================== ///
// ====================== ///
// ======== PUT ========= ///
// ====================== ///
// ====================== ///

module.exports.PUTNativeUserLogin = async function (req, res) {
    try {
        const { userId } = req.auth;
        const nativeUserCtrl = new NativeUsersController();
        const updatedUser = await nativeUserCtrl.update(userId, req.body);
        if (updatedUser instanceof Error) {
            return res.status(400).json({ message: updatedUser.message });
        }
        return res.json(updatedUser);
    } catch (error) {
        console.error('Error in /api/nativeUser/:id endpoint:', error);
        return res.status(500).json({ error: error.message });
    }
}

module.exports.PUTGames = async function (req, res) {
    try {
        const { id: gameId } = req.params;

        const gameData = {
            "app_id": req.body.app_id,
            "platform_id": platformId,
            "name": req.body.name,
            "banner_img": req.body.banner_img,
            "description": req.body.description ?? null,
            "minimum_requirements": req.body.minimum_requirements ?? null,
        }

        const gamesCtrl = new GamesController();
        const updatedGame = gamesCtrl.update(gameId, gameData);
        if (updatedGame instanceof Error) {
            return res.status(400).json({ message: updatedGame.message });
        }
        return res.json(updatedGame);
    } catch (err) {
        console.error('Error in /api/games/:id endpoint:', error);
        return res.status(500).json({ error: error.message });
    }
}

module.exports.PUTShopSpecialsByGameId = async function (req, res) {
    try {
        const { gameId } = req.params;
        const { featured, coming_soon, discounted } = req.body;
        const shopSpecialsCtrl = new ShopSpecialsController();
        const result = await shopSpecialsCtrl.update(gameId, { "featured": featured, "coming_soon": coming_soon, "discounted": discounted });
        if (result instanceof Error) {
            return res.status(400).json({ message: result.message });
        }
        return res.json(result);
    } catch (err) {
        console.error('Error in /api/shop_specials/:gameId endpoint:', error);
        return res.status(500).json({ error: error.message });
    }
}

module.exports.PUTPirateSitesByGameId = async function (req, res) {
    try {
        const {gameId} = req.params;
        const {link, siteId} = req.body;
        const gamesPirateSitesConnCtrl = new GamesPirateSitesConnectionController();
        const result = await gamesPirateSitesConnCtrl.update(gameId, siteId, link);
        if (result instanceof Error) {
            return res.status(400).json({ message: result.message });
        }
        return res.json(result);
    } catch (err) {
        console.error('Error in /api/pirate_sites/:gameId endpoint:', error);
        return res.status(500).json({ error: error.message });
    }
}

// ====================== ///
// ====================== ///
// ======= DELETE ======= ///
// ====================== ///
// ====================== ///

module.exports.DELETEFriends = async function (req, res) {
    try {
        const { friendShipId } = req.params;

        const friendsCtrl = new FriendsController();
        const result = await friendsCtrl.delete(friendShipId);
        if (result instanceof Error) {
            return res.status(400).json({ message: result.message });
        }
        return res.status(204).json({});
    } catch (err) {
        console.error('Error in /api/friends endpoint:', err);
        return res.status(500).json({ error: err.message }); 
    }
}

module.exports.DELETEPlatformUser = async function (req, res) {
    try {
        const { userId } = req.auth;
        const { id } = req.params;

        const platformUserCtrl = new PlatformUsersController();
        const result = await platformUserCtrl.deleteByNativeUserId(id, userId);
        if (result instanceof Error) {
            return res.status(400).json({ message: result.message });
        }
        if (!result.deleted) {
            return res.status(404).json({ message: 'Platform user not found for authenticated user', ...result, });
        }
        return res.status(200).json(result);
    } catch (err) {
        console.error("Error in /api/platform_user endpoint:", err);
        return res.status(500).json({error: err.message});
    }
}

module.exports.DELETENAtiveUser = async function (req, res) {
    try {
        const { userId } = req.auth;

        const natvieUserCtrl = new NativeUsersController();
        const result = await natvieUserCtrl.delete(userId);
        return res.status(204).json({});
    } catch (err) {
        console.error("Error on /api/native_user endpoint:", err);
        return res.status(500).json({error: err.message});
    }
}