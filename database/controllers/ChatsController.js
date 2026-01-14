const Controller = require("./Controller");

class ChatsController extends Controller {
    constructor() { 
        super('dbName');
    }

    async index() {
        const query = 'SELECT * FROM chats';

        try {
            const [result] = await this.dbConnection.execute(query);
            return result;
        } catch (err) {
            console.log("Error while reading chats:" + err);
            return [];
        }
    }

    /**
     * @param {int} id
     */
    async show(id) { 
        const query = 'SELECT * FROM chats WHERE id = ?';

        try {
            const [result] = await this.dbConnection.execute(query, [id]);
            return result[0];
        } catch (err) {
            console.log("Error while reading chat:" + err);
            return null;
        }
    }

    /**
     * @param {Array} data - [friends_id, message, sender_id]
     */
    async create(data) {
        const [friends_id, message, sender_id] = data;
        const query = 'INSERT INTO `chats` (friends_id, message, sender_id) VALUES (?,?,?)'
        try {
            const [result] = await this.dbConnection.execute(query, [friends_id, message, sender_id]);
            return result;
        }
        catch (err) {
            console.log(err)
        }
    }

    async update(id, data) { }

    async delete(id) { }
}

module.exports = ChatsController;