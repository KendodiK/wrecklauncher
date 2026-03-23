const Controller = require('./Controller');

class PlatformUsersController extends Controller {
    constructor() {
        super('platform_users');
    } 

    async index() {
        return super.index();
    }

    async show(id) {
        return super.show(id);
    }

    /**
     * 
     * @param {Array} data - ["native_user_id" = native_users.id, "platform_user_name" = string, "platform_id" = platforms.id, "platform_profile_id" = string, "oauth_token" = string ]
     */
    async create(data) {
        await super.create();
        
        const id = await this.#getIdIfExists(data.native_user_id, data.platform_id, data.platform_profile_id);

        if(id instanceof Error) {
            let isThereForeignKey = await this.#checkForeignKeys(data)
            if (isThereForeignKey != true) {
                throw isThereForeignKey;
            }       

            const query = 'INSERT INTO platform_users (native_user_id, platform_user_name, platform_id, platform_profile_id, oauth_token) VALUES (?, ?, ?, ?, ?);';
            const values = [data.native_user_id, data.platform_user_name, data.platform_id, data.platform_profile_id, data.oauth_token];

            try {
                const [result] = await this.dbConnection.execute(query, values);
                return { message: `Element created in table ${this.tableName}`, id: result.insertId };
            } catch (err) {
                console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
                throw err;
            }
        }

        return { message: `Element already exists in talbe ${this.tableName}`, id: id};
        
    }

    /**
     * 
     * @param {int} id 
     * @param {Array} data - ["native_user_id" = native_users.id, "platform_user_name" = string, "platform_id" = platforms.id, "platform_profile_id" = string, "oauth_token" = string ]
     */
    async update(id, data) {
        await super.update(); 

        let isThereForeignKey = await this.#checkForeignKeys(data)
        if (isThereForeignKey != true) {
            throw isThereForeignKey;
        }

        let old = await this.show(id); 

        const query = 'UPDATE platform_users SET native_user_id = ?, platform_user_name = ?, platform_id = ?, platform_profile_id = ?, oauth_token = ? WHERE id = ?;';
        const values = [
            data.native_user_id ?? old.nativeUserId, 
            data.platform_user_name ?? old.platform_user_name, 
            data.platform_id ?? old.platform_id, 
            data.platform_profile_id ?? old.platform_profile_id, 
            data.platform_password ?? old.oauth_token, 
            id];

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
     * Deletes a platform user row only if it belongs to the provided native user.
     * @param {string|number} nativeUserId
     * @returns {{ deleted: boolean, affectedRows: number, id: number, nativeUserId: string|number }}
     */
    async deleteByNativeUserId(nativeUserId) {
        await this.ready;

        const query = 'DELETE FROM platform_users WHERE native_user_id = ?;';
        const values = [id, nativeUserId];

        try {
            const [result] = await this.dbConnection.execute(query, values);
            const affectedRows = Number(result?.affectedRows || 0);
            return {
                deleted: affectedRows > 0,
                affectedRows,
                id: Number(id),
                nativeUserId,
            };
        } catch (err) {
            console.error(`Error while deleting platform user ${id} for native user ${nativeUserId}: ${err}`);
            throw err;
        }
    }

    /**
     * 
     * @param {Array} data - ["native_user_id" = natrive_users.id || null, "platform_id" = platforms.id || null, "platform_name" = string || null, "platform_user_name" = string, "platform_profile_id" = string, "oauth_token" = string ]
     */
    async createUserWhithAllForeginData(data) {
        let platformId = null;
        if (data.native_user_id == null) {
            throw new Error("cannot create user whitout native user")
        }
        if (data.platform_id == null && data.platform_name != null) { 
            let platformsController = new PlatformsController();
            let platformData = {
                "name": data.platform_name
            }
            let platformCreateResponse = await platformsController.create(platformData);
            if (platformCreateResponse instanceof Error) {
                throw new Error("Cannot create user: " + platformCreateResponse.message);
            }
            platformId = platformCreateResponse.id;
        }
        let platformUserData = {
            "native_user_id": data.native_user_id,
            "platform_user_name": data.platform_user_name,
            "platform_id": platformId || data.platform_id,
            "platform_profile_id": data.platform_profile_id,
            "oauth_token": data.oauth_token
        }
        return await this.create(platformUserData);
    }

    /**
     * Return all platform users by native user id
     * @param {string} nativeUserId 
     * @returns {Array} - platform_users table rows 
     */
    async getByNativeUserId(nativeUserId) {
        await super.waitForConnection();
        await super.selectDatabase();

        const query = 'SELECT * FROM platform_users WHERE native_user_id = ?;';
        const values = [nativeUserId];
        try {
            const [rows] = await this.dbConnection.execute(query, values);
            return rows;
        } catch (err) {
            console.error(`Error while fetching platform users by native user id from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async #getIdIfExists(nativeUserId, platformId, platformProfileId) {
        await super.waitForConnection();
        await super.selectDatabase();

        const query = 'SELECT id FROM platform_users WHERE native_user_id = ? AND platform_id = ? AND platform_profile_id = ? LIMIT 1;';
        const values = [nativeUserId, platformId, platformProfileId];
        try {
            const [rows] = await this.dbConnection.execute(query, values);
            if (!rows || rows.length === 0 || rows[0]?.id == null) {
                return new Error('Element not found');
            }
            return rows[0].id;
        } catch (err) {
            console.error(`Error while fetching platform users by native user id from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async #checkForeignKeys(data) {
        await this.ready;

        try {
            const [userRows] = await this.dbConnection.execute('SELECT id FROM native_users WHERE id = ?', [data.native_user_id]);
            if (!userRows || userRows.length === 0) {
                return new Error("Invalid native user id: " + data.native_user_id);
            }
        } catch (err) {
            console.error(`Error while checking native_user_id ${data.native_user_id}: ${err}`);
            throw err;
        }

        try {
            const [platRows] = await this.dbConnection.execute('SELECT id FROM platforms WHERE id = ?', [data.platform_id]);
            if (!platRows || platRows.length === 0) {
                return new Error("Invalid platform id: " + data.platform_id);
            }
        } catch (err) {
            console.error(`Error while checking platform_id ${data.platform_id}: ${err}`);
            throw err;
        }

        return true;
    }
}

module.exports = PlatformUsersController;