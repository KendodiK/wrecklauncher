const DatabaseHandler = require("../DatabaseHandler");

class NativeUserTableCreator extends DatabaseHandler {
    constructor() {
        console.log("Creating NativeUserTableCreator");
        super();
        this.init();
    }

    async init() {
        await this.waitForConnection();
        await this.selectDatabase();
    }

    async create() {
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
        const query = `DROP TABLE native_users`
        try {
            await this.dbConnection.execute(query);
            console.log("'native_users' table deleted!");
        } catch (err) {
            console.error("Error while deleting 'native_users' table:", err);
        }
    }
}

module.exports = NativeUserTableCreator;