const DatabaseHandler = require("../DatabaseHandler");

class GamesTableMaker extends DatabaseHandler {
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
            CREATE TABLE shop_specials(
                game_id MEDIUMINT UNSIGNED NOT NULL, INDEX(game_id),
                featured FLOAT,
                coming_soon BOOLEAN,
                discount_percent TINYINT
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("'Shop_specials' table created or already exists.");
        } catch (err) {
            console.error("Error creating shop_specials table:", err);
        }
    }

    async delete() {
        await this.ready;
        const query = `DROP TABLE shop_specials`
        try {
            await this.dbConnection.execute(query);
            console.log("'shop_specials' table deleted!");
        } catch (err) {
            console.error("Error while deleting 'shop_specials' table:", err);
        }
    }
}

module.exports = GamesTableMaker;