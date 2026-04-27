const DatabaseHandler = require("../DatabaseHandler");

class GamesTableMaker extends DatabaseHandler {
    constructor() {
        super();
        this.ready = this.getReady();
    }

    async create() {
        await this.ready;
        const query = `
            CREATE TABLE IF NOT EXISTS games (
                id MEDIUMINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
                app_id INT UNSIGNED NOT NULL,
                platform_id SMALLINT NOT NULL, INDEX(platform_id),
                name VARCHAR(256) NOT NULL,
                banner_img VARCHAR(516),
                description VARCHAR(2048),
                minimum_requirements VARCHAR(2048),
                UNIQUE uq_game (app_id, name)
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
        await this.ready;
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