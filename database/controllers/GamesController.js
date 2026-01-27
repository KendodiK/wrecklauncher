const Controller = require('./Controller');
const PlatformsController = require('./PlatformsController');

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
     * @param {Array} data - ["app_id" = int, "platform_id" = platforms.id, "name" = string, "banner_img" = string, cost = float]
     * @returns
     */
    async create(data) {
        super.create();

        var foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        const query = 'INSERT INTO `pirate_sites` (app_id, platform_id, name, banner_img, cost) VALUES (?, ?, ?, ?, ?)';
        const values = [data.app_id, data.platform_id, data.name, data.banner_img, data.cost];
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
     * @param {Array} data - ["app_id" = int, "platform_id" = platforms.id, "name" = string, "banner_img" = string, cost = float]
     * @returns
     */
    async update(id, data) {
        super.update();

        var foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        var old = await this.show(id);

        const query = 'UPDATE `pirate_sites` SET app_id = ?, platform_id = ?, name = ?, banner_img = ?, cost = ? WHERE id = ?;';
        const values = [
            data.app_id ?? old.app_id, 
            data.platform_id ?? old.platform_id, 
            data.name ?? old.name, 
            data.banner_img ?? old.banner_img, 
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

    async #checkForeignKeys(data) {
        const platformsController = new PlatformsController();

        if (await platformsController.show(data.platform_id) instanceof Error) { 
            return new Error("Invalid platform id: " + data.platform_id);
        }

        return true;
    }
}

module.exports = GamesController;