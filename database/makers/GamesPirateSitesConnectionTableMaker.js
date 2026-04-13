const DatabaseHandler = require("../DatabaseHandler");

class GamesPirateSitesConnectionTableMaker extends DatabaseHandler {
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
            CREATE TABLE IF NOT EXISTS game_pirates_sites_connections (
            game_id MEDIUMINT UNSIGNED NOT NULL, INDEX(game_id),
            site_id TINYINT NOT NULL, INDEX(site_id),
            link TEXT NOT NULL
        );
        `;
        try {
            await this.dbConnection.execute(query);            console.log("'Games-pirate sites connection' table created or already exists.");
        } catch (err) {
            console.error("Error creating games-pirate sites connection table:", err);
        }
    }

        async delete() {
            await this.ready;
        const query = `DROP TABLE game_pirates_sites_connections`
        try {
            await this.dbConnection.execute(query);
            console.log("'game_pirates_sites_connections' table deleted!");
        } catch (err) {
            console.error("Error while deleting 'game_pirates_sites_connections' table:", err);
        }
    }
}

module.exports = GamesPirateSitesConnectionTableMaker;