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
        await this.createNativeUserTable();
    }

    async createNativeUserTable() {
        const query = `
            CREATE TABLE native_users(
                id UUID DEFAULT (UUID_TO_BIN(UUID())) PRIMARY KEY, // UUID need revision
                token VARCHAR(64) NOT NULL,
                name VARCHAR(32) NOT NULL,
                user_password VARCHAR(100) NOT NULL,
                pfp VARCHAR(516)
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("Native users table created or already exists.");
        } catch (err) {
            console.error("Error creating native users table:", err);
        }
    }
}

module.exports = NativeUserTableCreator;