const Controller = require('./Controller');
const PirateSitesController = require('./PirateSitesController');
// Validate via DB queries to avoid circular controller requires

class GamesPirateSitesConncectionController extends Controller {
    constructor() {
        super('game_pirates_sites_connections');
    }

    async index() {
        return super.index();
    }

    async show(gameId, siteId) {
        await this.ready;

        const query = `SELECT * FROM ${this.tableName} WHERE game_id = ? AND site_id = ?;`;
        try {
            const [rows] = await this.dbConnection.execute(query, [gameId, siteId]);
            return rows[0];
        } catch (err) {
            console.error(`Error while selecting from table ${this.tableName}: ${err}`);
            throw err;
        }
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

        let duplicateCheck = await this.#checkUniqueConstraint(data);
        if (duplicateCheck instanceof Error) {
            throw duplicateCheck;
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
     * Update an existing connection. game_id and pirate_site_id are used to identify the connection, and cannot be updated.
     * @param {int} id
     * @param {Array} data - ["game_id" = games.id, "pirate_site_id" = pirate_sites.id, "link" = string ]
     * @returns 
     */
    async update(data) {
        await super.update();

        let foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        let old = await this.show(id);

        if (!old) {
            throw new Error(`Element with id given data not found in table ${this.tableName}`);
        }

        const query = 'UPDATE `game_pirates_sites_connections` SET link = ? WHERE game_id = ? AND site_id = ?;';
        const values = [
            data.link ?? old.link, 
            data.game_id, 
            data.pirate_site_id
        ];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `${id} Updated successfully in table ${this.tableName}` };
        } catch (err) {
            console.error(`Error while updating element in table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async delete(gameId, siteId) {
        await this.ready;

        const query = `DELETE FROM ${this.tableName} WHERE  game_id = ? AND site_id = ?;`;
        try {
            await this.dbConnection.execute(query, [gameId, siteId]);
            return { message: `Element deleted successfully from ${this.tableName}` };
        } catch (err) {
            console.error(`Error while deleting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async deleteByGameId(gameId) {
        await this.ready;

        const query = `DELETE FROM ${this.tableName} WHERE  game_id = ?;`;
        try {
            await this.dbConnection.execute(query, [gameId]);
            return { message: `Elements deleted successfully from ${this.tableName} for game_id ${gameId}` };
        } catch (err) {
            console.error(`Error while deleting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async deleteBySiteId(siteId) {
        await this.ready;

        const query = `DELETE FROM ${this.tableName} WHERE  pirate_site_id = ?;`;
        try {
            await this.dbConnection.execute(query, [siteId]);
            return { message: `Elements deleted successfully from ${this.tableName} for pirate_site_id ${siteId}` };
        } catch (err) {
            console.error(`Error while deleting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async getConnectionsByGameId(gameId) {
        await this.ready;

            const query = `SELECT pirate_sites.name AS site_name, link FROM ${this.tableName} JOIN pirate_sites ON site_id = pirate_sites.id WHERE game_id = ?;`;
        try {
            const [rows] = await this.dbConnection.execute(query, [gameId]);
            return rows;
        } catch (err) {
            console.error(`Error while selecting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async createWithAll(data) {
        await super.create();

        if (!data.game_id || !data.pirate_site_id) {
            throw new Error("game_id and pirate_site_id are required");
        }

        if (!data.pirate_site_id && data.site_name) {
            const pirateSitesController = new PirateSitesController();
            data.pirate_site_id = pirateSitesController.create({"name": data.site_name,}).id;
        }

        let duplicateCheck = await this.#checkUniqueConstraint(data);
        if (duplicateCheck instanceof Error) {
            throw duplicateCheck;
        }

        const query = 'INSERT INTO `game_pirates_sites_connections` (game_id, pirate_site_id, link) VALUES (?, ?, ?)';
        const values = [data.game_id, data.pirate_site_id, data.link];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `${result.insertId} Element created in table ${this.tableName}`, id: result.insertId, siteId: data.pirate_site_id };
        } catch (err) {
            console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
            throw err;
        }
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

    async #checkUniqueConstraint(data) {
        await this.ready;

        try {
            const [existingRows] = await this.dbConnection.execute('SELECT id FROM game_pirates_sites_connections WHERE game_id = ? AND pirate_site_id = ?', [data.game_id, data.pirate_site_id]);
            if (existingRows && existingRows.length > 0) {
                return new Error("Duplicate entry for game_id and pirate_site_id");
            }
        } catch (err) {
            console.error(`Error while checking unique constraint for game_id ${data.game_id} and pirate_site_id ${data.pirate_site_id}: ${err}`);
            throw err;
        }

        return true;
    }
}

module.exports = GamesPirateSitesConncectionController;