const Controller = require('./Controller');
const NativeUsersController = require('./NativeUsersController');
const PlatformsController = require('./PlatformsController');

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
     * @param {Array} data - ["native_user_id" = native_users.id, "platform_user_name" = string, "platform_id" = platforms.id, "platform_profile_id" = string, "platform_password" = string ]
     */
    async create(data) {
        await super.create();
        
        let isThereForeignKey = await this.#checkForeignKeys(data)
        if (isThereForeignKey != true) {
            throw isThereForeignKey;
        }       

        const query = 'INSERT INTO platform_users (native_user_id, platform_user_name, platform_id, platform_profile_id, platform_password) VALUES (?, ?, ?, ?, ?);';
        const values = [data.native_user_id, data.platform_user_name, data.platform_id, data.platform_profile_id, data.platform_password];

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
     * @param {int} id 
     * @param {Array} data - ["native_user_id" = native_users.id, "platform_user_name" = string, "platform_id" = platforms.id, "platform_profile_id" = string, "platform_password" = string ]
     */
    async update(id, data) {
        await super.update(); 

        let isThereForeignKey = await this.#checkForeignKeys(data)
        if (isThereForeignKey != true) {
            throw isThereForeignKey;
        }

        const query = 'UPDATE platform_users SET native_user_id = ?, platform_user_name = ?, platform_id = ?, platform_profile_id = ?, platform_password = ? WHERE id = ?;';
        const values = [data.native_user_id, data.platform_user_name, data.platform_id, data.platform_profile_id, data.platform_password, id];

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
     * @param {Array} data - ["native_user_id" = natrive_users.id || null, "platform_id" = platforms.id || null, "platform_name" = string || null, "platform_user_name" = string, "platform_profile_id" = string, "platform_password" = string ]
     */
    async createUserWhithAllForeginData(data) {
        let platformId = null;
        if (data.native_user_id == null) {
            throw new Error("cannot create user whitout password")
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
            "platform_password": data.platform_password
        }
        return await this.create(platformUserData);
    }

    /**
     * Return all platform users by native user id
     * @param {string} nativeUserId 
     * @returns {Array} - platform_users objects 
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

    async #checkForeignKeys(data) {
        var nativeUsersController = new NativeUsersController();
        var platformsController = new PlatformsController();

        if (!await nativeUsersController.show(data.native_user_id)) {
            return new Error("Invalid native user id: " + data.native_user_id);
        }

        if (!await platformsController.show(data.platform_id)) {
            return new Error("Invalid platform id: " + data.platform_id);
        }

        return true;
    }
}

module.exports = PlatformUsersController;