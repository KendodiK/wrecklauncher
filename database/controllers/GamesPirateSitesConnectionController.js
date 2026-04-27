const Controller = require('./Controller');
const PirateSitesController = require('./PirateSitesController');
// Validate via DB queries to avoid circular controller requires

class GamesPirateSitesConncectionController extends Controller {
    constructor() {
        super('game_pirates_sites_connections');
    }

    async index() {
        return super.index();
    }

    async show(gameId, siteId) {
        await this.ready;

        const query = `SELECT * FROM ${this.tableName} WHERE game_id = ? AND site_id = ?;`;
        try {
            const [rows] = await this.dbConnection.execute(query, [gameId, siteId]);
            return rows[0];
        } catch (err) {
            console.error(`Error while selecting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * 
     * @param {Array} data - ["game_id" = games.id, "pirate_site_id" = pirate_sites.id, "link" = string ]
     * @returns 
     */
    async create(data) {
        await super.create();

        data.link = this.#normalizeLinkForStorage(data?.link);
        if (!data.link) {
            throw new Error('link is required');
        }

        let foreignKeyCheck = await this.#checkForeignKeys(data);
        if (foreignKeyCheck instanceof Error) {
            throw foreignKeyCheck;
        }

        let duplicateCheck = await this.#checkUniqueConstraint(data);
        if (duplicateCheck instanceof Error) {
            throw duplicateCheck;
        }

        const query = 'INSERT INTO `game_pirates_sites_connections` (game_id, site_id, link) VALUES (?, ?, ?)';
        const values = [data.game_id, data.site_id, data.link];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `${result.insertId} Element created in table ${this.tableName}`, id: result.insertId };
        } catch (err) {
            console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    /**
     * Update an existing connection. game_id and pirate_site_id are used to identify the connection, and cannot be updated.
     * @param {Array} data - ["game_id" = games.id, "pirate_site_id" = pirate_sites.id, "link" = string ]
     * @returns 
     */
    async update(data) {
        await super.update();

        data.link = this.#normalizeLinkForStorage(data?.link);
        if (!data.link) {
            throw new Error('link is required');
        }

        let old = await this.show(data.game_id, data.site_id);

        if (!old) {
            throw new Error(`Element with id given data not found in table ${this.tableName}`);
        }

        const query = 'UPDATE `game_pirates_sites_connections` SET link = ? WHERE game_id = ? AND site_id = ?;';
        const values = [
            data.link ?? old.link, 
            data.game_id, 
            data.site_id
        ];

        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `Updated successfully in table ${this.tableName}` };
        } catch (err) {
            console.error(`Error while updating element in table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async delete(gameId, siteId) {
        await this.ready;

        const query = `DELETE FROM ${this.tableName} WHERE  game_id = ? AND site_id = ?;`;
        try {
            await this.dbConnection.execute(query, [gameId, siteId]);
            return { message: `Element deleted successfully from ${this.tableName}` };
        } catch (err) {
            console.error(`Error while deleting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async deleteByGameId(gameId) {
        await this.ready;

        const query = `DELETE FROM ${this.tableName} WHERE  game_id = ?;`;
        try {
            await this.dbConnection.execute(query, [gameId]);
            return { message: `Elements deleted successfully from ${this.tableName} for game_id ${gameId}` };
        } catch (err) {
            console.error(`Error while deleting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async deleteBySiteId(siteId) {
        await this.ready;

        const query = `DELETE FROM ${this.tableName} WHERE  site_id = ?;`;
        try {
            await this.dbConnection.execute(query, [siteId]);
            return { message: `Elements deleted successfully from ${this.tableName} for site_id ${siteId}` };
        } catch (err) {
            console.error(`Error while deleting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async getConnectionsByGameId(gameId) {
        await this.ready;

        const query = `SELECT ps.name AS site_name, gpsc.link
                       FROM game_pirates_sites_connections AS gpsc
                       JOIN pirate_sites AS ps ON gpsc.site_id = ps.id
                       WHERE gpsc.game_id = ?;`;
        try {
            const [rows] = await this.dbConnection.execute(query, [gameId]);
            return rows;
        } catch (err) {
            console.error(`Error while selecting from table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async createWithAll(data) {
        await super.create();

        const gameId = Number(data?.game_id ?? data?.gameId ?? null);
        const siteName = typeof data?.site_name === 'string' ? data.site_name.trim() : '';

        let resolvedSiteId = Number(
            data?.site_id ?? data?.pirate_site_id ?? data?.siteId ?? data?.pirateSiteId ?? null
        );
        if (!Number.isFinite(resolvedSiteId) || resolvedSiteId <= 0) {
            resolvedSiteId = null;
        }

        if (!Number.isFinite(gameId) || gameId <= 0) {
            throw new Error("game_id and pirate_site_id are required");
        }

        if (!resolvedSiteId && siteName) {
            const pirateSitesController = new PirateSitesController();
            let site = await pirateSitesController.getByName(siteName);
            if (!site || site instanceof Error) {
                site = await pirateSitesController.create({ "name": siteName });
            }

            const createdId = Number(site?.id ?? null);
            if (Number.isFinite(createdId) && createdId > 0) {
                resolvedSiteId = createdId;
            }
        }

        if (!resolvedSiteId) {
            throw new Error("game_id and pirate_site_id are required");
        }

        const normalizedLink = this.#normalizeLinkForStorage(data?.link);
        if (!normalizedLink) {
            throw new Error('link is required');
        }

        data.game_id = gameId;
        data.site_id = resolvedSiteId;
        data.pirate_site_id = resolvedSiteId;
        data.link = normalizedLink;

        // If the connection already exists for this game+site pair, keep one row
        // and refresh its link instead of returning a duplicate error.
        const existingConnection = await this.show(gameId, resolvedSiteId);
        if (existingConnection) {
            const existingNormalizedLink = this.#normalizeLinkForStorage(existingConnection?.link);
            if (existingNormalizedLink === normalizedLink) {
                return {
                    message: `Element already exists in table ${this.tableName}`,
                    updated: false,
                    unchanged: true,
                };
            }

            const updateResult = await this.update({
                game_id: gameId,
                site_id: resolvedSiteId,
                link: normalizedLink,
            });

            return {
                ...updateResult,
                updated: true,
            };
        }

        let duplicateCheck = await this.#checkUniqueConstraint(data);
        if (duplicateCheck instanceof Error) {
            throw duplicateCheck;
        }

        const query = 'INSERT INTO `game_pirates_sites_connections` (game_id, site_id, link) VALUES (?, ?, ?)';
        const values = [gameId, resolvedSiteId, data.link];
        try {
            const [result] = await this.dbConnection.execute(query, values);
            return { message: `${result.insertId} Element created in table ${this.tableName}`, id: result.insertId };
        } catch (err) {
            console.error(`Error while adding new element to table ${this.tableName}: ${err}`);
            throw err;
        }
    }

    async #checkForeignKeys(data) {
        await this.ready;

        try {
            const [gameRows] = await this.dbConnection.execute('SELECT id FROM games WHERE id = ?', [data.game_id]);
            if (!gameRows || gameRows.length === 0) {
                return new Error("Invalid game id: " + data.game_id);
            }
        } catch (err) {
            console.error(`Error while checking game id ${data.game_id}: ${err}`);
            throw err;
        }

        try {
            const [siteRows] = await this.dbConnection.execute('SELECT id FROM pirate_sites WHERE id = ?', [data.site_id]);
            if (!siteRows || siteRows.length === 0) {
                return new Error("Invalid pirate site id: " + data.site_id);
            }
        } catch (err) {
            console.error(`Error while checking pirate_site_id ${data.site_id}: ${err}`);
            throw err;
        }

        return true;
    }

    async #checkUniqueConstraint(data) {
        await this.ready;

        try {
            const [existingRows] = await this.dbConnection.execute('SELECT * FROM game_pirates_sites_connections WHERE game_id = ? AND site_id = ?', [data.game_id, data.site_id]);
            if (existingRows && existingRows.length > 0) {
                return new Error("Duplicate entry for game_id and pirate_site_id");
            }
        } catch (err) {
            console.error(`Error while checking unique constraint for game_id ${data.game_id} and pirate_site_id ${data.site_id}: ${err}`);
            throw err;
        }

        return true;
    }

    /**
        * Keep links within DB limits while preserving full magnet links in normal cases.
     * @param {unknown} rawLink
     * @param {number} [maxLength]
     * @returns {string}
     */
    #normalizeLinkForStorage(rawLink, maxLength = 16000) {
        const link = String(rawLink ?? '').trim();
        if (!link) return '';
        if (link.length <= maxLength) return link;

        if (/^magnet:\?/i.test(link)) {
            try {
                const query = link.slice((link.indexOf('?') + 1) || 0);
                const params = new URLSearchParams(query);
                const xt = params.get('xt');
                const dn = params.get('dn');
                const ws = params.get('ws');

                const compact = new URLSearchParams();
                if (xt) compact.set('xt', xt);
                if (dn) compact.set('dn', dn);
                if (ws) compact.set('ws', ws);

                const compactMagnet = `magnet:?${compact.toString()}`;
                if ((xt || dn) && compactMagnet.length <= maxLength) {
                    return compactMagnet;
                }

                if (xt) {
                    const xtOnly = `magnet:?xt=${encodeURIComponent(xt)}`;
                    if (xtOnly.length <= maxLength) return xtOnly;
                }
            } catch {
                // fall through to hard cut
            }
        }

        return link.slice(0, Math.max(32, maxLength));
    }
}

module.exports = GamesPirateSitesConncectionController;