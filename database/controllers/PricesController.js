const Controller = require('./Controller');
const CountiesController = require('./CountiesController');

class PricesController extends Controller {
    constructor() {
        super('prices');
    }
    async index() {
        return super.index();
    }

    async show(id) {
        return super.show(id);
    }

    /**
     * 
     * @param {Array} data - ["gameId" = games.id, "countyId" = counties.id, "price" = int ]
     * @returns 
     */
    async create(data) {
        await super.create();

        let checkForeign = await this.#checkForeignKeys(data);
        if (checkForeign instanceof Error) {
            throw checkForeign;
        }

        let uniqueCheck = await this.#checkUniqueConstraint(data);
        if (uniqueCheck instanceof Error) {
            throw uniqueCheck;
        }

        const query = 'INSERT INTO `prices` (game_id, county_id, price) VALUES (?,?,?)';
        const values = [ data.gameId, data.countyId, data.price ];
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
     * @param {Array} data - ["gameId" = games.id || null, "countyId" = counties.id || null, "price" = int || null ]
     * @returns 
     */
    async update(id, data) {
        await super.update();

        const old = await this.show(id);
        if(!old || old instanceof Error) {
            console.error(`Error while checking old element for update in ${this.tableName}`);
            throw new Error({message: "There is no element in the table with given id", id: id});
        }

        try {
            const query = 'UPDATE `prices` SET game_id = ?, county_id = ?, price = ? WHERE id = ?;';
            const values = [data.gameId ?? old.game_id, data.countyId ?? old.county_id, data.price ?? old.price, id];
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

    async getByGameId(gameId) {
        await this.ready;

        try {
            const query = `SELECT p.id, p.game_id, p.price, c.code AS county_code, c.currency AS currency 
                                FROM prices AS p 
                                JOIN counties AS c ON p.county_id = c.id
                                WHERE game_id = ?;`;
            const [rows] = await this.dbConnection.execute(query, [gameId]);
            return rows ?? [];
        } catch (err) {
            console.error(`Error wile getting prices by game_id in table ${this.tableName}: ${err}`)
            throw err;
        }
    }
    //toDo: A többi lekérdezéshez is hozzáadni a currency-t

    async #checkUniqueConstraint(data) {
        await this.ready;

        try {
            const query = `SELECT id FROM prices WHERE game_id = ? AND county_id = ?;`;
            const values = [data.gameId, data.countyId];
            const [rows] = await this.dbConnection.execute(query, values);
            if (rows.length > 0) {
                return new Error({ message: `Element with name ${data.name} already exists in table ${this.tableName}`, id: rows[0].id });
            }
        } catch (err) {
            console.error(`Error while checking unique constraint for name ${data.name}: ${err}`);
            throw err;
        }
    }

    async #checkForeignKeys(data) {
        await this.ready;

        try {
            let query = 'SELECT * FROM counties WHERE id = ?';
            const [counties] = await this.dbConnection.execute(query, [data.countyId]);
            query = 'SELECT * FROM games WHERE id = ?';
            const [games] = await this.dbConnection.execute(query, [data.gameId]);
            if (counties.length < 1) {
                return new Error({message: `No county in the database with given id`, id: data.countyId})
            } else if ( games.length < 1 ) {
                return new Error({message: `No game in the database with given id`, id: data.countyId})
            }
        } catch (err) {
            console.error('Error while checking foreign keys for prices');
            throw err;
        }
    }
}

module.exports = PricesController;