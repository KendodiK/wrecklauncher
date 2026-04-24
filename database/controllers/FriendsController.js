const Controller = require("./Controller");

class FriendsController extends Controller {
    constructor() { 
        super('friends');
    }

    async index() {
        return super.index();
    }

    async show(id) {
        return super.show(id);
    }


    /**
     * 
     * @param {Array} data - ["user1_id" = native_users.id, "user2_id" = native_users.id ]
     * @return {Array} - ["message": string, "id": int] if created, ["message": string] if friendship already exists
     */
    async create(data) {
        await super.create();

        const foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        const uniqueCheck = await this.#checkUniqueConsrain(data);
        if (uniqueCheck instanceof Error) {
            return uniqueCheck;
        }

        const query = 'INSERT INTO `friends` (user1_id, user2_id) VALUES (?,?)'
        const values = [data.user1_id, data.user2_id];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `${result.id} Element created in table ${this.tableName}`, id: result.insertId };
        }
        catch (err) {
            console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * @param {int} id
     * @param {Array} data - ["user1_id" = native_users.id, "user2_id" = native_users.id ]
     */
    async update(id, data) {
        await super.update();
        
        const foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        const old = await this.show(id);

        const query = 'UPDATE `friends` SET user1_id = ?, user2_id = ? WHERE id = ?;'
        const values = [
            data.user1_id ?? old.user1_id, 
            data.user2_id ?? old.user2_id, 
            id ];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `${id} Updated successfully in table ${this.tableName}` };
        }
        catch (err) {
            console.error(`Error while updating element in table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async delete(id) {
        return super.delete(id);
    }

    /**
     * Gets the friends (native user ids) for a given native user
     * @param {int} nativeUserId 
     * @returns {Array} - Array of friends (native user ids) for the given native user ID
     */
    async getNativeUserFriends(nativeUserId) {
        await this.ready; 
    
        const query = 'SELECT * FROM friends WHERE user1_id = ? OR user2_id = ?';
        try {
            const [rows] = await this.dbConnection.execute(query, [nativeUserId, nativeUserId]);
            return rows;
        } catch (err) {
            console.error(`Error while fetching friends for native user ${nativeUserId} from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async getFriendId(user1_id, user2_id) {
        await this.ready;
        
        const query = 'SELECT id FROM friends WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)';
        const values = [user1_id, user2_id, user2_id, user1_id];
        try {
            const [rows] = await this.dbConnection.execute(query, values);
            return rows[0]?.id || null;
        } catch (err) {
            console.error(`Error while fetching friend ID for users ${user1_id} and ${user2_id} from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async getChattingFriends(nativeUserId) { 
        await this.ready;

        const query = `SELECT friends.user1_id, friends.user2_id 
                            FROM friends 
	                        JOIN chats ON friends.id = chats.friends_id
                            WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)`;
        const values = [nativeUserId, nativeUserId, nativeUserId, nativeUserId];
        try {
            const [rows] = await this.dbConnection.execute(query, values);

            let friendIds = [];
            for (const row of rows) {
                const friendId = row.user1_id === nativeUserId ? row.user2_id : row.user1_id;
                friendIds.push(friendId);
            }
            
            return friendIds;
        } catch (err) {
            console.error(`Error while fetching chatting friends for native user ${nativeUserId} from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async #checkForeignKeys(data) {
        await this.ready;

        try {
            const [rows1] = await this.dbConnection.execute('SELECT id FROM native_users WHERE id = ?', [data.user1_id]);
            if (!rows1 || rows1.length === 0) {
                return new Error("Invalid user1_id: " + data.user1_id);
            }
        } catch (err) {
            console.error(`Error while checking user1_id ${data.user1_id}: ${err}`);
            throw err;
        }

        try {
            const [rows2] = await this.dbConnection.execute('SELECT id FROM native_users WHERE id = ?', [data.user2_id]);
            if (!rows2 || rows2.length === 0) {
                return new Error("Invalid user2_id: " + data.user2_id);
            }
        } catch (err) {
            console.error(`Error while checking user2_id ${data.user2_id}: ${err}`);
            throw err;
        }

        return true;
    }

    async #checkUniqueConsrain(data) {
        await this.ready;

        try {
            const query = 'SELECT * FROM friends WHERE user1_id = ? AND user2_id = ? OR user1_id = ? AND user2_id = ?';
            const values = [data.user1_id, data.user2_id, data.user2_id, data.user1_id];
            const [rows] = await this.dbConnection.execute(query, values);
            if (rows && rows.length > 0) {
                return new Error(`Friendship already exists between user ${data.user1_id} and user ${data.user2_id}`);
            }
        } catch (err) {
            console.error(`Error while fetching friends for native user ${data.user1_id} from table ${this.tableName}: ${err}`);
            throw err;
        }

        return true
    }
}

module.exports = FriendsController;