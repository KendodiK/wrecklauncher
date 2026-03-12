const DatabaseHandler = require("../DatabaseHandler");

class PlatformsTableMaker extends DatabaseHandler {
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
            CREATE TABLE IF NOT EXISTS platforms(
                id TINYINT AUTO_INCREMENT PRIMARY KEY,
                platform_name VARCHAR(10),
                UNIQUE (platform_name)
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("'Platforms' table created or already exists.");
        } catch (err) {
            console.error("Error creating platforms table:", err);
        }
    }

    async delete() {
        await this.ready;
        const query = `DROP TABLE platforms`
        try {
            await this.dbConnection.execute(query);
            console.log("'platforms' table deleted!");
        } catch (err) {
            console.error("Error while deleting 'platforms' table:", err);
        }
    }
}

module.exports = PlatformsTableMaker;