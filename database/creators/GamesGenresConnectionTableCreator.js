const DatabaseHandler = require("../DatabaseHandler");

class GamesGenresConnectionTableCreator extends DatabaseHandler {
    constructor() {
        super();
        this.ready = this.init();
    }

    async init() {
        await this.waitForConnection();
        await this.selectDatabase();
        await this.createGamesGenresConnectionTable();
    }

    async createGamesGenresConnectionTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS games_genres_connections (
                game_id INT NOT NULL, INDEX(game_id),
                genre_id INT NOT NULL, INDEX(genre_id)
            )
        `;

        try {
            await this.dbConnection.execute(query);
            console.log("'Games-genres connection' table created or already exists.");
        } catch (err) {
            console.error("Error creating games-genres table table:", err);
        }
    }
}

module.exports = GamesGenresConnectionTableCreator;