const Controller = require("./Controller");
const crypto = require('crypto');

class NativeUsersController extends Controller {
    constructor() {
        super('native_users');
    }

    async index() {
        return super.index();
    }

    /**
     * 
     * @param {string} id - uuid of the user
     * @returns 
     */
    async show(id) {
        return super.show(id);
    }

    /**
     * 
     * @param {Array} data - name, user_password, pfp (optional)
     */
    async create(data) {
        await super.create();

        console.log(data.name);
        console.log(data.user_password);

        const query = 'INSERT INTO native_users (token, name, user_password, pfp) VALUES (?, ?, ?, ?);';
        const values = [this.#generateToken(data.name), data.name, this.#hashPassword(data.user_password), data.pfp || null];

        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `${result.id} Element created in table ${this.tableName}` };
        } catch (err) {
            console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * 
     * @param {string} id - uuid of the user
     * @param {Array} data - token (optional true or false), name (optional), user_password (optional), pfp (optional)
     */
    async update(id, data) {
        await super.update();
        let old = await this.show(id); 

        let name = data.name ?? old.name;
        let token = data.token ? await this.#generateToken(name) : old.token;
        
        const query = 'UPDATE native_users SET token = ?, name = ?, user_password = ?, pfp = ? WHERE id = ?;';
        const values = [token, name, data.user_password ?? old.user_password, data.pfp ?? old.pfp, id];

        try {
            await this.dbConnection.execute(query, values);
            return { message: `${id} Updated successfully in table ${this.tableName}` };
        } catch (err) {
            console.error(`Error while updating element in table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * 
     * @param {string} id - uuid of the user
     * @returns 
     */
    async delete(id) {
        return super.delete(id);
    }

    /**
     * 
     * @param {string} name - username
     * @param {string} password - not hashed password
     * @returns {Array} - native_user object
     */
    async getUserByNameAndPassword(name, password) {
        await this.waitForConnection();
        await this.selectDatabase();

        const query = 'SELECT * FROM native_users WHERE name = ? AND user_password = ?';
        const values = [name, this.#hashPassword(password)];

        try {
            const [rows] = await this.dbConnection.execute(query, values);
            return rows[0];
        } catch (err) {
            console.error(`Error while fetching user by name and password: ${err}`);
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

    #hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }
    
}

module.exports = NativeUsersController;