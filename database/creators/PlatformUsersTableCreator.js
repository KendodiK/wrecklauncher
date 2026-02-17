const DatabaseHandler = require("../DatabaseHandler");

class PlatformUsersTableCreator extends DatabaseHandler {
    constructor() {
        super();
        this.init();
    }

    async init() {
        await this.waitForConnection();
        await this.selectDatabase();
        await this.createPlatformUsersTable();
    }

    async createPlatformUsersTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS platform_users(
                id INT AUTO_INCREMENT PRIMARY KEY,
                native_user_id UUID NOT NULL, INDEX(native_user_id),
                platform_user_name VARCHAR(64) NOT NULL,
                platform_id SMALLINT NOT NULL, INDEX(platform_id),
                platform_profile_id VARCHAR(17) NOT NULL,
                platform_password VARCHAR(64) NOT NULL
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("'Platform users' table created or already exists.");
        } catch (err) {
            console.error("Error creating platform users table:", err);
        }
    }
}

module.exports = PlatformUsersTableCreator;