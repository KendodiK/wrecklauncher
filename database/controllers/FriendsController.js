const Controller = require("./Controller");
const NativeUsersController = require("./NativeUsersController");

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
     */
    async create(data) {
        super.create();

        var foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        const query = 'INSERT INTO `friends` (user1_id, user2_id) VALUES (?,?)'
        const values = [data.user1_id, data.user2_id];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return {message: "Friendship created", id: result.insertId};
        }
        catch (err) {
            console.error("Error while adding to database: " + err)
            throw err;
        }
    }

    /**
     * @param {int} id
     * @param {Array} data - ["user1_id" = native_users.id, "user2_id" = native_users.id ]
     */
    async update(id, data) {
        super.update();
        
        var foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        const query = 'UPDATE `friends` SET user1_id = ?, user2_id = ? WHERE id = ?;'
        const values = [data.user1_id, data.user2_id, id];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: id + " Updated successfully" };
        }
        catch (err) {
            console.error("Error while updating database:" + err)
            throw err;
        }
    }

    async delete(id) {
        return super.delete(id);
    }

    async #checkForeignKeys(data) { 
        var nativeUsersController = new NativeUsersController();

        if (!await nativeUsersController.show(data.user1_id)) {
            return new Error("Invalid user1_id: " + data.user1_id);
        }

        if (!await nativeUsersController.show(data.user2_id)) {
            return new Error("Invalid user2_id: " + data.user2_id);
        }

        return true;
    }
}

module.exports = FriendsController;