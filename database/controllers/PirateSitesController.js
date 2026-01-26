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
     * 
     * @param {Array} data - ["name" = string ]
     * @returns 
     */
    async create(data) {
        super.create();

        const query = 'INSERT INTO `pirate_sites` (name) VALUES (?)';
        const values = [data.name];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return {message: "Pirate site created", id: result.insertId};
        }
        catch (err) {
            console.error("Error while adding to database: " + err)
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
        super.update();

        const query = 'UPDATE `pirate_sites` SET name = ? WHERE id = ?;';
        const values = [data.name, id];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return {message: "Pirate site updated"};
        } catch (err) {
            console.error("Error while updating database:" + err)
            throw err;
        }
    }

    async delete(id) {
        return super.delete(id);
    }
}

module.exports = PirateSitesController;