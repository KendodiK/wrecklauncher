const Controller = require("./Controller");
const crypto = require('crypto');

class NativeUsersController extends Controller {
    constructor() {
        super('native_users');
    }

    async index() {
        return super.index();
    }

    async show(id) {
        return super.show(id);
    }

    /**
     * 
     * @param {any} data - Supports legacy shape ({ name, user_password, ... })
     *                    and API shape ({ username, password, email, ... }).
     */
    async create(data) {
        await super.create();

        const name = String(data?.name ?? data?.username ?? '').trim();
        const password = String(data?.user_password ?? data?.password ?? '').trim();
        const email = String(data?.email ?? '').trim();
        const bio = data && Object.prototype.hasOwnProperty.call(data, 'bio') ? (data.bio == null ? null : String(data.bio)) : null;
        const pfp = data && Object.prototype.hasOwnProperty.call(data, 'pfp') ? (data.pfp == null ? null : String(data.pfp)) : null;

        if (!name) throw new Error('NativeUsersController.create: username/name is required');
        if (!password) throw new Error('NativeUsersController.create: password is required');
        if (!email) throw new Error('NativeUsersController.create: email is required');

        const token = this.#generateToken(name);
        const query = 'INSERT INTO native_users (token, name, user_password, email, bio, pfp) VALUES (?, ?, ?, ?, ?, ?);';
        const values = [token, name, this.#hashPassword(password), email, bio, pfp];

        try {
            await this.dbConnection.execute(query, values);
            const created = await this.getUserByName(name);
            if (!created) throw new Error('NativeUsersController.create: insert succeeded but user could not be loaded');
            return created;
        } catch (err) {
            console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * 
     * @param {int} id 
     * @param {any} data - token (optional true), name (optional), user_password/password (optional), email (optional), bio (optional), pfp (optional)
     */
    async update(id, data) {
        await super.update();

        const user = await this.show(id);
        if (!user) throw new Error(`NativeUsersController.update: user not found: ${id}`);

        /** @type {string[]} */
        const sets = [];
        /** @type {any[]} */
        const values = [];

        if (data?.token === true) {
            sets.push('token = ?');
            values.push(this.#generateToken(user.name));
        }

        if (typeof data?.name === 'string' && data.name.trim()) {
            sets.push('name = ?');
            values.push(data.name.trim());
        }

        const nextPassword = data?.user_password ?? data?.password;
        if (typeof nextPassword === 'string' && nextPassword.trim()) {
            sets.push('user_password = ?');
            values.push(this.#hashPassword(nextPassword.trim()));
        }

        if (typeof data?.email === 'string' && data.email.trim()) {
            sets.push('email = ?');
            values.push(data.email.trim());
        }

        if (data && Object.prototype.hasOwnProperty.call(data, 'bio')) {
            sets.push('bio = ?');
            values.push(data.bio == null ? null : String(data.bio));
        }

        if (data && Object.prototype.hasOwnProperty.call(data, 'pfp')) {
            sets.push('pfp = ?');
            values.push(data.pfp == null ? null : String(data.pfp));
        }

        if (!sets.length) {
            return { message: `${id} No fields to update in table ${this.tableName}` };
        }

        const query = `UPDATE native_users SET ${sets.join(', ')} WHERE id = ?;`;
        values.push(id);

        try {
            await this.dbConnection.execute(query, values);
            return { message: `${id} Updated successfully in table ${this.tableName}` };
        } catch (err) {
            console.error(`Error while updating element in table ${this.tableName}: ${err}`);
            throw err;
        }
    }

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
        await this.ready;

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
     * @param {string} name
     * @returns {Promise<any|null>}
     */
    async getUserByName(name) {
        await this.ready;

        const clean = String(name || '').trim();
        if (!clean) return null;

        const query = 'SELECT * FROM native_users WHERE name = ? LIMIT 1;';
        try {
            const [rows] = await this.dbConnection.execute(query, [clean]);
            // @ts-ignore
            return rows[0] || null;
        } catch (err) {
            console.error(`Error while fetching user by name: ${err}`);
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