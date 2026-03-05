// sourcery skip: remove-redundant-slice-index
const Controller = require('./Controller');
const PlatformsController = require('./PlatformsController');
const GenresController = require('./GenresController');
const GamesGenresConnectionController = require('./GamesGenresConnectionController');

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
     * @param {Array} data - ["app_id" = int, "platform_id" = platforms.id, "name" = string, "banner_img" = string || null, "description" = string || null, "minimum_requirements" = string || null, "cost" = float]
     * @returns {Array} - ["message": string, "id": int]
     */
    async create(data) {
        await super.create();

        let foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        const query = 'INSERT INTO `games` (app_id, platform_id, name, banner_img, description, minimum_requirements, cost) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const values = [data.app_id, data.platform_id, data.name, data.banner_img ?? "", data.description ?? "", data.minimum_requirements ?? "", data.cost ?? 0.0];
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
     * @param {Array} data - ["app_id" = int, "platform_id" = platforms.id, "name" = string, "banner_img" = string || null, "description" = string || null, "minimum_requirements" = string || null, "cost" = float]
     * @returns {Array} - ["message": string]
     */
    async update(id, data) {
        await super.update();

        let foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        let old = await this.show(id);

        const query = 'UPDATE `games` SET app_id = ?, platform_id = ?, name = ?, banner_img = ?, description = ?, minimum_requirements = ?, cost = ? WHERE id = ?;';
        const values = [
            data.app_id ?? old.app_id, 
            data.platform_id ?? old.platform_id, 
            data.name ?? old.name, 
            data.banner_img ?? old.banner_img,
            data.description ?? old.description, 
            data.minimum_requirements ?? old.minimum_requirements, 
            data.cost ?? old.cost, 
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
     *          "minimum_requirements" = string || null, 
     *          "cost" = float ||null ]
     * @param {Array} genre_ids - [ genre.id, ... ] can be null or could contain genres which already exist.
     * @param {Array} genre_names - [ genre.name, ... ] names for the genres which do not exist yet.
     * @returns {Array} - ["message": string, "id": int]
     */
    async uploadWithAll(data, genre_ids, genre_names) {
        if (data.platform_id == null && data.platform_name == null) {
            return new Error("Can't upload game, no platform id or name given");
        }
        if (data.platform_id == null && data.platform_name != null) {
            const platformsController = new PlatformsController();
            const platform = await platformsController.create({ "name": data.platform_name });
            if(platform instanceof Error) {
                throw platform;
            }
            data.platform_id = platform.id;
        }

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

        const game = await this.create(data);
        data.id = game.id;

        const all_genre_ids = Array.isArray(genre_ids) && genre_ids.length > 0 ? genre_ids : [];
        if (Array.isArray(created_genre_ids) && created_genre_ids.length > 0) {
            for (const new_id of created_genre_ids) {
                console.log(new_id);
                all_genre_ids.push(new_id);
            }
        }
        console.log(all_genre_ids);

        if (all_genre_ids.length > 0) {
            const gamesGenresController = new GamesGenresConnectionController();
            for (const genre_id of all_genre_ids) {
                let conn = await gamesGenresController.create({ "game_id": game.id, "genre_id": genre_id });
                if (conn instanceof Error) {
                    throw conn;
                }
            }
        }
        return game;
    }

    /**
     * Get native game id by the unique platform specific game id.
     * @param {int} app_id 
     * @returns {int|null} - game.id or null if not found
     */
    async getGameIdByAppId(app_id) {
        await this.ready;
        
        const query = `SELECT id FROM ${this.tableName} WHERE app_id = ? LIMIT 1;`;
        try {
            const [rows] = await this.dbConnection.execute(query, [app_id]);
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
    async getWithAllForeign(game_id) {
        await this.ready;

        const query = `SELECT 
                            g.id, 
                            g.app_id, 
                            g.name, 
                            g.banner_img, 
                            g.description, 
                            g.minimum_requirements, 
                            g.cost, 
                            g.platform_id,
                            p.platform_name AS platform  
                    FROM ${this.tableName} AS g
                    JOIN platforms AS p ON g.platform_id = p.id
                    WHERE g.id = ?;`;

        try {
            const [rows] = await this.dbConnection.execute(query, [game_id]);
            return rows[0] ?? null;
        } catch (err) {
            console.error(`Error while getting game by app_id from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async getAllGamesFrom(from) {
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
            const game = await this.getWithAllForeign(game_id);
            if (game) {
                games.push(game);
            } else {
                console.warn(`Game with id ${game_id} not found in table ${this.tableName}`);
            }
        }

        return games;
    }

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