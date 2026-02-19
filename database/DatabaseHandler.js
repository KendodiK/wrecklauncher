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
        this.dbName = dbName ?? process.env.DB_NAME ?? process.env.MARIADB_DATABASE;
        this.#createDBConnection();
    };

    #cleanEnv(value) {
        if (typeof value !== 'string') return value;
        const v = value.trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            return v.slice(1, -1);
        }
        return v;
    }

    #getBaseConfig() {
        const host = this.#cleanEnv(process.env.DB_HOST ?? process.env.MARIADB_HOST ?? 'localhost');
        const portRaw = this.#cleanEnv(process.env.DB_PORT ?? process.env.MARIADB_PORT ?? '3306');
        const user = this.#cleanEnv(process.env.DB_USERNAME ?? process.env.MARIADB_USER ?? '');
        const password = this.#cleanEnv(
            process.env.DB_PASSWORD ?? process.env.MARIADB_PASSWORD ?? process.env.MARIADB_ROOT_PASSWORD ?? ''
        );

        const port = Number(portRaw || 0) || 3306;

        if (!user) {
            throw new Error(
                'Database credentials missing: set DB_USERNAME/DB_PASSWORD (or MARIADB_USER/MARIADB_PASSWORD) in your .env'
            );
        }

        return { host, port, user, password };
    }

    async #ensureDatabaseExists() {
        if (!this.dbName) {
            throw new Error('Database name missing: set DB_NAME (or MARIADB_DATABASE) in your .env');
        }

        const baseCfg = this.#getBaseConfig();
        const conn = await createConnection({
            host: baseCfg.host,
            port: baseCfg.port,
            user: baseCfg.user,
            password: baseCfg.password,
        });

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
    }

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
                const baseCfg = this.#getBaseConfig();
                const makePool = () =>
                    createPool({
                        host: baseCfg.host,
                        port: baseCfg.port,
                        user: baseCfg.user,
                        password: baseCfg.password,
                        database: this.dbName,
                        waitForConnections: true,
                        connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
                        queueLimit: 0,
                        enableKeepAlive: true,
                    });

                let pool = makePool();

                try {
                    // Validate connectivity early.
                    await pool.query('SELECT 1');
                } catch (err) {
                    const isUnknownDb = err && (err.code === 'ER_BAD_DB_ERROR' || err.errno === 1049);
                    if (isUnknownDb) {
                        try {
                            await pool.end();
                        } catch {
                            // ignore
                        }

                        await this.#ensureDatabaseExists();

                        pool = makePool();
                        await pool.query('SELECT 1');
                    } else {
                        throw err;
                    }
                }

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
        try {
            // Creating a database requires a connection without selecting the database.
            const baseCfg = this.#getBaseConfig();
            const conn = await createConnection({
                host: baseCfg.host,
                port: baseCfg.port,
                user: baseCfg.user,
                password: baseCfg.password,
            });
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
            const baseCfg = this.#getBaseConfig();
            const conn = await createConnection({
                host: baseCfg.host,
                port: baseCfg.port,
                user: baseCfg.user,
                password: baseCfg.password,
            });
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