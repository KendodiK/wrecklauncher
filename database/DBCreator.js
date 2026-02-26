const DatabaseHandler = require("./DatabaseHandler");
const ChatsTableMaker = require("./makers/ChatsTableMaker");
const FriendsTableMaker = require("./makers/FriendsTableMaker");
const GamesGenresConnectionTableMaker = require("./makers/GamesGenresConnectionTableMaker");
const GamesPirateSitesConnectionTableMaker = require("./makers/GamesPirateSitesConnectionTableMaker");
const GamesTableMaker = require("./makers/GamesTableMaker");
const GenresTableMaker = require("./makers/GenresTableMaker");
const NativeUserTableMaker = require("./makers/NativeUserTableMaker");
const PirateSitesTableMaker = require("./makers/PirateSitesTableMaker");
const PlatformsTableMaker = require("./makers/PlatformsTableMaker");
const PlatformUsersTableMaker = require("./makers/PlatformUsersTableMaker");
const ShopSpecialsTableMaker = require("./makers/ShopSpecialsTableMaker");

/**
 * DBMaker
 * 
 * Class for initializing a database with a given table structure.
 * Extends DatabaseHandler to utilize database connection functionalities.
 * 
 * @param {string} dbName - The name of the database to connect to.
 * @param {string} tableStructureFilePath - The file path to the SQL file containing table structures.
 */
class DBMaker extends DatabaseHandler {
    chatsMkr = new ChatsTableMaker();
    friendsMkr = new FriendsTableMaker();
    gamesGenresConnectionMkr = new GamesGenresConnectionTableMaker();
    gamesPirateSitesConnectionMkr = new GamesPirateSitesConnectionTableMaker();
    gamesMkr = new GamesTableMaker();
    genresMkr = new GenresTableMaker();
    nativeUserMkr = new NativeUserTableMaker();
    pirateSitesMkr = new PirateSitesTableMaker();
    platformsMkr = new PlatformsTableMaker();
    platformUsersMkr = new PlatformUsersTableMaker();
    shopSpecialsMkr = new ShopSpecialsTableMaker();

    constructor(tableStructureFilePath = null) {
        super();
    }

    /**
     * This method is not tested, use at your own risk.
     * @param {string} filePath - Path to the SQL file
     */
    async executeSQLFile(filePath) {
        if (filePath.split('.').pop() !== 'sql') {
                throw new Error("Invalid table structure file");
        } 
        const fs = require('fs');
        const sql = fs.readFileSync(filePath, 'utf8');
        const connection = this.dbConnection;

        connection.query(sql, function (err, result) {
            if (err) {
                console.error('Error executing SQL file:', err);
                return;
            } 
            console.log('SQL file executed successfully');
        });
    }

    async createTables() { 
        await this.chatsMkr.create();
        await this.friendsMkr.create();
        await this.gamesGenresConnectionMkr.create();
        await this.gamesPirateSitesConnectionMkr.create();
        await this.gamesMkr.create();
        await this.genresMkr.create();
        await this.nativeUserMkr.create();
        await this.pirateSitesMkr.create();
        await this.platformsMkr.create();
        await this.platformUsersMkr.create();
        await this.shopSpecialsMkr.create();
    }

    async deleteTables() {
        await this.chatsMkr.delete();
        await this.friendsMkr.delete();
        await this.gamesGenresConnectionMkr.delete();
        await this.gamesPirateSitesConnectionMkr.delete();
        await this.gamesMkr.delete();
        await this.genresMkr.delete();
        await this.nativeUserMkr.delete();
        await this.pirateSitesMkr.delete();
        await this.platformsMkr.delete();
        await this.platformUsersMkr.delete();
        await this.shopSpecialsMkr.delete();
    }
}

module.exports = DBMaker;