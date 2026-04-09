// sourcery skip: remove-redundant-slice-index
const Controller = require('./Controller');
const PlatformsController = require('./PlatformsController');
const GenresController = require('./GenresController');
const GamesGenresConnectionController = require('./GamesGenresConnectionController');
const PricesController = require("./PricesController");
const CountriesController = require("./CountiesController");

class GamesController extends Controller {
    constructor() {
        super('games');
    }

    async index() {
        return super.index();
    }

    async show(id) {
        return super.show(id);
    }

    /**
     * @param {Array} data - [
     *  "app_id" = int, 
     *  "platform_id" = platforms.id, 
     *  "name" = string, 
     *  "banner_img" = string || null, 
     *  "description" = string || null, 
    *  "minimum_requirements" = string || null ]
     * @returns {Array} - ["message": string, "id": int]
     */
    async create(data) {
        await super.create();

        let foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        const query = 'INSERT INTO `games` (app_id, platform_id, name, banner_img, description, minimum_requirements) VALUES (?, ?, ?, ?, ?, ?);';
        const values = [
            data.app_id,
            data.platform_id,
            data.name,
            data.banner_img ?? "",
            String(data.description).slice(0, 1000) ?? "",
            data.minimum_requirements ?? "",
        ];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `${result.insertId} Element created in table ${this.tableName}`, id: result.insertId };
        } catch (err) {
            console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * @param {int} id
    * @param {Array} data - ["app_id" = int, "platform_id" = platforms.id, "name" = string, "banner_img" = string || null, "description" = string || null, "minimum_requirements" = string || null]
     * @returns {Array} - ["message": string]
     */
    async update(id, data) {
        await super.update();

        const incomingPlatformId = data.platform_id ?? data.plafrom_id ?? null;
        if (incomingPlatformId != null) {
            let foreignKeyCheck = await this.#checkForeignKeys({ platform_id: incomingPlatformId });
            if (foreignKeyCheck instanceof Error) {
                throw foreignKeyCheck;
            }
        }

        let old = await this.show(id);

        const query = 'UPDATE `games` SET app_id = ?, platform_id = ?, name = ?, banner_img = ?, description = ?, minimum_requirements = ? WHERE id = ?;';
        const values = [
            data.app_id ?? old.app_id, 
            incomingPlatformId ?? old.platform_id,
            data.name ?? old.name, 
            data.banner_img ?? old.banner_img,
            data.description ?? old.description, 
            data.minimum_requirements ?? old.minimum_requirements, 
            id ];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `Updated successfully in table ${this.tableName}`, id: result.id };
        } catch (err) {
            console.error(`Error while updating element in table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async delete(id) {
        return super.delete(id);
    }

    /**
     * Upload games with all related data.
     * If "platform_id" is null it needs to get a "platform_name" to create a new platform.
     * @param {Array} data - [
     *          "app_id" = int, 
     *          "platform_id" = platform.id || null, 
     *          "platform_name" = string || null, 
     *          "name" = string, 
     *          "banner_img" = string || null, 
     *          "description" = string || null, 
     *          "minimum_requirements" = string || null, ]
     * @param {Array} genre_ids - [ genre.id, ... ] can be null or could contain genres which already exist.
     * @param {Array} genre_names - [ genre.name, ... ] names for the genres which do not exist yet.
     * @param {Array} price_data - ["price" = int, "country_id" = string]
     * @returns {Array} - ["message": string, "id": int]
     */
    async uploadWithAll(data, genre_ids, genre_names, price_data) {
        let platfromId = data.platform_id ?? data.plafrom_id ?? null;
        let platformName = data.platform_name ?? null;
        const appId = data.app_id;

        if ( !platfromId && !platformName ) {
            return new Error("Can't upload game, no platform id or name given");
        }

        if ( !platfromId && platformName ) {
            const platformsController = new PlatformsController();
            const platform = await platformsController.create({ "name": data.platform_name });
            if(platform instanceof Error) {
                throw platform;
            }
            platfromId = platform.id;
        }

        data.platform_id = platfromId;
        data.plafrom_id = platfromId;

        const exists = await this.getGameIdByAppIdAndPlatform(appId, platfromId)
        if ( exists ) {
            await this.#upsertPricesForGame(exists, price_data);
            // return the existing game row (so callers can access `.id`)
            return await this.show(exists);
        }

        const game = await this.create(data);
        const gameId = game.id;

        //--- adding genres ---
        let created_genre_ids = [];
        if (genre_names != null && Array.isArray(genre_names) && genre_names.length > 0) {
            const genresController = new GenresController();
            for (const genre_name of genre_names) {
                const genre = await genresController.create({ "genre": genre_name });
                if (genre instanceof Error) {
                    throw genre;
                }
                created_genre_ids.push(genre.id);
            }
        }

        const all_genre_ids = Array.isArray(genre_ids) && genre_ids.length > 0 ? genre_ids : [];
        if (Array.isArray(created_genre_ids) && created_genre_ids.length > 0) {
            for (const new_id of created_genre_ids) {
                all_genre_ids.push(new_id);
            }
        }

        if (all_genre_ids.length > 0) {
            const gamesGenresController = new GamesGenresConnectionController();
            for (const genre_id of all_genre_ids) {
                let conn = await gamesGenresController.create({ "game_id": gameId, "genre_id": genre_id });
                if (conn instanceof Error) {
                    throw conn;
                }
            }
        }

        await this.#upsertPricesForGame(gameId, price_data);
        
        return game;
    }

    /**
     * Normalize incoming prices to integer cents.
     * Accepts either major currency unit numbers (12.34) or already-cents values (1234).
     * @param {unknown} value
     * @returns {number|null}
     */
    #toPriceCents(value) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return null;
        }

        // If callers already provide integer cents, keep as-is.
        if (Number.isInteger(numeric) && Math.abs(numeric) >= 1000) {
            return Math.trunc(numeric);
        }

        return Math.round(numeric * 100);
    }

    /**
     * Upsert one or more country-scoped price rows for a game.
     * @param {number} gameId
     * @param {Array|Object|null|undefined} price_data
     * @returns {Promise<void>}
     */
    async #upsertPricesForGame(gameId, price_data) {
        if (price_data == null) {
            return;
        }

        const pricesCtrl = new PricesController();
        const entries = Array.isArray(price_data) ? price_data : [price_data];
        for (const entry of entries) {
            if (!entry || typeof entry !== 'object') {
                continue;
            }

            const countyId = entry.countyId ?? entry.county_id ?? entry.country_id ?? entry.countryId ?? null;
            const priceVal = entry.price ?? entry.cost ?? null;
            if (countyId == null || priceVal == null) {
                continue;
            }

            const priceCents = this.#toPriceCents(priceVal);
            if (!Number.isFinite(priceCents)) {
                throw new Error(`Invalid price value: ${priceVal}`);
            }

            const lookupQuery = 'SELECT id FROM prices WHERE game_id = ? AND county_id = ? LIMIT 1;';
            const [rows] = await this.dbConnection.execute(lookupQuery, [gameId, countyId]);
            const existingPriceId = Array.isArray(rows) && rows[0] ? rows[0].id : null;

            if (existingPriceId != null) {
                await pricesCtrl.update(existingPriceId, {
                    gameId,
                    countyId,
                    price: priceCents,
                });
            } else {
                await pricesCtrl.create({
                    gameId,
                    countyId,
                    price: priceCents,
                });
            }
        }
    }

    /**
     * Get native game id by the unique platform specific game id.
     * @param {int} app_id 
     * @param {int} platform_id
     * @returns {int|null} - game.id or null if not found
     */
    async getGameIdByAppId(app_id, platform_id) {
        await this.ready;
        
        const query = `SELECT id FROM ${this.tableName} WHERE app_id = ? AND platform_id = ? LIMIT 1;`;
        try {
            const [rows] = await this.dbConnection.execute(query, [app_id, platform_id]);
            if (!rows || rows.length === 0 || rows[0]?.id == null) {
                return null;
            }
            return rows[0].id;
        } catch (err) {
            console.error(`Error while fetching game id by app_id from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * Get native game id by (platform_id, app_id).
     * @param {int} app_id
     * @param {int} platform_id
     * @returns {int|null} - game.id or null if not found
     */
    async getGameIdByAppIdAndPlatform(app_id, platform_id) {
        await this.ready;

        const query = `SELECT id FROM ${this.tableName} WHERE app_id = ? AND platform_id = ? LIMIT 1;`;
        try {
            const [rows] = await this.dbConnection.execute(query, [app_id, platform_id]);
            if (!rows || rows.length === 0 || rows[0]?.id == null) {
                return null;
            }
            return rows[0].id;
        } catch (err) {
            console.error(`Error while fetching game id by (app_id, platform_id) from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * 
     * @param {int} game_id - not app_id !
     * @returns {Array} - data of the given game:
     * [
     *   games.id,
     *   games.app_id,
     *   games.name,
     *   games.banner_img,
     *   games.description,
     *   games.minimum_requirements,
     *   games.const,
     *   platforms.platform_name
     *  ]
     */
    async getWithAllForeign(gameId, countryCode = "de") {
        await this.ready;

        try {
            let cc = countryCode == null ? "DE" : String(countryCode).trim().toUpperCase();
            const query =  `SELECT 
                                g.id,
                                g.app_id,
                                g.name,
                                g.banner_img,
                                g.description,
                                g.minimum_requirements,
                                ROUND(pr.price / 100, 2) AS cost,
                                g.platform_id,
                                p.platform_name AS platform,
                                pr.price,
                                c.currency,
                                c.code AS country_code
                            FROM games AS g
                            JOIN platforms AS p ON g.platform_id = p.id
                            LEFT JOIN counties AS c ON UPPER(c.code) = ?
                            LEFT JOIN prices AS pr ON pr.game_id = g.id AND pr.county_id = c.id
                            WHERE g.id = ?
                            LIMIT 1;`;

            const [rows] = await this.dbConnection.execute(query, [cc, gameId]);
            let game = rows[0];
            if (!game) {
                return null;
            }
            let formatedPrice = null;
            if (game.price != null) {
                formatedPrice = `${(game.price / 100).toFixed(2)} ${game.currency ?? ''}` 
            };
            game.formated_price = formatedPrice;
            return game;
        } catch (err) {
            console.error(`Error while getting game by app_id from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * Get all games with all related data, starting from an offset.
     * @param {stirng} countyCode - the code of the county where we want to get the price, if null its "de" (germany)
     * @param {int} from - offset for pagination
     * @returns {Array} - list of games with all related data
     */
    async getAllGamesFrom(countyCode, from) {
        await this.ready;

        const query = `SELECT id FROM ${this.tableName} ORDER BY id LIMIT 20 OFFSET ?;`;
        let game_ids = [];
        
        try {
            const [rows] = await this.dbConnection.execute(query, [from]);
            for (const row of rows) {
                game_ids.push(row.id);
            }
        } catch (err) {
            console.error(`Error while fetching game ids from table ${this.tableName}: ${err}`);
            throw err;
        }

        let games = [];
        for (const game_id of game_ids) {
            const game = await this.getWithAllForeign(game_id, countyCode);
            if (game && !(game instanceof Error)) {
                games.push(game);
            } else {
                console.warn(`Game with id ${game_id} not found in table ${this.tableName}`);
            }
        }

        return games;
    }

    async search (needle) {
        await this.ready;

        let game_ids = [];
        try {
            const query = `SELECT id FROM ${this.tableName} WHERE name LIKE ?;`;
            const like = `%${needle}%`;
            const [rows] = await this.dbConnection.execute(query, [like]);
            for (const row of rows) {
                if (row && row.id != null) {
                    game_ids.push(row.id);
                }
            }
        } catch (err) {
            console.error(`Error while fetching game ids from table ${this.tableName}: ${err}`);
            throw err;
        }

        let games = [];
        for (const game_id of game_ids) {
            const game = await this.getWithAllForeign(game_id);
            if (game && !(game instanceof Error)) {
                games.push(game);
            } else {
                console.warn(`Game with id ${game_id} not found in table ${this.tableName}`);
            }
        }

        return games;
    }

    async getAllGamesByPlatformFrom(countyCode, platform_id, from) {
        await this.ready;

        let game_ids = [];
        try {
            const query = 'SELECT id FROM games WHERE platform_id = ? ORDER BY id LIMIT 20 OFFSET ?;';

            const [rows] = await this.dbConnection.execute(query, [platform_id, from]);
            for (const row of rows) {
                game_ids.push(row.id);
            }
        } catch (err) { 
            console.error(`Error while fetching game ids by platform_id from table ${this.tableName}: ${err}`);
            throw err;
        }

        let games = [];
        for (const game_id of game_ids) {
            const game = await this.getWithAllForeign(game_id, countyCode);
            if (game && !(game instanceof Error)) {
                games.push(game);
            } else {
                console.warn(`Game with id ${game_id} not found in table ${this.tableName}`);
            }
        }
        return games;
    }

    /**
     * Check if the foreign keys (platform_id) are valid.
     * @param {Object} data - The data to validate.
     * @returns {Promise<boolean|Error>} - True if valid, Error otherwise.
     */
    async #checkForeignKeys(data) {
        await this.ready;

        try {
            const [rows] = await this.dbConnection.execute('SELECT id FROM platforms WHERE id = ?', [data.platform_id]);
            if (!rows || rows.length === 0) {
                return new Error("Invalid platform id: " + data.platform_id);
            }
        } catch (err) {
            console.error(`Error while checking platform id ${data.platform_id}: ${err}`);
            throw err;
        }

        return true;
    }
}

module.exports = GamesController;