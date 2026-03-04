const Controller = require('./Controller');

class ShopSpecialsController extends Controller {
    constructor() {
        super('shop_specials');
    }

    async index() {
        return super.index();
    }

    async show(id) {
        return super.show(id);
    }

    /**
     * 
     * @param {Array} data - {"game_id": int, "featured": boolean, "coming_soon": boolean, "discounted": boolean}
     * @returns {Array} message: string, id: int
     */
    async create(data) {
        await super.create();

        const isThereForeignKey = await this.#checkForeignKeys(data.game_id);
        if (isThereForeignKey != true) {
            throw isThereForeignKey;
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
     * @param {int} id 
     * @param {Array} data - {"game_id": int, "featured": boolean, "coming_soon": boolean, "discounted": boolean}
     * @returns 
     */
    async update(id, data) {
        await super.update(); 
    
        let old = await this.show(id);

        const query = 'UPDATE shop_specials SET game_id = ?, featured = ?, coming_soon = ?, discounted = ? WHERE id = ?;';
        const values = [data.game_id ?? old.game_id, data.featured ?? old.featured, data.coming_soon ?? old.coming_soon, data.discounted ?? old.discounted, id];

        try {
            await this.dbConnection.execute(query, values);
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
            const [userRows] = await this.dbConnection.execute('SELECT id FROM games WHERE id = ?', [data.game_id]);
            if (!userRows || userRows.length === 0) {
                return new Error("Invalid game id: " + data.game_id);
            }
        } catch (err) {
            console.error(`Error while checking game_id ${data.game_id}: ${err}`);
            throw err;
        }

        return true;
    }
}

module.exports = ShopSpecialsController;