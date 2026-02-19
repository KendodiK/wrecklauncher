const DatabaseHandler = require("../DatabaseHandler");

class PirateSitesTableMaker extends DatabaseHandler {
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
            CREATE TABLE IF NOT EXISTS pirate_sites(
                id TINYINT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(10) NOT NULL
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("'Pirate sites' table created or already exists.");
        } catch (err) {
            console.error("Error creating pirate sites table:", err);
        }
    }

    async delete() {
        await this.ready;
        const query = `DROP TABLE pirate_sites`
        try {
            await this.dbConnection.execute(query);
            console.log("'pirate_sites' table deleted!");
        } catch (err) {
            console.error("Error while deleting 'pirate_sites' table:", err);
        }
    }
}

module.exports = PirateSitesTableMaker;