const DatabaseHandler = require("../DatabaseHandler");

class CountiesTableMaker extends DatabaseHandler {
    constructor() {
        super();
        this.ready = this.getReady();
    }

    async getReady() {
        await this.waitForConnection();
        await this.selectDatabase();
    }

    async create() {
        await this.ready;
        const query = `
            CREATE TABLE IF NOT EXISTS counties(
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100), 
                code VARCHAR(10) NOT NULL,
                currency VARCHAR(10),
                UNIQUE (code)
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("'counties' table created or already exists.");
        } catch (err) {
            console.error("Error creating counties table:", err);
        }
    }

    async delete() {
        await this.ready;
        const query = `DROP TABLE counties`
        try {
            await this.dbConnection.execute(query);
            console.log("'counties' table deleted!");
        } catch (err) {
            console.error("Error while deleting 'counties' table:", err);
        }
    }
}

module.exports = CountiesTableMaker;