const DatabaseHandler = require("../DatabaseHandler");

class GamesGenresConnectionTableMaker extends DatabaseHandler {
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

    async delete() {
        await this.ready;
        const query = `DROP TABLE games_genres_connection_table`
        try {
            await this.dbConnection.execute(query);
            console.log("'games_genres_connection_table' table deleted!");
        } catch (err) {
            console.error("Error while deleting 'games_genres_connection_table' table:", err);
        }
    }
}

module.exports = GamesGenresConnectionTableMaker;