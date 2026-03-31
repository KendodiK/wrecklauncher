const apiHelpers = require('./apiHelpers.js');
/**
 * @typedef {import('./apiDoc').Game} Game
 */
const { env } = require('process');

const steamApiKey = process.env.STEAM_API_KEY;

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
const ShopSpecialsMaker = require('../database/makers/ShopSpecialsTableMaker.js');
const { error } = require('console');
const shopSpecials = require('./fetchShopSpecials.js');
//#endregion

module.exports.fetchInitialShopSpecialsData = async function() {
  try {    
    const games = await shopSpecials.getShopSpecials();
    try{
        const shopSpecialsMaker = new ShopSpecialsMaker();
        await shopSpecialsMaker.delete();
        await shopSpecialsMaker.create();         
    }catch (err) {
        console.error('Error resetting shop_specials table:', err);
        return;
    }
    console.log('Uploading shop specials data...');
    for (const game of games) {
        const fakeRes = {
          status(code) { this.statusCode = code; return this; },
          json(data) { this._data = data; return this; },
          send(data) { this._data = data; return this; }
        };
      try {
        const platformName = apiHelpers.normalizePlatformName(game.shop);
        try {
            if (!platformName) {
                console.log('Skipping upload: unable to determine platform for game', { name: game.name ?? game.title, shop: game.shop, platform: game.platform, platform_name: game.platform_name });
                continue;
            }

            // Resolve platform via controller directly to avoid using HTTP-like helpers
            const platformsCtrl = new PlatformsController();
            let platformRow = null;
            try {
                platformRow = await platformsCtrl.getByPlatformName(platformName);
            } catch (err) {
                console.warn('Platform lookup failed:', { platformName, err: err?.message });
            }

            let platform_id = platformRow?.id ?? null;
            if (!platform_id) {
                try {
                    const created = await platformsCtrl.create({ name: platformName });
                    platform_id = created?.id ?? null;
                } catch (err) {
                    console.warn('Platform creation failed:', { platformName, err: err?.message });
                }
            }

            if (!platform_id) {
                console.log('Skipping upload: unable to find or create platform for game', { name: game.name ?? game.title, shop: game.shop, platform: game.platform, platform_name: game.platform_name });
                continue;
            }
        } catch (err) {
            console.error('Error ensuring platform exists:', err);
            console.log('Skipping upload for game due to platform issues', { name: game.name ?? game.title, shop: game.shop, platform: game.platform, platform_name: game.platform_name });
            continue;
        }
        const payload = {
          app_id: game.appId ?? game.app_id ?? null,
          name: game.name ?? game.title ?? null,
          description: game.description ?? null,
          banner_img: game.headerImageUrl ?? game.banner_img ?? null,
          minimum_requirements: game.minimum_requirements ?? null,
          platform_name: platformName,
          country_code: game.countryCode ?? game.country_code ?? 'DE',
          // POSTNewGame expects `cost` in this codepath (it maps cost -> price internally)
          cost: Number(game.price ?? game.min_price ?? -1),
          genre_names: Array.isArray(game.genres) ? game.genres : (game.genre_names ?? []),
        };

        // Basic sanity: require app_id and name before calling the upload handler
        if (payload.app_id == null || payload.name == null) {
          console.log('Skipping upload: missing id or name', { app: payload.app_id, name: payload.name });
          continue;
        }



        const uploadResp = await this.POSTNewGame({ body: payload }, fakeRes);
        const resp = fakeRes._data ?? {};
        const uploadedId = uploadResp.gameId ?? resp.gameId ?? resp.id ?? null;
        //upload to shopspecials table
        if (uploadedId) {
          try {
            const shopSpecialsPayload = {
              gameId: uploadedId,
              featured: game.popularityScore ?? 0,
              coming_soon: game.upcoming ?? 0,
              discount_percent: game.discount ?? 0,
              country_code: payload.country_code
            };
            const shopSpecialsResp = await this.POSTNewShopSpecials({ body: shopSpecialsPayload, params: shopSpecialsPayload }, fakeRes);
          }
          catch (err) {            
            console.error('Error uploading shop special for game:', err);
          }
        }    
        else{
            console.warn(`Upload failed for game ${payload.name} (app_id: ${payload.app_id}). Response:`, { uploadedId,uploadResp, resp });
        }          
      } catch (err) {
        console.error('Error uploading game data:', err);
      }
    }
    console.log('Fetched shop specials:', games.length, 'games');
  } catch (err) {
    console.error('Error fetching initial shop specials data:', err);
  }
}



