const Controller = require('./Controller');

class CountiesController extends Controller {
    constructor() {
        super('counties');
    }
    async index() {
        return super.index();
    }

    async show(id) {
        return super.show(id);
    }

    /**
     * 
     * @param {Array} data - ["name" = string || null, "code" = string, "currency" = string || null ]
     * @returns 
     */
    async create(data) {
        await super.create();

        let uniqueCheck = await this.#checkUniqueConstraint(data);
        if (uniqueCheck != null || uniqueCheck instanceof Error) {
            throw uniqueCheck;
        }

        const query = 'INSERT INTO `counties` (name, code, currency) VALUES (?, ?, ?)';
        const values = [data.name ?? "", data.code, data.currency ?? ""];
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
     * @param {Array} data - ["name" = string || null, "code" = string, "currency" = string || null ]
     * @returns 
     */
    async update(id, data) {
        await super.update();

        const old = await this.show(id);
        if (!old || old instanceof Error) {
            console.error(`Error while updating element in table ${this.tableName}: ${old?.message ?? old}`);
            return new Error("No element in table with given id, or couldn't read it");
        }

        const query = 'UPDATE `counties` SET name = ?, code = ?, currency = ? WHERE id = ?;';
        const values = [data.name ?? old.name, data.code ?? old.code, data.currency ?? old.currency, id];
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
     * 
     * @param {string} code 
     * @returns {Array} The data of the country with given code
     */
    async getByCode(code) {
        await this.ready;

        try {
            const query = 'SELECT * FROM counties WHERE code = ?';
            const [rows] = await this.dbConnection.execute(query, [code]);
            return rows[0] ?? null;
        } catch (err) {
            console.error(`Error while getting elements form table ${this.tableName} by code: ${err}`);
            throw err;
        }
    }

    async #checkUniqueConstraint(data) {
        await this.ready;

        try {
            const query = 'SELECT id FROM `counties` WHERE code = ?;';
            const values = [data.code];
            const [rows] = await this.dbConnection.execute(query, values);
            if (rows.length > 0) {
                return new Error({ message: `Element with code ${data.code} already exists in table ${this.tableName}`, id: rows[0].id });
            }
            return null;
        } catch (err) {
            console.error(`Error while checking unique constraint for name ${data.name}: ${err}`);
            throw err;
        }
    }
}

module.exports = CountiesController;