const DatabaseHandler = require("../DatabaseHandler");

class PirateSitesTableCreator extends DatabaseHandler {
    constructor() {
        super();
        this.init();
    }

    async init() {
        await this.waitForConnection();
        await this.selectDatabase();
        await this.createPirateSites();
    }

    async createPirateSites() {
        const query = `
            CREATE TABLE pirate_sites(
                id TINYINT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(10) NOT NULL
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("Pirate sites table created or already exists.");
        } catch (err) {
            console.error("Error creating pirate sites table:", err);
        }
    }
}

module.exports = PirateSitesTableCreator;