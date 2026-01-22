const Controller = require("./Controller");
const crypto = require('crypto');

class NativeUsersController extends Controller {
    tableName = 'native_users';

    constructor() {
        super(this.tableName);
    }

    async show(id) {
        return super.show(id);
    }

    /**
     * 
     * @param {*} data - name, user_password (hashed), pfp (optional)
     */
    async create(data) {
        super.create();

        const query = 'INSERT INTO native_users (token, name, user_password, pfp) VALUES (?, ?, ?, ?);';
        const values = [this.#generateToken(data.name), data.name, data.user_password, data.pfp || null];

        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { id: result.insertId, ...data };
        } catch (err) {
            console.error("Error creating native user:", err);
            throw err;
        }
    }

    /**
     * 
     * @param {*} id 
     * @param {*} data - token (optional true or false), name (optional), user_password (optional), pfp (optional)
     */
    async update(id, data) {
        super.update();

        const name = this.show(id).name;
        
        const query = 'UPDATE native_users SET name = ?, user_password = ?, pfp = ? WHERE id = ?;';
        const values = [data.token ? this.#generateToken(name) : null, data.name || null, data.user_password || null, data.pfp || null, id];

        try {
            await this.dbConnection.execute(query, values.filter(v => v !== null));
            return { message: id + "Updated successfully" };
        } catch (err) {
            console.error("Error updating native user:", err);
            throw err;
        }
    }

    /**
     * generateToken
     *
     * Generates a unique token for a user.
     *
     * @param {string} username - The user's username.
     * @returns {{ token: string } | null} 
     *          Object containing token, or null if user not found.
     */
    #generateToken(username){
        return crypto.createHash('sha256').update(username + crypto.randomUUID()).digest('hex');
    }
}

module.exports = NativeUsersController;