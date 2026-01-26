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
     * @param {Array} data - ["genre" = string ]
     * @returns
     */
    async create(data) {
        super.create();

        const query = 'INSERT INTO `genres` (genre) VALUES (?)';
        const values = [data.genre];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return {message: "Genre created", id: result.insertId};
        }
        catch (err) {
            console.error("Error while adding to database: " + err)
            throw err;
        }
    }

    /**
     * @param {int} id
     * @param {Array} data - ["genre" = string ]
     * @returns
     */
    async update(id, data) {
        super.update();

        const query = 'UPDATE `genres` SET genre = ? WHERE id = ?;';
        const values = [data.genre, id];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return {message: "Genre updated"};
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