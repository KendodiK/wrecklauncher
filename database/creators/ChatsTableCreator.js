const DatabaseHandler = require("../DatabaseHandler");

class ChatsTableCreator extends DatabaseHandler {
    constructor() {
        super();
        this.init();
    }

    async init() {
        await this.waitForConnection();
        await this.selectDatabase();
        await this.createChatsTable();
    }

    async createChatsTable() {
        const query = `
            CREATE TABLE IF NOT EXISTS chats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                friends_id INT NOT NULL, INDEX(friends_id),
                message VARCHAR(1000) NOT NULL, 
                sender_id BINARY(16) NOT NULL, INDEX(sender_id)
            )
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("'Chats' table created or already exists.");
        } catch (err) {
            console.error("Error creating chats table:", err);
        }
    }
}

module.exports = ChatsTableCreator;