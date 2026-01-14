const Controller = require("./Controller");

class FriendsController extends Controller {
    constructor() { 
        super('dbName');
    }

    async index() {
        const query = 'SELECT * FROM friends';
        try {
            const [result] = await this.dbConnection.execute(query);
            return result;
        } catch (err) {
            console.log("Error while reading friends:" + err);
            return [];
        } 
    }

    async show(id) {}


    /**
     * 
     * @param {*} data - [user1_id, user2_id]
     */
    async create(data) {
        const [user1_id, user2_id] = data;
        const query = 'INSERT INTO `friends` (user1_id, user2_id) VALUES (?,?)'
        try {
            const [result] = await this.dbConnection.execute(query, [user1_id, user2_id]);
            return result;
        }
        catch (err) {
            console.log(err)
        }
    }
}

module.exports = FriendsController;