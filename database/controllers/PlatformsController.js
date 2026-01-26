const Controller = require('./Controller');

class PlatformsController extends Controller {
    constructor() {
        super('platforms');
    }

    async index() {
        return super.index();
    }

    async show(id) {
        return super.show(id);
    }

    /**
     * 
     * @param {Array} data - {"name": string}
     */
    async create(data) {
        await super.create();

        const query = 'INSERT INTO platforms (name) VALUES (?);';
        const values = [data.name];

        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { id: result.insertId, ...data };
        } catch (err) {
            console.error("Error creating platform:", err);
            throw err;
        }
    }

    /**
     * 
     * @param {int} id 
     * @param {Array} data - {"name": string}
     * @returns 
     */
    async update(id, data) {
        await super.update(); 
    
        const query = 'UPDATE platforms SET name = ? WHERE id = ?;';
        const values = [data.name, id];

        try {
            await this.dbConnection.execute(query, values);
            return { message: id + " Updated successfully" };
        } catch (err) {
            console.error("Error updating platform:", err);
            throw err;
        }
    }

    async delete(id) {
        return super.delete(id);
    }
}

module.exports = PlatformsController;