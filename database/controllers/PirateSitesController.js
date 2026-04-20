const Controller = require('./Controller');

class PirateSitesController extends Controller {
    constructor() {
        super('pirate_sites');
    }
    async index() {
        return super.index();
    }

    async show(id) {
        return super.show(id);
    }

    /**
     * Fetch pirate site row by name.
     * @param {string} name
     * @returns {Promise<object|null>}
     */
    async getByName(name) {
        await this.ready;

        const normalizedName = String(name ?? '').trim();
        if (!normalizedName) return null;

        const query = 'SELECT * FROM `pirate_sites` WHERE LOWER(name) = LOWER(?) LIMIT 1;';
        try {
            const [rows] = await this.dbConnection.execute(query, [normalizedName]);
            return rows?.[0] ?? null;
        } catch (err) {
            console.error(`Error while selecting by name from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * 
     * @param {Array} data - ["name" = string ]
     * @returns 
     */
    async create(data) {
        await super.create();

        let uniqueCheck = await this.#checkUniqueConstraint(data);
        if (uniqueCheck != null ||uniqueCheck instanceof Error) {
            throw uniqueCheck;
        }

        const query = 'INSERT INTO `pirate_sites` (name) VALUES (?)';
        const values = [data.name];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `${result.id} Element created in table ${this.tableName}`, id: result.insertId };
        }
        catch (err) {
            console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * 
     * @param {int} id
     * @param {Array} data - ["name" = string ]
     * @returns 
     */
    async update(id, data) {
        await super.update();

        const query = 'UPDATE `pirate_sites` SET name = ? WHERE id = ?;';
        const values = [data.name, id];
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

    async #checkUniqueConstraint(data) {
        await this.ready;

        try {
            const query = 'SELECT id FROM `pirate_sites` WHERE name = ?;';
            const values = [data.name];
            const [rows] = await this.dbConnection.execute(query, values);
            if (rows.length > 0) {
                return new Error({ message: `Element with name ${data.name} already exists in table ${this.tableName}`, id: rows[0].id });
            }
            return null;
        } catch (err) {
            console.error(`Error while checking unique constraint for name ${data.name}: ${err}`);
            throw err;
        }
    }
}

module.exports = PirateSitesController;