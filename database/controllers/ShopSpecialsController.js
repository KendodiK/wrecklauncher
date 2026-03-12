const Controller = require('./Controller');
const GamesController = require('./GamesController');

class ShopSpecialsController extends Controller {
    constructor() {
        super('shop_specials');
    }

    async index() {
        return super.index();
    }

    async show(game_id) {
        await this.ready;

        const query = `SELECT * FROM ${this.tableName} WHERE game_id = ?;`;
        try {
            const [rows] = await this.dbConnection.execute(query, [game_id]);
            return rows[0];
        } catch (err) {
            console.error(`Error while selecting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * 
     * @param {Array} data - {"game_id": int, "featured": boolean, "coming_soon": boolean, "discounted": boolean}
     * @returns {Array} message: string, id: int
     */
    async create(data) {
        await super.create();

        // ensure the referenced game exists
        const isThereForeignKey = await this.#checkForeignKeys(data.game_id);
        if (isThereForeignKey != true) {
            throw isThereForeignKey;
        }

        // avoid inserting a row that already exists for this game_id
        try {
            const [existing] = await this.dbConnection.execute('SELECT game_id FROM shop_specials WHERE game_id = ?', [data.game_id]);
            if (existing && existing.length > 0) {
                this.update(existing[0].id, data);
                return { message: `shop_specials entry already exists for game_id ${data.game_id}, it is updated`, id: existing[0].id };
            }
        } catch (err) {
            console.error(`Error while checking existing shop_specials for game_id ${data.game_id}: ${err}`);
            throw err;
        }

        const query = 'INSERT INTO shop_specials (game_id, featured, coming_soon, discounted) VALUES (?, ?, ?, ?);';
        const values = [data.game_id, data.featured ?? false, data.coming_soon ?? false, data.discounted ?? false];

        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `Element created in table ${this.tableName}`, id: result.insertId };
        } catch (err) {
            console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * 
     * @param {int} game_id 
     * @param {Array} data - {"game_id": int, "featured": boolean, "coming_soon": boolean, "discounted": boolean}
     * @returns 
     */
    async update(game_id, data) {
        await super.update(); 
    
        let old = await this.show(game_id);

        const query = 'UPDATE shop_specials SET featured = ?, coming_soon = ?, discounted = ? WHERE game_id = ?;';
        const values = [data.featured ?? old.featured, data.coming_soon ?? old.coming_soon, data.discounted ?? old.discounted, game_id];

        if (!values[0] && !values[1] && !values[2]) {
            await this.delete(game_id);
            return { message: `All flags are false, entry with game_id ${game_id} deleted from table ${this.tableName}` };
        }

        try {
            await this.dbConnection.execute(query, values);
            return { message: `Entry with game_id ${game_id} updated successfully in table ${this.tableName}` };
        } catch (err) {
            console.error(`Error while updating element in table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async delete(game_id) {
        await this.ready;

        const query = `DELETE FROM ${this.tableName} WHERE game_id = ?;`;
        try {
            await this.dbConnection.execute(query, [game_id]);
            return { message: `${game_id} deleted successfully from ${this.tableName}` };
        } catch (err) {
            console.error(`Error while deleting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async getFilteredGamesFrom(filter, from) {
        await this.ready;

        let column;
        switch (filter) {
            case 'featured':
                column = 'featured';
                break;
            case 'coming_soon':
                column = 'coming_soon';
                break;
            case 'discounted':
                column = 'discounted';
                break;
            default:
                throw new Error(`Invalid filter: ${filter}`);
        }

        let query = `SELECT * FROM shop_specials WHERE ${column} = true ORDER BY game_id LIMIT ?`;
        const params = [20];
        if (from > 0) {
            query += ' OFFSET ?';
            params.push(from);
        }

        const ids = [];
        try {
            const [rows] = await this.dbConnection.execute(query, params);
            for (const row of rows) {
                ids.push(row.game_id);
            }
        } catch (err) {
            console.error(`Error while fetching filtered games from table ${this.tableName}: ${err}`);
            throw err;
        }

        const gamesController = new GamesController();
        const games = [];
        for (const id of ids) {
            try {
                const game = await gamesController.getWithAllForeign(id);
                if (game) {
                    games.push(game);
                }
            } catch (err) {
                console.error(`Error while fetching game with id ${id} from GamesController: ${err}`);
            }
        }

        return games;
    }

    async #checkForeignKeys(data) {
        await this.ready;

        const gameId = data; // caller passes numeric id
        try {
            const [userRows] = await this.dbConnection.execute('SELECT id FROM games WHERE id = ?', [gameId]);
            if (!userRows || userRows.length === 0) {
                return new Error("Invalid game id: " + gameId);
            }
        } catch (err) {
            console.error(`Error while checking game_id ${gameId}: ${err}`);
            throw err;
        }

        return true;
    }
}

module.exports = ShopSpecialsController;