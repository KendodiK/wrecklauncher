const apiHelpers = require('./apiHelpers.js');

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

module.exports.GETGameById = async function (req, res) {
  try {
    const { id: gameId } = req.params;
    const gameCtrl = new GamesController();
    const game = await gameCtrl.show(gameId);
    return res.json(game);
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? String(err) });
  }
};

module.exports.GETGamesByPlatformIdWithAllData = async function (req, res) {
    try {
        const { appId } = req.params;
        const appIdNum = Number(appId);
        if (!Number.isFinite(appIdNum) || appIdNum <= 0) {
            return res.status(400).json({ error: `Invalid appId: ${String(appId)}` });
        }

        const gameCtrl = new GamesController();
        const gameId = await gameCtrl.getGameIdByAppId(appIdNum);
        if (!gameId) {
            return res.status(404).json({ error: `Game not found by appId: ${appIdNum}` });
        }

        const game = await gameCtrl.getWithAllForeign(gameId);
        if (!game) {
            return res.status(404).json({ error: `Game not found: ${gameId}` });
        }

        const gamesGenresCtrl = new GamesGenresConnnectionController();
        const gameGenres = await gamesGenresCtrl.getByGameId(gameId);
        game.genres = gameGenres;

        const gamesPirateSitesConnCtrl = new GamesPirateSitesConnectionController();
        const pirateSites = await gamesPirateSitesConnCtrl.getConnectionsByGameId(gameId);
        game.pirate_sites = pirateSites;

        return res.json(game);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

//--------------- tested -----------------

module.exports.GETGameByIdWithAllData = async function (req, res) {
    try {
    const {id: gameId } = req.params;
    const gameCtrl = new GamesController();
    const game = await gameCtrl.getWithAllForeign(gameId);

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
        const countyCode = req.body.countyCode ?? "de";
        const gameCtrl = new GamesController();
        const games = gameCtrl.getAllGamesByPlatformFrom(countyCode, platformId, from);

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
        const countyCode = req.body.county_code ?? "de";

        const gamesCtrl = new GamesController();
        const games = await gamesCtrl.getAllGamesFrom(countyCode, from);

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
        const friendsRaw = await friendsCtrl.getFriendsByNativeUserId(nativeUserId);

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
        const user = await nativeUserCtrl.show(userId);
        return res.json(user);
    } catch (err) {
        return res.status(500).json({ error: err.message });
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

module.exports.POSTLoginNativeUser = async function (req, res) {
    try {
        const nativeUserCtrl = new NativeUsersController();

        const { username, password } = req.params;
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
}

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
        if (shouldSkipGameBecausePriceMissing(req.body, 'upload', req.body?.name)) {
        return res.status(200).json({ message: 'Skipped upload: non-free game is missing price.' });
        }

        const gamesCtrl = new GamesController();
        const pricesCtrl = new PricesController();

        let { county_code: countyCode, genre_names: genreNames } = req.body;
        let platformName = req.body.platform_name ?? null;
        const platformId = req.body.platform_id ?? null;
        const fallbackBanner = req.body.banner_img ?? null;
        const platformBannerImg = await getPlatformBannerUrl({
            platformName: resolvedPlatformName,
            appId: req.body.app_id,
            fallbackBanner,
        });

        const gameData = {
        app_id: req.body.app_id,
        platform_id: platformId,
        platform_name: platformName,
        name: req.body.name,
        banner_img: platformBannerImg,
        description: req.body.description ?? null,
        minimum_requirements: req.body.minimum_requirements ?? null,
        };


        if ((!Array.isArray(genreNames) || genreNames.length === 0) && String(resolvedPlatformName ?? '').trim().toLowerCase() === 'itch') {
            const itchDetails = await fetchItchGameDetails(req.body.app_id, { includePageDetails: true });
            genreNames = normalizeGenreNames(itchDetails?.genres ?? []);
        }

        const uploadedGame = await gamesCtrl.uploadWithAll(gameData, null, genreNames);

        const countyId = getCountyIdByCode(countyCode);

        const uploadPrice = await pricesCtrl.create({"gameId": uploadedGame.id, "countyId": countyId, "price": price});
        return res.status(201).json({ message: 'Game uploaded successfully', gameId: uploadedGame.id });
    } catch (err) {
        console.error('Error in /api/games/upload endpoint:', err);
        return res.status(500).json({ error: err.message });
    }
}