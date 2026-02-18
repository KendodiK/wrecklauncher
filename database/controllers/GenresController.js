const Controller = require('./Controller');

class GenresController extends Controller {
    constructor() {
        super('genres');
    }

    async index() {
        return super.index();
    }

    async show(id) {
        return super.show(id);
    }

    /**
     * @param {Array} data - ["genre" = string ]
     * @returns {Array} - ["message": string, "id": int]
     */
    async create(data) {
        await super.create();

        let id = await this.getByGenre(data.genre);
        if(id instanceof Error) {
            const query = 'INSERT INTO `genres` (genre) VALUES (?)';
            const values = [data.genre];
            try {
                const [result] = await this.dbConnection.execute(query, values);
                return { message: `${result.insertId} Element created in table ${this.tableName}`, id: result.insertId };
            }
            catch (err) {
                console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
                throw err;
            }
        }
        return { message: `Element already existed in table ${this.tableName}`, id: id };
    }

    /**
     * @param {int} id
     * @param {Array} data - ["genre" = string ]
     * @returns
     */
    async update(id, data) {
        await super.update();

        const query = 'UPDATE `genres` SET genre = ? WHERE id = ?;';
        const values = [data.genre, id];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `${id} Updated successfully in table ${this.tableName}` };
        } catch (err) {
            console.error(`Error while updating element in table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * Checks if genre already exists in the database
     * @param {string} genre - Genre in question
     * @returns {int || error} id - the id if its in the database
     */
    async getByGenre(genre) {
        await this.waitForConnection();
        await this.selectDatabase();

        const query = `SELECT id FROM ${this.tableName} WHERE genre = ?`
        try {
            const [id] = await this.dbConnection.execute(query, [genre]);
            return id[0];
        } catch (err) {
            console.error(`Error while geting element from ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async delete(id) {
        return super.delete(id);
    }
}

module.exports = GenresController;