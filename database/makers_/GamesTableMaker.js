const DatabaseHandler = require("../DatabaseHandler");

class GamesTableMaker extends DatabaseHandler {
    constructor() {
        super();
        this.init();
    }

    async init() {
        await this.waitForConnection();
        await this.selectDatabase();
    }

    async create() {
        const query = `
            CREATE TABLE IF NOT EXISTS games (
                id SMALLINT AUTO_INCREMENT PRIMARY KEY,
                app_id INT UNSIGNED NOT NULL,
                platform_id SMALLINT NOT NULL, INDEX(platform_id),
                name VARCHAR(256) NOT NULL,
                banner_img VARCHAR(516),
                description VARCHAR(2048),
                minimum_requirements VARCHAR(1024),
                cost VARCHAR(7)
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("'Games table' created or already exists.");
        } catch (err) {
            console.error("Error creating games table:", err);
        }
    }

    async delete() {
        const query = `DROP TABLE games`
        try {
            await this.dbConnection.execute(query);
            console.log("'games' table deleted!");
        } catch (err) {
            console.error("Error while deleting 'games' table:", err);
        }
    }
}

module.exports = GamesTableMaker;