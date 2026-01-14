const DatabaseHandler = require("../DatabaseHandler");

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
    constructor(tableStructureFilePath) {
        super('dbName');
        if (tableStructureFilePath.split('.').pop() !== 'sql') {
            throw new Error("Invalid table structure file");
        } 
        this.executeSQLFile(this.dbConnection, tableStructureFilePath);
    }

    async executeSQLFile(connection, filePath) {
        const fs = require('fs');
        const sql = fs.readFileSync(filePath, 'utf8');

        connection.query(sql, function (err, result) {
            if (err) {
                console.error('Error executing SQL file:', err);
                return;
            } 
            console.log('SQL file executed successfully');
        });
    }
}

module.exports = DBMaker;