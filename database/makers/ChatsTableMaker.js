const DatabaseHandler = require("../DatabaseHandler");

class ChatsTableMaker extends DatabaseHandler {
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
            CREATE TABLE IF NOT EXISTS chats (
                id INT AUTO_INCREMENT PRIMARY KEY,
                friends_id INT NOT NULL, INDEX(friends_id),
                message VARCHAR(1000) NOT NULL, 
                sender_id UUID NOT NULL, INDEX(sender_id),
                FOREIGN KEY (friends_id) REFERENCES friends(friends_id),
                FOREIGN KEY (sender_id) REFERENCES native_users(sender_id)
            );
        `;
        try {
            await this.dbConnection.execute(query);
            console.log("'Chats' table created or already exists.");
        } catch (err) {
            console.error("Error creating 'chats' table:", err);
        }
    }

    async delete() {
        await this.ready;
        const query = `DROP TABLE chats`
        try {
            await this.dbConnection.execute(query);
            console.log("'Chats' table deleted!");
        } catch (err) {
            console.error("Error while deleting 'chats' table:", err);
        }
    }
}

module.exports = ChatsTableMaker;