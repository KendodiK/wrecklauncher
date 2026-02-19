// @ts-check

const https = require('https');
const GamesController = require('./GamesController');

class SteamGamesController extends GamesController {
  /**
   * @param {{ serverUrl: string }|undefined} [cfg]
   */
  constructor(cfg) {
    super({
      serverUrl: cfg?.serverUrl || process.env.WRECK_BACKEND_URL || 'http://127.0.0.1:3000',
    });
  }

  static #agent = new https.Agent({
    keepAlive: true,
    maxSockets: 2,
    maxFreeSockets: 2,
    timeout: 30_000,
  });

  /** @param {number} ms */
  static #sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * @param {string} url
   * @param {{ timeoutMs: number, maxBodyBytes: number }} opts
   */
  static #httpsGetText(url, { timeoutMs, maxBodyBytes }) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);

      const req = https.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || 443,
          path: u.pathname + u.search,
          method: 'GET',
          agent: SteamGamesController.#agent,
          headers: {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Referer': 'https://store.steampowered.com/',
            'Origin': 'https://store.steampowered.com',
          },
        },
        (res) => {
          /** @type {Buffer[]} */
          const chunks = [];
          let totalBytes = 0;

          res.on('data', (chunk) => {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            totalBytes += buf.length;
            if (totalBytes > maxBodyBytes) {
              req.destroy();
              reject(new Error(`Steam response too large (> ${maxBodyBytes} bytes)`));
              return;
            }
            chunks.push(buf);
          });

          res.on('end', () => {
            resolve({
              statusCode: res.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        }
      );

      req.on('error', (e) => reject(e instanceof Error ? e : new Error(String(e))));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error('Steam API request timed out'));
      });
      req.end();
    });
  }

  /**
   * @param {string} token
   * @param {number} appID
   * @param {string} [cc]
   * @returns {Promise<import('../models').SteamGameDetails|null>}
   */
  async getGamesDetails(token, appID, cc = 'de') {
    const appIdNum = Number(appID);
    if (!Number.isFinite(appIdNum) || appIdNum <= 0) throw new Error(`Invalid Steam AppID: ${String(appID)}`);

    const lang = 'en';
    const timeoutMs = 8000;
    const retries = 5;
    const retryDelay = 700;
    const maxBodyBytes = 8 * 1024 * 1024;

    const requestedCc = typeof cc === 'string' && cc.trim() ? cc.trim() : undefined;
    const fallbackCc = 'us';

    /**
     * @param {string|undefined} ccToUse
     * @param {number} tryNumber
     */
    const attempt = async (ccToUse, tryNumber) => {
      const url =
        `https://store.steampowered.com/api/appdetails?` +
        `appids=${encodeURIComponent(String(appIdNum))}` +
        (ccToUse ? `&cc=${encodeURIComponent(ccToUse)}` : '') +
        `&l=${encodeURIComponent(lang)}`;

      const { statusCode, body } = await SteamGamesController.#httpsGetText(url, { timeoutMs, maxBodyBytes });

      if (statusCode === 429 || statusCode === 403) {
        if (tryNumber < retries) {
          const multiplier = statusCode === 403 ? 3 : 1;
          const jitter = Math.floor(Math.random() * 300);
          const wait = retryDelay * tryNumber * multiplier + jitter;
          await SteamGamesController.#sleep(wait);
          return attempt(ccToUse, tryNumber + 1);
        }
        throw new Error(`Steam HTTP Error: ${statusCode} (too many retries)`);
      }

      if (statusCode < 200 || statusCode >= 300) {
        const snippet = String(body || '').trim().replace(/\s+/g, ' ').slice(0, 300);
        throw new Error(`Steam HTTP Error: ${statusCode}${snippet ? ` - ${snippet}` : ''}`);
      }

      const trimmed = String(body ?? '').trim();
      if (trimmed === '' || trimmed === 'null') {
        if (tryNumber < retries) {
          const jitter = Math.floor(Math.random() * 300);
          const wait = retryDelay * tryNumber + jitter;
          await SteamGamesController.#sleep(wait);
          return attempt(ccToUse, tryNumber + 1);
        }
        throw new Error('Steam returned null body');
      }

      const parsed = JSON.parse(trimmed);
      const appData = parsed?.[String(appIdNum)];
      if (!appData || !appData.success) return null;
      const data = appData.data || {};

      const minimumRequirements =
        (data.pc_requirements && typeof data.pc_requirements === 'object' ? data.pc_requirements.minimum : null) ||
        (data.mac_requirements && typeof data.mac_requirements === 'object' ? data.mac_requirements.minimum : null) ||
        (data.linux_requirements && typeof data.linux_requirements === 'object' ? data.linux_requirements.minimum : null) ||
        null;

      let gameDetails = {
        appid: data.steam_appid ?? appIdNum,
        name: data.name ?? null,
        bannerimg: data.header_image ?? data.capsule_image ?? null,
        genres: Array.isArray(data.genres) ? data.genres : [],
        price_overview: data.price_overview?.final ?? null,
        minimum_requirements: typeof minimumRequirements === 'string' && minimumRequirements.trim() ? minimumRequirements : null,
        cc: ccToUse ?? null,
        lang,
        raw: data,
      };

      // Upload normalized game payload to backend.
      // Keep it separate from the Steam details object.
      const genreNames = Array.isArray(data.genres)
        ? data.genres
            .map((g) => (g && typeof g === 'object' ? g.description : null))
            .filter((s) => typeof s === 'string' && s.trim())
        : [];

      const cost = typeof data.price_overview?.final === 'number' ? data.price_overview.final / 100 : null;

      const uploadResult = await super.uploadGame(token, {
        app_id: String(gameDetails.appid ?? appIdNum),
        platform_name: 'steam',
        name: gameDetails.name || `steam:${String(gameDetails.appid ?? appIdNum)}`,
        banner_img: gameDetails.bannerimg || '',
        description: typeof data.short_description === 'string' && data.short_description.trim() ? data.short_description : null,
        minimum_requirements: "teszt",
        //minimum_requirements: gameDetails.minimum_requirements,
        cost,
        genre_names: genreNames,
      });

      if ((!uploadResult || uploadResult.ok !== true) && uploadResult.statusCode !==400) {
        const msg = uploadResult?.rawText || uploadResult?.response?.error || uploadResult?.response?.message || 'Unknown error';
        throw new Error(`Game upload failed (HTTP ${uploadResult?.statusCode ?? 0}): ${String(msg).slice(0, 300)}`);
      }
      return gameDetails;
    };

    let result = await attempt(requestedCc, 1);
    if (result) return result;

    if (requestedCc) {
      result = await attempt(undefined, 1);
      if (result) return result;
    }

    if (!requestedCc || requestedCc.toLowerCase() !== fallbackCc) {
      result = await attempt(fallbackCc, 1);
      if (result) return result;
    }

    return null;
  }
}

module.exports = SteamGamesController;
