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
            CREATE TABLE platform_users(
                id SMALLINT AUTO_INCREMENT PRIMARY KEY,
                user_id BINARY(16) NOT NULL, INDEX(user_id),
                platform_user_name VARCHAR(64) NOT NULL,
                platform_id SMALLINT NOT NULL, INDEX(platform_id),
                platform_profile_id VARCHAR(17) NOT NULL,
                platform_password VARCHAR(64) NUT NULL
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("Platform users table created or already exists.");
        } catch (err) {
            console.error("Error creating platform users table:", err);
        }
    }
}

module.exports = PlatformUsersTableCreator;