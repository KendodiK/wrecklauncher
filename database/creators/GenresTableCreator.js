const DatabaseHandler = require("../DatabaseHandler");

class GenresTableCreator extends DatabaseHandler {
    constructor() {
        super();
        this.init();
    }

    async init() {
        await this.waitForConnection();
        await this.selectDatabase();
        await this.createGenresTable();
    }

    async createGenresTable() {
        const query = `
            CREATE TABLE genres(
                id SMALLINT AUTO_INCREMENT PRIMARY KEY,
                genre VARCHAR(32) NOT NULL
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("Genres table created or already exists.");
        } catch (err) {
            console.error("Error creating genres table:", err);
        }
    }
}

module.exports = GenresTableCreator;