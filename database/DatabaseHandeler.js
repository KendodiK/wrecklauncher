import { createConnection } from 'mysql2';

export default DatabaseHandler;

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
    mysql = require('mysql');
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
        this.dbConnection = this.mysql.createConnection({
            host: this.DB_HOST,
            port: this.DB_PORT,
            user: this.DB_USERNAME,
            password: this.DB_PASSWORD
        });

        this.dbConnection.connect((err) => {
            if (err) {
                console.error('Error connecting to the database:', err);
                return;
            }
            console.log('Connected to the database.');
        });
    }

    /**
     * Create a new database with the specified name. (or env deffault)
     */
    createDB() {
        this.dbConnection.connect(function(err) {
            con.query(`CREATE DATABASE IF NOT EXISTS ${this.dbName}) `, function (err, result) {
                if (err) throw err;
                console.log(`Database ${this.dbName} created`);
            });
        });
    }

    dropDB() {
        this.dbConnection.connect(function(err) {
            con.query(`DROP DATABASE IF EXISTS ${this.dbName}) `, function (err, result) {
                if (err) throw err;
                console.log(`Database ${this.dbName} dropped`);
            });
        });
    }
}