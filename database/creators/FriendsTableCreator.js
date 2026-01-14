const DatabaseHandler = require("../DatabaseHandler");

class FriendsTableCreator extends DatabaseHandler {
    constructor() {
        super();
        this.init();
    }

    async init() {
        await this.waitForConnection();
        await this.selectDatabase();
        await this.createFriendsTable();
    }

    async createFriendsTable() {
        const query = `
            id INT AUTO_INCREMENT PRIMARY KEY,
            user1_id BINARY(16) NOT NULL, INDEX(user1_id),
            user2_id BINARY(16) NOT NULL, INDEX(user2_id)
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("Friends table created or already exists.");
        } catch (err) {
            console.error("Error creating friends table:", err);
        }
    }
}

module.exports = FriendsTableCreator;