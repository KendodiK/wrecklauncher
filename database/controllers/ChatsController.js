const Controller = require("./Controller");
const FriendsController = require("./FriendsController");
const NativeUsersController = require("./NativeUsersController");

class ChatsController extends Controller {
    constructor() { 
        super('chats');
    }

    async index() {
        return super.index();
    }

    /**
     * @param {int} id
     */
    async show(id) { 
        return super.show(id);
    }

    /**
     * @param {Array} data - ["friends_id" = firends.id, "message" = string, "sender_id" = native_users.id ]
     */
    async create(data) {
        super.create();

        var foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        const [friends_id, message, sender_id] = data;
        const query = 'INSERT INTO `chats` (friends_id, message, sender_id) VALUES (?,?,?)'
        try {
            const [result] = await this.dbConnection.execute(query, [friends_id, message, sender_id]);
            return { message: `${result.id} Element created in table ${this.tableName}` };
        }
        catch (err) {
            console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * @param {int} id
     * @param {Array} data - ["friends_id" = firends.id, "message" = string, "sender_id" = native_users.id ]
     */
    async update(id, data) {
        super.update();

        var foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }
        
        var old = await this.show(id);

        const query = 'UPDATE `chats` SET friends_id = ?, message = ?, sender_id = ? WHERE id = ?;'
        const values = [
            data.friends_id ?? old.friends_id, 
            data.message ?? old.message, 
            data.sender_id ?? old.sender_id, 
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

    async #checkForeignKeys(data) { 
        var friendsController = new FriendsController();
        var nativeUsersController = new NativeUsersController();

        if (!await friendsController.show(data.friends_id)) {
            return new Error("Invalid friends_id: " + data.friends_id);
        }

        if (!await nativeUsersController.show(data.sender_id)) {
            return new Error("Invalid sender_id: " + data.sender_id);
        }

        return true;
    }
}

module.exports = ChatsController;