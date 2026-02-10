const Controller = require('./Controller');
const GenresController = require('./GenresController');
const GamesController = require('./GamesController');

class GamesGenresConnnectionController extends Controller {
    constructor() {
        super('games_genres_connections');
    }

    async index() {
        return super.index();
    }

    async show(id) {
        return super.show(id);
    }

    /**
     * @param {Array} data - ["game_id" = games.id, "genre_id" = genres.id ]
     * @returns
     */
    async create(data) {
        super.create();

        var foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        const query = 'INSERT INTO `games_genres_connections` (game_id, genre_id) VALUES (?, ?)';
        var values = [data.game_id, data.genre_id];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `${result.id} Element created in table ${this.tableName}` };
        }
        catch (err) {
            console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * @param {int} id
     * @param {Array} data - ["game_id" = games.id, "genre_id" = genres.id ]
     * @returns
     */
    async update(id, data) {
        super.update();

        var foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        var old = await this.show(id);

        const query = 'UPDATE `games_genres_connections` SET game_id = ?, genre_id = ? WHERE id = ?;';
        var values = [
            data.game_id ?? old.game_id, 
            data.genre_id ?? old.genre_id, 
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

    async getByGameId(gameId) {
        await this.waitForConnection();
        await this.selectDatabase();

        const query = `SELECT gam.id, gen.genre FROM games_genres_connections AS ggc
	                JOIN games AS gam on ggc.game_id = gam.id
                    JOIN genres AS gen ON ggc.genre_id = gen.id
                    WHERE ggc.game_id = ?;`;
        var values = [gameId];
        try {
            const [rows] = await this.dbConnection.execute(query, values);
            return rows;
        } catch (err) {
            console.error(`Error while getting genres for game ${gameId}: ${err}`);
            throw err;
        }
    }

    async #checkForeignKeys(data) {
        const gamesController = new GamesController();
        const genresController = new GenresController();

        if (await gamesController.show(data.game_id) instanceof Error) { 
            return new Error("Invalid game id: " + data.game_id);
        }

        if (await genresController.show(data.genre_id) instanceof Error) {
            return new Error("Invalid genre id: " + data.genre_id);
        }

        return true;
    }
}

module.exports = GamesGenresConnnectionController;