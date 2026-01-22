const DatabaseHandler = require("../DatabaseHandler");

class Controller extends DatabaseHandler {
    tableName = '';

    constructor(_tableName) {
        super();
        this.tableName = _tableName;
    }
    
    async index() {
        this.waitForConnection();
        this.selectDatabase();

        const query = `SELECT * FROM ${this.tableName};`;
        try { 
            const [rows] = await this.dbConnection.execute(query);
            return rows;            
        } catch (err) {
            console.error("Error:", err);
            throw err;
        }
    }

    async show(id) {
        this.waitForConnection();
        this.selectDatabase();

        const query = `SELECT * FROM ${this.tableName} WHERE id = ?;`;
        try {
            const [rows] = await this.dbConnection.execute(query, [id]);
            return rows[0];
        } catch (err) {
            console.error("Error:", err);
            throw err;
        }
    }

    async create() {
        this.waitForConnection();
        this.selectDatabase();

    }

    async update() {
        this.waitForConnection();
        this.selectDatabase();
    }

    async delete(id) {
        this.waitForConnection();
        this.selectDatabase();

        const query = `DELETE FROM ${this.tableName} WHERE id = ?;`;
        try {
            await this.dbConnection.execute(query, [id]);
            return { message: id + " deleted successfully" };
        } catch (err) {
            console.error("Error:", err);
            throw err;
        }
    }
} 

module.exports = Controller;