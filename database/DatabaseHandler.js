const { createConnection } = require('mysql2/promise');

/**
 * DatabaseHandler 
 * 
 * class to manage database connections and operations.
 * @var dbConnection - database connection object
 */
class DatabaseHandler {
    DB_HOST = process.env.DB_HOST;
    DB_PORT = process.env.DB_PORT;
    DB_USERNAME = process.env.DB_USERNAME;
    DB_PASSWORD = process.env.DB_PASSWORD;
    dbConnection;

    /**
     * Constructor for DatabaseHandler
     * @param {string} dbName - Name of the database to connect to. If null, uses default from environment variables.
     */
    constructor(dbName = null) {
        this.dbName = dbName ?? process.env.DB_NAME;
        this.#createDBConnection();
    };

    /**
     * @private Private method to create a database connection.
     */
    #createDBConnection() {
        this.connectionPromise = (async () => {
            try {
                this.dbConnection = await createConnection({
                    host: this.DB_HOST,
                    port: this.DB_PORT,
                    user: this.DB_USERNAME,
                    password: this.DB_PASSWORD
                });
                return this.dbConnection;
            } catch (err) {
                console.error('Error connecting to the database:', err);
                throw err;
            }
        })();
    }

    /**
     * Wait for the database connection to be established.
     */
    async waitForConnection() {
        await this.connectionPromise;
    }

    async selectDatabase() {
        try {
            await this.dbConnection.execute(`USE \`${this.dbName}\``); 
        } catch (err) {
            console.error(`Error selecting database ${this.dbName}:`, err);
            throw err;
        }
    }

    /**
     * Create a new database with the specified name. (or env deffault)
     */
    async createDB() {
        await this.waitForConnection();
        try {
            const sql = `CREATE DATABASE IF NOT EXISTS \`${this.dbName}\``;
            await this.dbConnection.execute(sql);
            console.log(`Database ${this.dbName} created or already exists`);
        } catch (err) {
            console.error('Error creating database:', err);
            console.error(err);
            throw err;
        }
    }

    async dropDB() {
        try {
            const sql = `DROP DATABASE IF EXISTS \`${this.dbName}\``;
            await this.dbConnection.execute(sql);
            console.log(`Database ${this.dbName} dropped`);
        } catch (err) {
            console.error('Error dropping database:', err);
            throw err;
        }
    }
}

module.exports = DatabaseHandler;