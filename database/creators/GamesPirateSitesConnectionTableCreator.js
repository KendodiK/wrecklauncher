const DatabaseHandler = require("../DatabaseHandler");

class GamesPirateSitesConnectionTableCreator extends DatabaseHandler {
    constructor() {
        super();
        this.init();
    }

    async init() {
        await this.waitForConnection();
        await this.selectDatabase();
        await this.createGamesPirateSitesConnectionTable();
    }

    async createGamesPirateSitesConnectionTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS game_pirates_sites_connections (
            game_id SMALLINT NOT NULL, INDEX(game_id),
            site_id TINYINT NOT NULL, INDEX(site_id),
            link VARCHAR(516) NOT NULL
        );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("'Games-pirate sites connection' table created or already exists.");
        } catch (err) {
            console.error("Error creating games-pirate sites connection table:", err);
        }
    }
}

module.exports = GamesPirateSitesConnectionTableCreator;