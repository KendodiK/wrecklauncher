const DatabaseHandler = require("../DatabaseHandler");

class Controller extends DatabaseHandler {
    tableName = '';

    constructor(_tableName) {
        super();
        this.tableName = _tableName;
        this.ready = this.getReady();
    }
    
    async index() {
        await this.ready;

        const query = `SELECT * FROM ${this.tableName};`;
        try { 
            const [rows] = await this.dbConnection.execute(query);
            return rows;            
        } catch (err) {
            console.error(`Error while selecting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async show(id) {
        await this.ready;

        const query = `SELECT * FROM ${this.tableName} WHERE id = ?;`;
        try {
            const [rows] = await this.dbConnection.execute(query, [id]);
            return rows[0];
        } catch (err) {
            console.error(`Error while selecting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async create() {
        await this.ready;

    }

    async update() {
        await this.ready;
    }

    async delete(id) {
        await this.ready;

        const query = `DELETE FROM ${this.tableName} WHERE id = ?;`;
        try {
            await this.dbConnection.execute(query, [id]);
            return { message: `${id} deleted successfully from ${this.tableName}` };
        } catch (err) {
            console.error(`Error while deleting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }
}

module.exports = Controller;