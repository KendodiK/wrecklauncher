const DatabaseHandler = require("../DatabaseHandler");

class Controller extends DatabaseHandler {
    tableName = '';

    constructor(_tableName) {
        super();
        this.tableName = _tableName;
    }
    
    async index() {
        await this.waitForConnection();
        await this.selectDatabase();

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
        await this.waitForConnection();
        await this.selectDatabase();

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
        await this.waitForConnection();
        await this.selectDatabase();

    }

    async update() {
        await this.waitForConnection();
        await this.selectDatabase();
    }

    async delete(id) {
        await this.waitForConnection();
        await this.selectDatabase();

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