const { createPool, createConnection } = require('mysql2/promise');

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

    /** @type {Map<string, import('mysql2/promise').Pool>} */
    static pools = new Map();

    /** @type {Map<string, Promise<import('mysql2/promise').Pool>>} */
    static poolPromises = new Map();

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
        const dbKey = String(this.dbName || '');

        const existing = DatabaseHandler.pools.get(dbKey);
        if (existing) {
            this.dbConnection = existing;
            this.connectionPromise = Promise.resolve(existing);
            return;
        }

        const existingPromise = DatabaseHandler.poolPromises.get(dbKey);
        if (existingPromise) {
            this.connectionPromise = existingPromise.then((pool) => {
                this.dbConnection = pool;
                return pool;
            });
            return;
        }

        const poolPromise = (async () => {
            try {
                const fs = require('fs');
                const hostOrig = this.DB_HOST || process.env.DB_HOST || process.env.MARIADB_HOST || 'db';
                const port = Number(this.DB_PORT || process.env.DB_PORT || process.env.DB_PORT_HOST || 3306);
                const user = this.DB_USERNAME || process.env.DB_USERNAME || process.env.DB_USER || process.env.MARIADB_USER || 'root';
                const password = this.DB_PASSWORD || process.env.DB_PASSWORD || process.env.MARIADB_PASSWORD || process.env.MARIADB_ROOT_PASSWORD || '';

                // detect container runtime via /.dockerenv or /.dockerinit
                let runningInContainer = false;
                try {
                    runningInContainer = fs.existsSync('/.dockerenv') || fs.existsSync('/.dockerinit');
                } catch (e) {
                    runningInContainer = false;
                }

                let host = hostOrig;
                if ((host === '127.0.0.1' || host === 'localhost' || host === '::1') && runningInContainer) {
                    console.log(`Detected container runtime and localhost DB host; remapping host '${host}' -> 'db'`);
                    host = 'db';
                }

                console.log('DB connection params:', { host, port, user, passwordPresent: !!password, envDB_HOST: process.env.DB_HOST, hostOrig });

                const pool = createPool({
                    host,
                    port,
                    user,
                    password,
                    database: this.dbName,
                    waitForConnections: true,
                    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
                    queueLimit: 0,
                    enableKeepAlive: true,
                });

                // Validate connectivity early.
                await pool.query('SELECT 1');

                DatabaseHandler.pools.set(dbKey, pool);
                return pool;
            } catch (err) {
                DatabaseHandler.poolPromises.delete(dbKey);
                console.error('Error creating database pool:', err);
                throw err;
            }
        })();

        DatabaseHandler.poolPromises.set(dbKey, poolPromise);
        this.connectionPromise = poolPromise.then((pool) => {
            this.dbConnection = pool;
            return pool;
        });
    }

    /**
     * Return the pool (creating it if necessary).
     */
    async getPool() {
        await this.waitForConnection();
        return this.dbConnection;
    }

    /**
     * Convenience wrapper for simple queries using the pool.
     * Returns the result of `pool.execute(sql, params)`.
     */
    async query(sql, params = []) {
        await this.waitForConnection();
        return this.dbConnection.execute(sql, params);
    }

    /**
     * Run a callback with a dedicated connection from the pool (auto-releases).
     * Callback receives the connection object which supports `execute`, `beginTransaction`, etc.
     */
    async withConnection(fn) {
        const pool = await this.getPool();
        const conn = await pool.getConnection();
        try {
            return await fn(conn);
        } finally {
            try { conn.release(); } catch (_) { /* ignore */ }
        }
    }

    /**
     * Run a callback inside a transaction. Commits on success, rollbacks on error.
     */
    async withTransaction(fn) {
        const pool = await this.getPool();
        const conn = await pool.getConnection();
        try {
            await conn.beginTransaction();
            const result = await fn(conn);
            await conn.commit();
            return result;
        } catch (err) {
            try { await conn.rollback(); } catch (_) {}
            throw err;
        } finally {
            try { conn.release(); } catch (_) {}
        }
    }

    /**
     * Wait for the database connection to be established.
     */
    async waitForConnection() {
        await this.connectionPromise;
    }

    async selectDatabase() {
        // With pooled connections we set the default database on the pool.
        // Keep this method for backward compatibility with existing controllers.
        return;
    }

    /**
     * Create a new database with the specified name. (or env deffault)
     */
    async createDB() {
        await this.waitForConnection();
        try {
            // Creating a database requires a connection without selecting the database.
            const fs = require('fs');
            const hostOrig = this.DB_HOST || process.env.DB_HOST || process.env.MARIADB_HOST || 'db';
            const port = Number(this.DB_PORT || process.env.DB_PORT || process.env.DB_PORT_HOST || 3306);
            const user = this.DB_USERNAME || process.env.DB_USERNAME || process.env.DB_USER || process.env.MARIADB_USER || 'root';
            const password = this.DB_PASSWORD || process.env.DB_PASSWORD || process.env.MARIADB_PASSWORD || process.env.MARIADB_ROOT_PASSWORD || '';
            let runningInContainer = false;
            try { runningInContainer = fs.existsSync('/.dockerenv') || fs.existsSync('/.dockerinit'); } catch (e) { runningInContainer = false; }
            let host = hostOrig;
            if ((host === '127.0.0.1' || host === 'localhost' || host === '::1') && runningInContainer) {
                console.log(`Detected container runtime and localhost DB host; remapping host '${host}' -> 'db'`);
                host = 'db';
            }
            console.log('DB createDB params:', { host, port, user, passwordPresent: !!password, hostOrig });
            const conn = await createConnection({ host, port, user, password });
            try {
                const sql = `CREATE DATABASE IF NOT EXISTS \`${this.dbName}\``;
                await conn.execute(sql);
            } finally {
                try {
                    await conn.end();
                } catch {
                    // ignore
                }
            }
            console.log(`Database ${this.dbName} created or already exists`);
        } catch (err) {
            console.error('Error creating database:', err);
            console.error(err);
            throw err;
        }
    }

    async dropDB() {
        try {
            const fs = require('fs');
            const hostOrig = this.DB_HOST || process.env.DB_HOST || process.env.MARIADB_HOST || 'db';
            const port = Number(this.DB_PORT || process.env.DB_PORT || process.env.DB_PORT_HOST || 3306);
            const user = this.DB_USERNAME || process.env.DB_USERNAME || process.env.DB_USER || process.env.MARIADB_USER || 'root';
            const password = this.DB_PASSWORD || process.env.DB_PASSWORD || process.env.MARIADB_PASSWORD || process.env.MARIADB_ROOT_PASSWORD || '';
            let runningInContainer = false;
            try { runningInContainer = fs.existsSync('/.dockerenv') || fs.existsSync('/.dockerinit'); } catch (e) { runningInContainer = false; }
            let host = hostOrig;
            if ((host === '127.0.0.1' || host === 'localhost' || host === '::1') && runningInContainer) {
                console.log(`Detected container runtime and localhost DB host; remapping host '${host}' -> 'db'`);
                host = 'db';
            }
            console.log('DB dropDB params:', { host, port, user, passwordPresent: !!password, hostOrig });
            const conn = await createConnection({ host, port, user, password });
            try {
                const sql = `DROP DATABASE IF EXISTS \`${this.dbName}\``;
                await conn.execute(sql);
            } finally {
                try {
                    await conn.end();
                } catch {
                    // ignore
                }
            }
            console.log(`Database ${this.dbName} dropped`);
        } catch (err) {
            console.error('Error dropping database:', err);
            throw err;
        }
    }
}

module.exports = DatabaseHandler;