// ============================================================================= ///
// ================================== GET ===================================== ///
// =========================================================================== ///
//#region GET

module.exports.GETItchGames = async function (req, res) {
    try {
        const { appId } = req.params;
        const numericAppId = Number(appId);
        if (!Number.isFinite(numericAppId) || numericAppId <= 0) {
          return res.status(400).json({ error: 'Invalid appId' });
        }
    
        const includeRaw = String(req.query?.raw ?? '').trim().toLowerCase() === 'true';
        const ensureUpload = req.query?.ensureUpload == null
          ? true
          : apiHelpers.isTruthyFlag(req.query?.ensureUpload);
        const details = await apiHelpers.fetchItchGameDetails(numericAppId, { includeRaw, includePageDetails: true });
        if (!details) {
          return res.status(404).json({ error: 'Itch game not found or ITCH_API_KEY missing' });
        }
    
        let upload = null;
        if (ensureUpload) {
          try {
            upload = await apiHelpers.ensureScrapedGameUploaded({
              appId: numericAppId,
              platformName: 'itch',
              name: details.title,
              bannerImg: details.cover_url,
              description: details.description ?? details.short_text,
              cost: details.min_price,
              genreNames: details.genres,
            });
          } catch (uploadErr) {
            upload = { uploaded: false, gameId: null, reason: 'upload-error', error: uploadErr?.message || String(uploadErr) };
          }
        }
    
        const result = {
          ...details,
          description: details.description ?? details.short_text ?? null,
          description_source: details.description && details.description !== details.short_text ? 'page' : (details.short_text ? 'short_text' : null),
          upload,
        };
    
        return res.json(result);
    } catch (err) {
    return res.status(500).json({ error: err.message });
    }
}

