const DatabaseHandler = require("../DatabaseHandler");

class GamesTableCreator extends DatabaseHandler {
    constructor() {
        super();
        this.init();
    }

    async init() {
        await this.waitForConnection();
        await this.selectDatabase();
        await this.createGamesTable();
    }

    async createGamesTable() {
        const query = `
            CREATE TABLE games (
                id SMALLINT AUTO_INCREMENT PRIMARY KEY,
                app_id INT UNSIGNED NOT NULL,
                platform_id SMALLINT, INDEX(platform_id),
                name VARCHAR(256) NOT NULL,
                banner_img VARCHAR(516),
                cost VARCHAR(7)
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("Games table created or already exists.");
        } catch (err) {
            console.error("Error creating games table:", err);
        }
    }
}

module.exports = GamesTableCreator;