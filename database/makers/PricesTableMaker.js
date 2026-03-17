const DatabaseHandler = require("../DatabaseHandler");

class PricesTableMaker extends DatabaseHandler {
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
            CREATE TABLE IF NOT EXISTS prices(
                id INT AUTO_INCREMENT PRIMARY KEY, 
                game_id MEDIUMINT UNSIGNED NOT NULL, INDEX(game_id),
                county_id TINYINT UNSIGNED NOT NULL, INDEX(county_id),
                price FLOAT NOT NULL,
                UNIQUE (game_id, county_id)
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("'prices' table created or already exists.");
        } catch (err) {
            console.error("Error creating prices table:", err);
        }
    }

    async delete() {
        await this.ready;
        const query = `DROP TABLE prices`
        try {
            await this.dbConnection.execute(query);
            console.log("'prices' table deleted!");
        } catch (err) {
            console.error("Error while deleting 'prices' table:", err);
        }
    }
}

module.exports = PricesTableMaker;