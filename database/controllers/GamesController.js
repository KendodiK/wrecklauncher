const Controller = require('./Controller');
const PlatformsController = require('./PlatformsController');
const GenresController = require('./GenresController');
const GamesGenresController = require('./GamesGenresController');

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
        super.create();

        var foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        const query = 'INSERT INTO `pirate_sites` (app_id, platform_id, name, banner_img, description, minimum_requirements, cost) VALUES (?, ?, ?, ?, ?, ?, ?)';
        const values = [data.app_id, data.platform_id, data.name, data.banner_img ?? "", data.description ?? "", data.minimum_requirements ?? "", data.cost ?? 0.0];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `${result.id} Element created in table ${this.tableName}`, id: result.id };
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
        super.update();

        var foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        var old = await this.show(id);

        const query = 'UPDATE `pirate_sites` SET app_id = ?, platform_id = ?, name = ?, banner_img = ?, description = ?, minimum_requirements = ?, cost = ? WHERE id = ?;';
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
            return { message: `${id} Updated successfully in table ${this.tableName}` };
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
     *          "cost" = float ]
     * @param {Array} genre_ids - [ genre.id, ... ] can be null or could contain genres which already exist.
     * @param {Array} genre_names - [ genre.name, ... ] names for the genres which do not exist yet.
     * @returns {Array} - ["message": string, "id": int]
     */
    async uploadWithAll(data, genre_ids = null, genre_names = null) {
        if (data.platform_id == null && data.platform_name != null) {
            const platformsController = new PlatformsController();
            const platform = await platformsController.create({ "name": data.platform_name });
            data.platform_id = platform.id;
        }
        if (genre_names != null) {
            const genresController = new GenresController();
            created_genre_ids = [];
            for (const genre_name of data.genre_names) {
                const genre = await genresController.create({ "genre": genre_name });
                created_genre_ids.push(genre.id);
            }
            genre_ids.push.apply(genre_ids, created_genre_ids);
        }
        const game = await this.create(data);
        data.id = game.id;

        const gamesGenresController = new GamesGenresController();
        for (const genre_id of data.genre_ids) {
            await gamesGenresController.create({ "game_id": data.id, "genre_id": genre_id });
        }
    }

    async #checkForeignKeys(data) {
        const platformsController = new PlatformsController();

        if (await platformsController.show(data.platform_id) instanceof Error) { 
            return new Error("Invalid platform id: " + data.platform_id);
        }

        return true;
    }
}

module.exports = GamesController;