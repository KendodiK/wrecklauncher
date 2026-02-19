const Controller = require('./Controller');
// Validate via DB queries to avoid circular controller requires

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
        await super.create();

        let foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        const query = 'INSERT INTO `game_pirates_sites_connections` (game_id, pirate_site_id, link) VALUES (?, ?, ?)';
        const values = [data.game_id, data.pirate_site_id, data.link];
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
     * @param {Array} data - ["game_id" = games.id, "pirate_site_id" = pirate_sites.id, "link" = string ]
     * @returns 
     */
    async update(id, data) {
        await super.update();

        let foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        let old = await this.show(id);

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
        await this.ready;

        try {
            const [gameRows] = await this.dbConnection.execute('SELECT id FROM games WHERE id = ?', [data.game_id]);
            if (!gameRows || gameRows.length === 0) {
                return new Error("Invalid game id: " + data.game_id);
            }
        } catch (err) {
            console.error(`Error while checking game id ${data.game_id}: ${err}`);
            throw err;
        }

        try {
            const [siteRows] = await this.dbConnection.execute('SELECT id FROM pirate_sites WHERE id = ?', [data.pirate_site_id]);
            if (!siteRows || siteRows.length === 0) {
                return new Error("Invalid pirate site id: " + data.pirate_site_id);
            }
        } catch (err) {
            console.error(`Error while checking pirate_site_id ${data.pirate_site_id}: ${err}`);
            throw err;
        }

        return true;
    }
}

module.exports = GamesPirateSitesConncectionController;