module.exports.GETSteamProfileId = async function (req, res) {
    try {
        const { vanityurl } = req.params;
        const response = await fetch(
          `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${steamApiKey}&vanityurl=${encodeURIComponent(vanityurl)}`
        );
        if (!response.ok) {
          return res.status(502).json({ error: 'Steam API error' });
        }
        const data = await response.json();
        if (data?.response?.success !== 1) {
          return res.status(404).json({ error: 'Vanity URL not found' });
        }
        return res.json({ steamid: data.response.steamid });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

module.exports.GETOwnedGamesSteam = async function (req, res) {
    try {
        const platformUserCtrl = new PlatformUsersController();
        const platformCtrl = new PlatformsController();

        const { userId } = req.auth;
        const platformUsers = await platformUserCtrl.getByNativeUserId(userId);
        const steamPlatform = await platformCtrl.getByPlatformName('steam');
        if (!steamPlatform) {
          return res.status(400).json(steamPlatform.error ?? { error: 'Steam platform not found in database' });
        }
        let ownedGames = [];
        for (const platformUser of platformUsers) {
          if (Number(platformUser.platform_id) === Number(steamPlatform.id)) {
            const steamApiUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${steamApiKey}&steamid=${platformUser.platform_profile_id}&format=json`;
            const response = await fetch(steamApiUrl);
            if (!response.ok) {
              console.error('Error fetching Steam API:', response.statusText);
              return res.status(500).json({ error: 'Failed to fetch data from Steam API' });
            }
            const data = await response.json();
            ownedGames.push(...data.response.games);
          }
        }
        if (ownedGames.length === 0) {
          return res.status(400).json({ error: 'No owned games found for this user on Steam' });
        }
        const seen = new Set();
        const uniqueOwnedGames = ownedGames.filter(g => {
        const id = g.appid ?? g.app_id;
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
        });
        return res.json({ ownedGames: uniqueOwnedGames });
    } catch (error) {
        console.error('Error in /steam/api/getOwnedGames endpoint:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}

/**
 * GET /game/:id
 * 
 * @route GET /game/:id
 * @param {Object} req
 * @param {Object} req.params
 * @param {number} req.params.id
 * @param {Object} res
 * 
 * @returns {Game}
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

module.exports.GETGamesByPlatformIdWithAllData = async function (req, res) {
    try {
        const { platformId, appId } = req.params;
        const { country_code: countryCode } = req.body;
        const appIdNum = Number(appId);
        if (!Number.isFinite(appIdNum) || appIdNum <= 0) {
            return res.status(400).json({ error: `Invalid appId: ${String(appId)}` });
        }

        const gameCtrl = new GamesController();
        const gameId = await gameCtrl.getGameIdByAppId(appIdNum, platformId);
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
//#endregion

// ============================================================================= ///
// ================================= POST ===================================== ///
// =========================================================================== ///
//#region POST

module.exports.POSTNewNativeUser = async function (req, res) {
    try {
        const nativeUserCtrl = new NativeUsersController();
        const { username, password, email } = req.body;
        const missing = [];
        if (username == null) {missing.push("username")}
        if (password == null) {missing.push("password")}
        if (email == null) {missing.push("email")}
        if (missing.length) {
            return res.status(400).json({ message: 'Missing required fields', missing });
        }

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
        const gamesCtrl = new GamesController();
        const platformCtrl = new PlatformsController();
        const {
            app_id: appId,
            name,
            description,
            banner_img: bannerImg,
            minimum_requirements: minRequirements,
            platform_name: platformName,
            platform_id: platformId,
            country_code: countryCode,
            cost: price,
            genre_names: genreNames
        } = req.body;
        let missing = [];
        if(appId == null) {missing.push("app_id")}
        if(name == null) {missing.push("name")}
        if(price == null) {missing.push("price")}
        if(countryCode == null) {missing.push("country_code")}
        if (missing.length) {
            return res.status(400).json({ message: 'Missing required fields', missing });
        }
        // Resolve platform name: prefer provided platform_name, otherwise try to look up by platform_id
        let resolvedPlatformName = platformName ?? null;
        if (!resolvedPlatformName && platformId != null) {
            const platformRow = await platformCtrl.show(platformId).catch(() => null);
            resolvedPlatformName = platformRow?.platform_name ?? null;
        }
        if (!resolvedPlatformName) {
            return res.status(400).json({ error: 'Could not upload: no platform name given and platform_id did not resolve to an existing platform' });
        }

        // Resolve platform id: prefer provided platform_id, otherwise try to find by name or create it
        let resolvedPlatformId = platformId ?? null;
        if (!resolvedPlatformId) {
            let platformRow = await platformCtrl.getByPlatformName(resolvedPlatformName).catch(() => null);
            if (platformRow && platformRow.id) {
                resolvedPlatformId = platformRow.id;
            } else {
                const created = await platformCtrl.create({ name: resolvedPlatformName }).catch(() => null);
                resolvedPlatformId = created?.id ?? null;
            }
        }

        if (!Number.isFinite(Number(resolvedPlatformId)) || Number(resolvedPlatformId) <= 0) {
            return res.status(400).json({ error: 'Could not resolve platform id for given platform name' });
        }

        const gameData = {
            "app_id": appId,
            // provide both spellings so uploadWithAll and create() receive the id
            "platform_id": resolvedPlatformId,
            "plafrom_id": resolvedPlatformId,
            "platform_name": resolvedPlatformName,
            "name": name,
            "banner_img": bannerImg,
            "description": description,
            "minimum_requirements": minRequirements,
        };


        if ((!Array.isArray(genreNames) || genreNames.length === 0) && String(resolvedPlatformName ?? '').trim().toLowerCase() === 'itch') {
            const itchDetails = await apiHelpers.fetchItchGameDetails(req.body.app_id, { includePageDetails: true });
            genreNames = apiHelpers.normalizeGenreNames(itchDetails?.genres ?? []);
        }
        const countyId = await apiHelpers.getCountryIdByCode(countryCode);
        
        const uploadedGame = await gamesCtrl.uploadWithAll(gameData, null, genreNames, {"price": price, "country_id": countyId});
        return res.status(201).json({ message: 'Game uploaded successfully', gameId: uploadedGame.id });
    } catch (err) {
        console.error('Error in /api/games/upload endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
}

module.exports.POSTNewPrice = async function (req, res) {
    try {
        const pricesCtrl = new PricesController();
        const { price, country_code: countryCode, game_id: gameId } = req.body;
        let missing = [];
        if (price == null) {missing.push("price")}
        if (countryCode == null) {missing.push("country_code")}
        if (gameId == null) {missing.push("game_id")}
        if (missing.length) {
            return res.status(400).json({ message: 'Missing required fields', missing });
        }

        const countyId = await apiHelpers.getCountryIdByCode(countryCode);

        const data = {
            "gameId": gameId,
            "countryId": countyId,
            "price": price
        };
        const uploadPrice = await pricesCtrl.create(data);
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
        const gamesPirateSitesConnCtrl = new GamesPirateSitesConnectionController();
        const {gameId} = req.params;
        const {link, site_id: siteId, site_name: siteName} = req.body;
        let missing = [];
        if ( siteId == null && siteName == null ) {missing = ["site_id", "site_name"]}
        if ( link == null ) {missing.push("link")}
        if (missing.length) {
            return res.status(400).json({ message: 'Missing required fields', missing });
        }
        const data = {
            "game_id": gameId,
            "pirate_site_id": siteId ?? null,
            "site_name": siteName ?? null,
            "link": link,
        }

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
        const friendsCtrl = new FriendsController();
        const { userId } = req.auth;
        const { friend_user_id: friendUserId } = req.body;
        if( friendUserId == null ) {
            return res.status(400).json({ message: 'Missing required fields', missing: ['friend_user_id'] });
        }

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
        const platformCtrl = new PlatformsController();
        const { platform_name: platformName } = req.body;
        if( platformName == null ) {
            return res.status(400).json({ message: 'Missing required fields', missing: ['plaform_name'] });
        }

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
        const platformUserCtrl = new PlatformUsersController();
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
        if (missing.length) {
            return res.status(400).json({ message: 'Missing required fields', missing });
        }

        const data = {
            "native_user_id": userId,
            "platform_user_name": platformUserName,
            "platform_id": platformId,
            "platform_profile_id": platfProfId,
            "oauth_token": oauthToken ?? null,
        }

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
        if( code == null ) {
            return res.status(400).json({ message: 'Missing required fields', missing: ['code'] });
        }
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

module.exports.POSTNewShopSpecials = async function (req, res) {
    try {
        const { gameId } = req.params;
        const { featured, coming_soon: comingSoon, discount_percent: discountPercent } = req.body;
        let missing = [];
        if(featured == null && comingSoon == null && discountPercent == null) { missing = ["featured", "coming_soon", "discount_percent"] }
        if (missing.length) {
            return res.status(400).json({ message: 'Missing required fields', missing });
        }
        const data = {
            "game_id": gameId,
            "featured": featured,
            "coming_soon": comingSoon,
            "discount_percent": discountPercent
        }
        
        const shopSpecialsCtrl = new ShopSpecialsController();
        await shopSpecialsCtrl.create(data);
        return res.status(201).json({ message: "new shop special created succesfully", id: gameId })
    } catch (err) {
        console.log('Error in /api/shop-specials endpoint:', err);
        return res.status(500).json({ error: err });
    }
}
//#endregion

// ============================================================================= ///
// ================================== PUT ===================================== ///
// =========================================================================== ///
//#region PUT

module.exports.PUTNativeUserProfileInfo = async function (req, res) {
    try {
        const nativeUserCtrl = new NativeUsersController();
        const { userId } = req.auth;
        const { name, email, bio, pfp } = req.body;

        const data = {
            "token": 'new',
            "name": name ?? null,
            "email": email ?? null,
            "bio": bio ?? null,
            "pfp": pfp ?? null
        }
        const result = nativeUserCtrl.update(data);
        if (result instanceof Error) {
            return res.status(400).json({ error: result });
        }
        return res.json(202).json(result);
    } catch (err) {
        console.error('Error in /api/native-users endpoint:', err)
        return res.status(500).json({ error: err.message });
    }
}

module.exports.PUTNativeUserLogin = async function (req, res) {
    try {
        const nativeUserCtrl = new NativeUsersController();
        const { userId } = req.auth;
        const data = {
            "token": "new",
        }
        const updatedUser = await nativeUserCtrl.update(userId, data);
        if (updatedUser instanceof Error) {
            return res.status(400).json({ error: updatedUser.message });
        }
        return res.json(updatedUser);
    } catch (err) {
        console.error('Error in /api/nativeUser/:id endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
}

module.exports.PUTGames = async function (req, res) {
    try {
        const gamesCtrl = new GamesController();
        const { gameId } = req.params;
        const {
            app_id: appId,
            platform_id: platformId,
            name,
            banner_img: bannerImg,
            description,
            minimum_requirements: minimumRequirements
        } = req.body;
        const gameData = {
            "app_id": appId,
            "platform_id": platformId,
            "name": name,
            "banner_img": bannerImg,
            "description": description,
            "minimum_requirements": minimumRequirements,
        }

        const updatedGame = gamesCtrl.update(gameId, gameData);
        if (updatedGame instanceof Error) {
            return res.status(400).json({ message: updatedGame.message });
        }
        return res.json(updatedGame);
    } catch (err) {
        console.error('Error in /api/games/:id endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
}

module.exports.PUTShopSpecialsByGameId = async function (req, res) {
    try {
        const shopSpecialsCtrl = new ShopSpecialsController();
        const { gameId } = req.params;
        const { featured, coming_soon: comingSoon, discount_percent: discountPercent } = req.body;

        const data = {
            "game_id": gameId,
            "featured": featured,
            "coming_soon": comingSoon,
            "discount_percent": discountPercent
        }

        const result = await shopSpecialsCtrl.update(data);
        if (result instanceof Error) {
            return res.status(400).json({ message: result.message });
        }
        return res.json(result);
    } catch (err) {
        console.error('Error in /api/shop_specials/:gameId endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
}

module.exports.PUTPirateSitesByGameId = async function (req, res) {
    try {
        const gamesPirateSitesConnCtrl = new GamesPirateSitesConnectionController();
        const { gameId, siteId } = req.params;
        const { link } = req.body;
        let missing = [];
        if ( link == null ) missing.push("link");
        if (missing.length) {
            return res.status(400).json({ message: 'Missing required fields:', missing });
        }

        const data = {
            "game_id": gameId,
            "site_id": siteId,
            "link": link
        }
        const result = await gamesPirateSitesConnCtrl.update(data);
        if (result instanceof Error) {
            return res.status(400).json({ message: result.message });
        }
        return res.json(result);
    } catch (err) {
        console.error('Error in /api/pirate_sites/:siteId/game/:gameId endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
}
//#endregion

// ============================================================================= ///
// ================================ DELETE ==================================== ///
// =========================================================================== ///
//#region DELETE

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
        const { platfromUserId: id } = req.params;

        const platformUserCtrl = new PlatformUsersController();
        const result = await platformUserCtrl.delete(id);
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
//#region 