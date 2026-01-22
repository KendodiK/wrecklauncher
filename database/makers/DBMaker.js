const DatabaseHandler = require("../DatabaseHandler");
const ChatsTableCreator = require("../creators/ChatsTableCreator");
const FriendsTableCreator = require("../creators/FriendsTableCreator");
const GamesGenresConnectionTableCreator = require("../creators/GamesGenresConnectionTableCreator");
const GamesPirateSitesConnectionTableCreator = require("../creators/GamesPirateSitesConnectionTableCreator");
const GamesTableCreator = require("../creators/GamesTableCreator");
const GenresTableCreator = require("../creators/GenresTableCreator");
const NativeUserTableCreator = require("../creators/NativeUserTableCreator");
const PirateSitesTableCreator = require("../creators/PirateSitesTableCreator");
const PlatformsTableCreator = require("../creators/PlatformsTableCreator");
const PlatformUsersTableCreator = require("../creators/PlatformUsersTableCreator");

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
        const chatsTableCreator = new ChatsTableCreator();
        const friendsTableCreator = new FriendsTableCreator();
        const gamesGenresConnectionTableCreator = new GamesGenresConnectionTableCreator();
        const gamesPirateSitesConnectionTableCreator = new GamesPirateSitesConnectionTableCreator();
        const gamesTableCreator = new GamesTableCreator();
        const genresTableCreator = new GenresTableCreator();
        const nativeUserTableCreator = new NativeUserTableCreator();
        const pirateSitesTableCreator = new PirateSitesTableCreator();
        const platformsTableCreator = new PlatformsTableCreator();
        const platformUsersTableCreator = new PlatformUsersTableCreator();
    }
}

module.exports = DBMaker;