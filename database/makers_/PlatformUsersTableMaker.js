const DatabaseHandler = require("../DatabaseHandler");

class PlatformUsersTableMaker extends DatabaseHandler {
    constructor() {
        super();
        this.init();
    }

    async init() {
        await this.waitForConnection();
        await this.selectDatabase();
    }

    async create() {
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

    async delete() {
        const query = `DROP TABLE platform_users`
        try {
            await this.dbConnection.execute(query);
            console.log("'platform_users' table deleted!");
        } catch (err) {
            console.error("Error while deleting 'platform_users' table:", err);
        }
    }
}

module.exports = PlatformUsersTableMaker;