// @ts-check

const https = require("https");
const GamesController = require("./GamesController");
const { app } = require("electron");

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
    static #steamHttpsAgent = new https.Agent({
        keepAlive: true,
        maxSockets: 2,
        maxFreeSockets: 2,
        timeout: 30_000
    });

    /** @param {number} ms */
    static #sleep(ms) {
        return new Promise((r) => setTimeout(r, ms));
    }

    /**
     * Minimal HTTPS GET wrapper that avoids Node fetch/undici fingerprinting.
     * Returns body as utf8 text.
     *
     * @param {string} url
     * @param {{ timeoutMs: number, maxBodyBytes: number, headers?: Record<string, string> }} opts
     * @returns {Promise<{ statusCode: number, headers: any, body: string }>} 
     */
    static #httpsGetText(url, { timeoutMs, maxBodyBytes, headers = {} }) {
        return new Promise((resolve, reject) => {
            const u = new URL(url);

            const req = https.request(
                {
                    protocol: u.protocol,
                    hostname: u.hostname,
                    port: u.port || 443,
                    path: u.pathname + u.search,
                    method: "GET",
                    agent: SteamGamesController.#steamHttpsAgent,
                    headers: {
                        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8",
                        "Accept-Language": "en-US,en;q=0.9",
                        "Accept-Encoding": "identity",
                        "Connection": "keep-alive",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
                        "Referer": "https://store.steampowered.com/",
                        "Origin": "https://store.steampowered.com",
                        ...headers
                    }
                },
                (res) => {
                    /** @type {Buffer[]} */
                    const chunks = [];
                    let totalBytes = 0;

                    res.on("data", (chunk) => {
                        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
                        totalBytes += buf.length;
                        if (totalBytes > maxBodyBytes) {
                            req.destroy();
                            reject(new Error(`Steam response too large (> ${maxBodyBytes} bytes)`));
                            return;
                        }
                        chunks.push(buf);
                    });

                    res.on("end", () => {
                        resolve({
                            statusCode: res.statusCode ?? 0,
                            headers: res.headers,
                            body: Buffer.concat(chunks).toString("utf8")
                        });
                    });
                }
            );

            req.on("error", (e) => reject(e instanceof Error ? e : new Error(String(e))));
            req.setTimeout(timeoutMs, () => {
                req.destroy();
                reject(new Error("Steam API request timed out"));
            });
            req.end();
        });
    }

    /**
     * Fetches detailed information about a Steam game using its appID. Slow but somewhat reliable.
     * Details are localized to Germany.
   *
   * @param {number} appID Steam AppID
   * @returns {Promise<any>} detailed information about the Steam game
     */
    async getGamesDetails(appID, cc = "de") {
        try {
            const appIdNum = Number(appID);
            if (!Number.isFinite(appIdNum) || appIdNum <= 0) {
                throw new Error(`Invalid Steam AppID: ${String(appID)}`);
            }
            const lang = "en";
            const timeoutMs = 8000;
            const retries = 5;
            const retryDelay = 700;
            // Without Steam `filters`, payloads can be larger.
            const maxBodyBytes = 8 * 1024 * 1024;
            // Note: Steam's Store API supports `filters` to reduce response size.
            // However, some fields (like `price_overview.final`) are missing if you use `filters`.
            // So we avoid `filters` here to get a fuller response and avoid responses that only consist of null.

            const requestedCc = typeof cc === "string" && cc.trim() ? cc.trim() : undefined;
            const fallbackCc = "us";

            /**
             * @param {string|undefined} ccToUse
             * @param {number} tryNumber
             */
            const attempt = async (ccToUse, tryNumber) => {
                const url =
                    `https://store.steampowered.com/api/appdetails?` +
                    `appids=${encodeURIComponent(String(appIdNum))}` +
                    (ccToUse ? `&cc=${encodeURIComponent(ccToUse)}` : "") +
                    `&l=${encodeURIComponent(lang)}`;

                const { statusCode, body } = await SteamGamesController.#httpsGetText(url, {
                    timeoutMs,
                    maxBodyBytes
                });

                if (statusCode === 429 || statusCode === 403) {
                    if (tryNumber < retries) {
                        const multiplier = statusCode === 403 ? 3 : 1;
                        const jitter = Math.floor(Math.random() * 300);
                        const wait = retryDelay * tryNumber * multiplier + jitter;
                        console.log(`Steam ${statusCode} for ${appIdNum} (cc=${ccToUse ?? "auto"}), retrying in ${wait}ms`);
                        await SteamGamesController.#sleep(wait);
                        return attempt(ccToUse, tryNumber + 1);
                    }
                    throw new Error(`Steam HTTP Error: ${statusCode} (too many retries)`);
                }

                if (statusCode < 200 || statusCode >= 300) {
                    const snippet = String(body || "").trim().replace(/\s+/g, " ").slice(0, 300);
                    throw new Error(`Steam HTTP Error: ${statusCode}${snippet ? ` - ${snippet}` : ""}`);
                }

                const trimmed = String(body ?? "").trim();
                if (trimmed === "" || trimmed === "null") {
                    if (tryNumber < retries) {
                        const jitter = Math.floor(Math.random() * 300);
                        const wait = retryDelay * tryNumber + jitter;
                        await SteamGamesController.#sleep(wait);
                        return attempt(ccToUse, tryNumber + 1);
                    }
                    throw new Error("Steam returned null body");
                }

                const parsed = JSON.parse(trimmed);
                const appData = parsed?.[String(appIdNum)];
                if (!appData || !appData.success) {
                    return null;
                }
                const appDataObj = appData.data || {};
                return {
                    appid: appDataObj.steam_appid ?? appIdNum,
                    name: appDataObj.name ?? null,
                    bannerimg: appDataObj.header_image ?? appDataObj.capsule_image ?? null,
                    genres: Array.isArray(appDataObj.genres) ? appDataObj.genres : [],
                    price_overview: appDataObj.price_overview?.final ?? null,
                    cc: ccToUse ?? null,
                    lang,
                    raw: appDataObj
                };
            };

            console.log(`Fetching Steam details for AppID ${appIdNum} (cc=${requestedCc ?? "auto"})...`);

            // 1) Try requested cc (if provided), otherwise let Steam pick based on IP/cookies-like behavior.
            let result = await attempt(requestedCc, 1);
            if (result) return result;

            // 2) If region-specific request failed, retry with auto region (no cc) once.
            if (requestedCc) {
                result = await attempt(undefined, 1);
                if (result) return { ...result, cc_requested: requestedCc };
            }

            // 3) Final fallback to a stable region for metadata (often works when local cc doesn't).
            if (!requestedCc || requestedCc.toLowerCase() !== fallbackCc) {
                result = await attempt(fallbackCc, 1);
                if (result) return { ...result, cc_requested: requestedCc ?? null };
            }

            console.log(new Error(`Steam returned success=false for AppID ${appIdNum} (cc=${requestedCc ?? "auto"})`));
            return null;
        } catch (error) {
            console.error("Error fetching Steam app details:", error);
            const err = error instanceof Error ? error : new Error(String(error));
            throw new Error(`Failed to fetch Steam app details: ${err.message}`);
        }
    }
    // async getGamesDetails(appID){
    //     try {
    //         const appIdNum = Number(appID);
    //         if (!Number.isFinite(appIdNum) || appIdNum <= 0) {
    //             throw new Error(`Invalid Steam AppID: ${String(appID)}`);
    //         }

    //         const cc = "de";
    //         const lang = "en";
    //         const timeout = 8000;
    //         const retries = 5;
    //         const retryDelay = 500; // ms
    //         // Limit memory usage; Steam appdetails responses should be small, but can still be large.
    //         // If you need fewer fields, use `filters` to reduce payload.
    //         const maxBodyBytes = 2 * 1024 * 1024; // 2 MiB
    //         // Keep this small: you asked for `price_overview.final`, `name`, `bannerimg`, `genres`.
    //         // Note: Steam's Store API supports `filters` to reduce response size.
    //         const filters = [
    //             // `basic` is the smallest reliable way to get `name` + `header_image`.
    //             // We'll still return a slim object to the renderer.
    //             'basic',
    //             'genres',
    //             'price_overview'
    //         ].join(',');

    //         /** @type {PromiseExecutor<any>} */
    //         const executor = (resolve, reject) => {
    //             /** @param {number} tryNumber */
    //             const attempt = (tryNumber) => {
    //                 const appIdParam = encodeURIComponent(String(appIdNum));
    //                 const options = {
    //                     hostname: "store.steampowered.com",
    //                     path: `/api/appdetails?appids=${appIdParam}&cc=${encodeURIComponent(cc)}&l=${encodeURIComponent(lang)}&filters=${encodeURIComponent(filters)}`,
    //                     method: "GET",
    //                     headers: {
    //                         "Accept-Encoding": "identity",
    //                         "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    //                     },
    //                     timeout
    //                 };

    //                 const req = https.get(options, (res) => {
    //                     /** @type {Buffer[]} */
    //                     const chunks = [];
    //                     let totalBytes = 0;

    //                     res.on("data", (chunk) => {
    //                         const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    //                         totalBytes += buf.length;
    //                         if (totalBytes > maxBodyBytes) {
    //                             req.destroy();
    //                             reject(new Error(`Steam response too large (> ${maxBodyBytes} bytes) for AppID ${appIdNum}. Consider using fewer fields (filters).`));
    //                             return;
    //                         }
    //                         chunks.push(buf);
    //                     });

    //                     res.on("end", () => {
    //                         const data = Buffer.concat(chunks).toString('utf8');
    //                         const statusCode = res.statusCode ?? 0;

    //                         if (statusCode === 429) {
    //                             if (tryNumber < retries) {
    //                                 const wait = retryDelay * tryNumber;
    //                                 console.log(`Steam 429 for ${appIdNum}, retrying in ${wait}ms`);
    //                                 setTimeout(() => attempt(tryNumber + 1), wait);
    //                                 return;
    //                             }
    //                             reject(new Error("Steam HTTP Error 429 (too many retries)"));
    //                             return;
    //                         }

    //                         if (statusCode < 200 || statusCode >= 300) {
    //                             const snippet = String(data || '').trim().replace(/\s+/g, ' ').slice(0, 300);
    //                             reject(new Error(`Steam HTTP Error: ${statusCode}${snippet ? ` - ${snippet}` : ''}`));
    //                             return;
    //                         }
    //                         try {
    //                             const parsed = JSON.parse(data);
    //                             const appData = parsed[String(appIdNum)];

    //                             if (!appData || !appData.success) {
    //                                 console.log(new Error(`Steam returned success=false for AppID ${appIdNum}`));
    //                                 resolve(null);
    //                                 return;                                    
    //                             }
    //                             console.log(`Fetched Steam details for AppID ${appIdNum}`);
    //                             console.log('Response data:');
    //                             console.log(JSON.stringify(appData, null, 2));
    //                             console.log('---');
    //                             const appDataObj = appData.data || {};
    //                             resolve({
    //                                 appid: appDataObj.steam_appid ?? appIdNum,
    //                                 name: appDataObj.name ?? null,
    //                                 // "bannerimg" isn't a Steam field; map it from what Steam provides.
    //                                 bannerimg: appDataObj.header_image ?? appDataObj.capsule_image ?? null,
    //                                 genres: Array.isArray(appDataObj.genres) ? appDataObj.genres : [],
    //                                 price_overview: appDataObj.price_overview?.final ?? null,
    //                             });
    //                         } catch (e) {
    //                             const err = e instanceof Error ? e : new Error(String(e));
    //                             reject(new Error("Failed to parse Steam JSON: " + err.message));
    //                         }
    //                     });
    //                 });

    //                 req.on("error", (e) => {
    //                     const err = e instanceof Error ? e : new Error(String(e));
    //                     reject(err);
    //                 });

    //                 req.on("timeout", () => {
    //                     req.destroy();
    //                     reject(new Error("Steam API request timed out"));
    //                 });
    //             };

    //             attempt(1);
    //         };
    //         console.log(`Fetching Steam details for AppID ${appIdNum}...`);
    //         return new Promise(executor);
    //     } catch (error) {
    //         console.error("Error fetching Steam app details:", error);
    //         const err = error instanceof Error ? error : new Error(String(error));
    //         throw new Error(`Failed to fetch Steam app details: ${err.message}`);
    //     }
    // }
}
module.exports = SteamGamesController;