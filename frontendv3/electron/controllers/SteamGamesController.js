// @ts-check

const { shell } = require('electron');
const https = require('https');
const { joinUrl, normalizeBaseUrl } = require('../lib/url');
const { fetchJsonSafe } = require('../lib/http');
const GamesController = require('./GamesController');
const fs = require("fs");
const path = require("path");
const vdf = require("vdf");
const winReg = require('winreg');
class SteamGamesController extends GamesController {
  /**
   * @type {string} (false string, in reality its a number converted to string for query param usage, e.g. "730" for CS:GO)
   */
  #platformID;
  /** @type {string} */
  #serverUrl;
  /**
   * @param {{ serverUrl: string }} cfg
   */
  constructor(cfg) {
    const serverUrl = cfg?.serverUrl;
    super({ serverUrl });
    this.#serverUrl = normalizeBaseUrl(serverUrl, { defaultProtocol: 'https:' });
    this.#platformID = '';
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

  /** @type {Set<string>} */
  static #zeroDecimalCurrencies = new Set([
    'BIF',
    'CLP',
    'DJF',
    'GNF',
    'ISK',
    'JPY',
    'KMF',
    'KRW',
    'PYG',
    'RWF',
    'UGX',
    'VND',
    'VUV',
    'XAF',
    'XOF',
    'XPF',
  ]);

  /**
   * @param {unknown} rawValue
   * @returns {number|null}
   */
  static #parsePriceFromFormattedText(rawValue) {
    const text = String(rawValue || '').trim();
    if (!text) return null;
    if (/^free$/i.test(text)) return 0;

    const compact = text.replace(/\s+/g, '');
    const numericLike = compact.replace(/[^0-9,.-]/g, '');
    if (!/[0-9]/.test(numericLike)) return null;

    const lastDot = numericLike.lastIndexOf('.');
    const lastComma = numericLike.lastIndexOf(',');
    const decimalSep = lastDot > lastComma ? '.' : (lastComma > -1 ? ',' : '');

    let normalized = numericLike;
    if (decimalSep) {
      const sepPattern = decimalSep === '.' ? /,/g : /\./g;
      normalized = normalized.replace(sepPattern, '');

      const lastDecimalIndex = normalized.lastIndexOf(decimalSep);
      if (lastDecimalIndex >= 0) {
        const left = normalized.slice(0, lastDecimalIndex).replace(new RegExp(`\\${decimalSep}`, 'g'), '');
        const right = normalized.slice(lastDecimalIndex + 1);
        if (right.length === 0) {
          normalized = left;
        } else if (right.length > 2 && left.length > 0) {
          normalized = `${left}${right}`;
        } else {
          normalized = `${left}.${right}`;
        }
      }
    } else {
      normalized = normalized.replace(/[.,]/g, '');
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Number(parsed.toFixed(2));
  }

  /**
   * @param {any} priceOverview
   * @returns {number|null}
   */
  static #normalizeSteamCost(priceOverview) {
    if (!priceOverview || typeof priceOverview !== 'object') return null;

    const formattedPrice = SteamGamesController.#parsePriceFromFormattedText(
      priceOverview.final_formatted || priceOverview.initial_formatted || ''
    );
    if (formattedPrice !== null) return formattedPrice;

    const finalNumeric = Number(priceOverview.final);
    if (!Number.isFinite(finalNumeric) || finalNumeric < 0) return null;

    const currency = String(priceOverview.currency || '').trim().toUpperCase();
    if (SteamGamesController.#zeroDecimalCurrencies.has(currency)) {
      return Number(finalNumeric.toFixed(2));
    }

    if (Number.isInteger(finalNumeric)) {
      if (finalNumeric >= 100) return Number((finalNumeric / 100).toFixed(2));
      return Number(finalNumeric.toFixed(2));
    }

    return Number(finalNumeric.toFixed(2));
  }

  /**
   * Search Steam store app IDs by game title.
   *
   * @param {string} title
   * @param {string} [cc]
   * @param {number} [limit]
   * @returns {Promise<Array<{ appid: number, title: string, score: number, url: string|null }>>}
   */
  async searchGameByTitle(title, cc = 'us', limit = 40) {
    const needle = String(title || '').trim();
    if (!needle) return [];

    const countryCode = String(cc || 'us').trim().toLowerCase() || 'us';
    const url =
      `https://store.steampowered.com/api/storesearch/?` +
      `term=${encodeURIComponent(needle)}` +
      `&l=${encodeURIComponent('english')}` +
      `&cc=${encodeURIComponent(countryCode)}`;

    const { ok, status, json, text } = await fetchJsonSafe(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WreckLauncher/1.0 (+steam title lookup)',
      },
    });

    if (!ok) {
      const snippet = String((json && (json.error || json.message)) || text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      throw new Error(`Steam title search failed (HTTP ${status}): ${snippet}`);
    }

    const items = Array.isArray(json?.items) ? json.items : [];
    const matches = items
      .map((/** @type {any} */ item) => {
        const appid = Number(item?.id);
        const candidateTitle = String(item?.name || '').trim();
        if (!Number.isFinite(appid) || appid <= 0 || !candidateTitle) return null;

        return {
          appid,
          title: candidateTitle,
          score: this._titleMatchScore(needle, candidateTitle),
          url: `https://store.steampowered.com/app/${appid}`,
        };
      })
      .filter((/** @type {any} */ item) => !!item)
      .sort((/** @type {any} */ a, /** @type {any} */ b) => b.score - a.score)
      .slice(0, Math.max(1, Number(limit) || 40));

    return matches;
  }

  /**
   * Resolve Steam details by title by searching first, then loading app details for the best match.
   *
   * @param {string} token
   * @param {string} title
   * @param {string} [cc]
   * @returns {Promise<import('../models').SteamGameDetails|null>}
   */
  async getGameDetailsByTitle(token, title, cc = 'de') {
    const matches = await this.searchGameByTitle(title, cc, 40);
    if (matches.length < 1) return null;

    let bestDetails = null;
    let bestScore = 0;

    for (const match of matches.slice(0, 12)) {
      const details = await this.getGameDetails(token, match.appid, cc);
      if (!details) continue;

      const candidateTitle = String(details.name || match.title || '').trim();
      const detailScore = this._titleMatchScore(title, candidateTitle);
      const mergedScore = Math.max(match.score, detailScore);

      const enrichedDetails = {
        ...details,
        raw: {
          ...(details.raw || {}),
          search_match: {
            ...match,
            score: mergedScore,
          },
        },
      };

      if (!bestDetails || mergedScore > bestScore) {
        bestDetails = enrichedDetails;
        bestScore = mergedScore;
      }

      if (mergedScore >= 0.98) {
        return enrichedDetails;
      }
    }

    return bestDetails;
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
  async getGameDetails(token, appID, cc = 'de') {
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
      const raw = data;

      const minimumRequirements =
        (data.pc_requirements && typeof data.pc_requirements === 'object' ? data.pc_requirements.minimum : null) ||
        (data.mac_requirements && typeof data.mac_requirements === 'object' ? data.mac_requirements.minimum : null) ||
        (data.linux_requirements && typeof data.linux_requirements === 'object' ? data.linux_requirements.minimum : null) ||
        null;
      const rawPriceOverview = data?.price_overview && typeof data.price_overview === 'object'
        ? data.price_overview
        : null;

      const priceOverviewFinal =
        typeof rawPriceOverview?.final === 'number'
          ? rawPriceOverview.final
          : (data?.is_free === true ? 0 : null);
      const normalizedCost = data?.is_free === true
        ? 0
        : SteamGamesController.#normalizeSteamCost(rawPriceOverview);

      let gameDetails = {
        appid: data.steam_appid ?? appIdNum,
        name: data.name ?? null,
        bannerimg: data.header_image ?? data.capsule_image ?? null,
        genres: Array.isArray(data.genres) ? data.genres : [],
        price_overview: priceOverviewFinal,
        cost: normalizedCost,
        minimum_requirements: typeof minimumRequirements === 'string' && minimumRequirements.trim() ? minimumRequirements : null,
        cc: ccToUse ?? null,
        lang,
        raw,
      };

      // Upload normalized game payload to backend.
      // Keep it separate from the Steam details object.
      const genreNames = Array.isArray(data.genres)
        ? data.genres
        // @ts-ignore
            .map((g) => (g && typeof g === 'object' ? g.description : null))
        // @ts-ignore
            .filter((s) => typeof s === 'string' && s.trim())
        : [];

      const cost = normalizedCost;
      try {
        const syncCountryCode = String(ccToUse || requestedCc || 'DE').trim().toUpperCase() || 'DE';
        await super.syncScrapedGameWithServer(token, {
          app_id: String(gameDetails.appid ?? appIdNum),
          platform_name: 'steam',
          name: gameDetails.name || `steam:${String(gameDetails.appid ?? appIdNum)}`,
          banner_img: gameDetails.bannerimg || '',
          description: typeof data.short_description === 'string' && data.short_description.trim() ? data.short_description : null,
          minimum_requirements: gameDetails.minimum_requirements,
          cost,
          genre_names: genreNames,
          country_code: syncCountryCode,
        });
      } catch (err) {
        // Let the IPC layer handle token rotation/refresh.
        if (err && typeof err === 'object' && /** @type {any} */ (err).code === 'WRECK_INVALID_TOKEN') {
          throw err;
        }

        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to sync game details for appID ${appIdNum}: ${msg}`);
        return { ...gameDetails, raw };
      }
      return { ...gameDetails, raw };
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

  /**
   * Backward-compatible alias for older call sites.
   * @param {string} token
   * @param {number} appID
   * @param {string} [cc]
   * @returns {Promise<import('../models').SteamGameDetails|null>}
   */
  async getGamesDetails(token, appID, cc = 'de') {
    return this.getGameDetails(token, appID, cc);
  }

  /**
   * Runs, installs, deletes or opens the store page for a steam game via the steam:// URL scheme. Note: this requires the user to have the Steam client installed and properly registered to handle steam:// links.
   * 
   * @param {string} appID steamp appID (e.g. "730" for CS:GO)
   * @param {string} action install/store/run/uninstall
   * @returns 
   */
  async clientGameControlUtil(appID, action) {
    const appIdNum = Number(appID);
    if (!Number.isFinite(appIdNum) || appIdNum <= 0) throw new Error(`Invalid Steam AppID: ${String(appID)}`);

    const url = `steam://${action}/${encodeURIComponent(String(appIdNum))}`;
    try {
      await shell.openExternal(url);
      return { ok: true, url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to open Steam client URL (${url}): ${msg}`);
    }
  }

  /**
   * Backward-compatible alias for the legacy misspelled method name.
   * @param {string} appID
   * @param {string} action
   * @returns {Promise<{ ok: boolean, url: string }>}
   */
  async clientGameControllUtil(appID, action) {
    return this.clientGameControlUtil(appID, action);
  }

async getInstalledGames() {
  const regKey = new winReg({
  hive: winReg.HKCU,
  key: "\\Software\\Valve\\Steam"
});
const steamPath = await new Promise((resolve, reject) => {
  regKey.get("SteamPath", (err, item) => {
    if (err) {
      console.error("Steam not found:", err);
      reject(err);
    } else {
      console.log("Steam path found:", item.value);
      resolve(item.value);
    }
  });
});
  const libraryFile = path.join(steamPath, "steamapps/libraryfolders.vdf");
  const libraries = vdf.parse(fs.readFileSync(libraryFile, "utf8"));

  const libraryPaths = Object.values(libraries.libraryfolders)
    .map(lib => lib.path);

  let games = [];

  for (const lib of libraryPaths) {
    const steamapps = path.join(lib, "steamapps");

    const files = fs.readdirSync(steamapps);

    for (const file of files) {
      if (file.startsWith("appmanifest_") && file.endsWith(".acf")) {
        const data = vdf.parse(
          fs.readFileSync(path.join(steamapps, file), "utf8")
        );

        const app = data.AppState;

        games.push({
          appid: app.appid,
          name: app.name,
          installdir: app.installdir
        });
      }
    }
  }

  return games;
}

}
module.exports = SteamGamesController;
