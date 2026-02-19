const DatabaseHandler = require("../DatabaseHandler");

class NativeUserTableMaker extends DatabaseHandler {
    constructor() {
        console.log("Creating NativeUserTableMaker");
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
            CREATE TABLE IF NOT EXISTS native_users(
                id UUID DEFAULT UUID() PRIMARY KEY,
                token VARCHAR(64) NOT NULL,
                name VARCHAR(32) NOT NULL,
                user_password VARCHAR(100) NOT NULL,
                email VARCHAR(256) NOT NULL,
                bio VARCHAR(512),
                pfp VARCHAR(516)
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("'Native users' table created or already exists.");
        } catch (err) {
            console.error("Error creating native users table:", err);
        }
    }

    async delete() {
        await this.ready;
        const query = `DROP TABLE native_users`
        try {
            await this.dbConnection.execute(query);
            console.log("'native_users' table deleted!");
        } catch (err) {
            console.error("Error while deleting 'native_users' table:", err);
        }
    }
}

module.exports = NativeUserTableMaker;