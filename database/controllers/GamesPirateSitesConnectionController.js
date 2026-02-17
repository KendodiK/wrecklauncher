const Controller = require('./Controller');
const GamesController = require('./GamesController');
const PirateSitesController = require('./PirateSitesController');

class GamesPirateSitesConncectionController extends Controller {
    constructor() {
        super('game_pirates_sites_connections');
    }

    async index() {
        return super.index();
    }

    async show(id) {
        return super.show(id);
    }

    /**
     * 
     * @param {Array} data - ["game_id" = games.id, "pirate_site_id" = pirate_sites.id, "link" = string ]
     * @returns 
     */
    async create(data) {
        super.create();

        var foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        const query = 'INSERT INTO `game_pirates_sites_connections` (game_id, pirate_site_id, link) VALUES (?, ?, ?)';
        const values = [data.game_id, data.pirate_site_id, data.link];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `${result.id} Element created in table ${this.tableName}` };
        } catch (err) {
            console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * @param {int} id
     * @param {Array} data - ["game_id" = games.id, "pirate_site_id" = pirate_sites.id, "link" = string ]
     * @returns 
     */
    async update(id, data) {
        super.update();

        var foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        var old = await this.show(id);

        const query = 'UPDATE `game_pirates_sites_connections` SET game_id = ?, pirate_site_id = ?, link = ? WHERE id = ?;';
        const values = [
            data.game_id ?? old.game_id, 
            data.pirate_site_id ?? old.pirate_site_id, 
            data.link ?? old.link, 
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

    async #checkForeignKeys(data) {
        var gamesController = new GamesController();
        var pirateSitesController = new PirateSitesController();

        if (await gamesController.show(data.game_id) instanceof Error) {
            return new Error("Invalid game id: " + data.game_id);
        }

        if (await pirateSitesController.show(data.pirate_site_id) instanceof Error) {
            return new Error("Invalid pirate site id: " + data.pirate_site_id);
        }

        return true;
    }
}

module.exports = GamesPirateSitesConncectionController;