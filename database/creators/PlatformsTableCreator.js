const DatabaseHandler = require("../DatabaseHandler");

class PlatformsTableCreator extends DatabaseHandler {
    constructor() {
        super();
        this.ready = this.init();
    }

    async init() {
        await this.waitForConnection();
        await this.selectDatabase();
        await this.createPlatformsTable();
    }

    async createPlatformsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS platforms(
                id TINYINT AUTO_INCREMENT PRIMARY KEY,
                platform_name VARCHAR(10)
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("'Platforms' table created or already exists.");
        } catch (err) {
            console.error("Error creating platforms table:", err);
        }
    }
}

module.exports = PlatformsTableCreator;