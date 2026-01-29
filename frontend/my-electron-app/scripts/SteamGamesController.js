// @ts-check

const https = require("https");
const GamesController = require("./GamesController");

/**
 * @template T
 * @callback PromiseExecutor
 * @param {(value: T) => void} resolve
 * @param {(reason?: any) => void} reject
 */

/**
 * Controller for managing Steam games.
 */
class SteamGamesController extends GamesController {
    /**
     * Fetches detailed information about a Steam game using its appID. Slow but somewhat reliable.
     * Details are localized to Germany.
   *
   * @param {number} appID Steam AppID
   * @returns {Promise<any>} detailed information about the Steam game
     */
    async getGamesDetails(appID){
        try {
            const appIdNum = Number(appID);
            if (!Number.isFinite(appIdNum) || appIdNum <= 0) {
                throw new Error(`Invalid Steam AppID: ${String(appID)}`);
            }

            const cc = "de";
            const lang = "en";
            const timeout = 8000;
            const retries = 5;
            const retryDelay = 500; // ms
            // Limit memory usage; Steam appdetails responses should be small, but can still be large.
            // If you need fewer fields, use `filters` to reduce payload.
            const maxBodyBytes = 2 * 1024 * 1024; // 2 MiB
            // Keep this small: you asked for `price_overview.final`, `name`, `bannerimg`, `genres`.
            // Note: Steam's Store API supports `filters` to reduce response size.
            const filters = [
                // `basic` is the smallest reliable way to get `name` + `header_image`.
                // We'll still return a slim object to the renderer.
                'basic',
                'genres',
                'price_overview'
            ].join(',');

            /** @type {PromiseExecutor<any>} */
            const executor = (resolve, reject) => {
                /** @param {number} tryNumber */
                const attempt = (tryNumber) => {
                    const appIdParam = encodeURIComponent(String(appIdNum));
                    const options = {
                        hostname: "store.steampowered.com",
                        path: `/api/appdetails?appids=${appIdParam}&cc=${encodeURIComponent(cc)}&l=${encodeURIComponent(lang)}&filters=${encodeURIComponent(filters)}`,
                        method: "GET",
                        headers: {
                            "Accept-Encoding": "identity",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
                        },
                        timeout
                    };

                    const req = https.get(options, (res) => {
                        /** @type {Buffer[]} */
                        const chunks = [];
                        let totalBytes = 0;

                        res.on("data", (chunk) => {
                            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                            totalBytes += buf.length;
                            if (totalBytes > maxBodyBytes) {
                                req.destroy();
                                reject(new Error(`Steam response too large (> ${maxBodyBytes} bytes) for AppID ${appIdNum}. Consider using fewer fields (filters).`));
                                return;
                            }
                            chunks.push(buf);
                        });

                        res.on("end", () => {
                            const data = Buffer.concat(chunks).toString('utf8');
                            const statusCode = res.statusCode ?? 0;

                            if (statusCode === 429) {
                                if (tryNumber < retries) {
                                    const wait = retryDelay * tryNumber;
                                    console.log(`Steam 429 for ${appIdNum}, retrying in ${wait}ms`);
                                    setTimeout(() => attempt(tryNumber + 1), wait);
                                    return;
                                }
                                reject(new Error("Steam HTTP Error 429 (too many retries)"));
                                return;
                            }

                            if (statusCode < 200 || statusCode >= 300) {
                                const snippet = String(data || '').trim().replace(/\s+/g, ' ').slice(0, 300);
                                reject(new Error(`Steam HTTP Error: ${statusCode}${snippet ? ` - ${snippet}` : ''}`));
                                return;
                            }
                            try {
                                const parsed = JSON.parse(data);
                                const appData = parsed[String(appIdNum)];

                                if (!appData || !appData.success) {
                                    console.log(new Error(`Steam returned success=false for AppID ${appIdNum}`));
                                    resolve(null);
                                    return;                                    
                                }
                                console.log(`Fetched Steam details for AppID ${appIdNum}`);
                                console.log('Response data:');
                                console.log(JSON.stringify(appData, null, 2));
                                console.log('---');
                                const appDataObj = appData.data || {};
                                // Return a slim object to keep IPC payload and parsing small.
                                resolve({
                                    appid: appDataObj.steam_appid ?? appIdNum,
                                    name: appDataObj.name ?? null,
                                    // "bannerimg" isn't a Steam field; map it from what Steam provides.
                                    bannerimg: appDataObj.header_image ?? appDataObj.capsule_image ?? null,
                                    genres: Array.isArray(appDataObj.genres) ? appDataObj.genres : [],
                                    // Keep the whole price_overview so callers can access `.final`.
                                    price_overview: appDataObj.price_overview ?? null,
                                });
                            } catch (e) {
                                const err = e instanceof Error ? e : new Error(String(e));
                                reject(new Error("Failed to parse Steam JSON: " + err.message));
                            }
                        });
                    });

                    req.on("error", (e) => {
                        const err = e instanceof Error ? e : new Error(String(e));
                        reject(err);
                    });

                    req.on("timeout", () => {
                        req.destroy();
                        reject(new Error("Steam API request timed out"));
                    });
                };

                attempt(1);
            };
            console.log(`Fetching Steam details for AppID ${appIdNum}...`);
            return new Promise(executor);
        } catch (error) {
            console.error("Error fetching Steam app details:", error);
            const err = error instanceof Error ? error : new Error(String(error));
            throw new Error(`Failed to fetch Steam app details: ${err.message}`);
        }
    }
}
module.exports = SteamGamesController;