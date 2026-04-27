// @ts-check

const { shell } = require('electron');
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
    this.#serverUrl = serverUrl || '';
    this.#platformID = '';
  }
  /** @param {number} ms */
  static #sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
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

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WreckLauncher/1.0 (+steam title lookup)',
      },
    });    
    const json = await response.json().catch(() => null);
    const text = await response.text().catch(() => null);
    if (!response.ok) {
      const snippet = String((json && (json.error || json.message)) || text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      throw new Error(`Steam title search failed (HTTP ${response.status}): ${snippet}`);
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
      const gamedetails = super._getAllDetailsResponse(
        {
          "app_id": String(details.appid || match.appid || ''),
          "platform_name": "steam",
          "name": details.name || match.title || '',
          "banner_img": details.header_image || '',
          "description": typeof details.short_description === 'string' && details.short_description.trim() ? details.short_description : null,
          "minimum_requirements": details.minimum_requirements || null,
          "cost": details.cost || null,
          "currency": details.price_overview.currency || null,
          "country_code": cc || null,
          "genre_names": Array.isArray(details.genres) ? details.genres.map((g) => (g && typeof g === 'object' ? g.description : null)).filter((s) => typeof s === 'string' && s.trim()) : [],
          "pirate_sites": [],
        }
      )
      const enrichedDetails = {
        ...details,
        ...gamedetails,
        screenshots: details.screenshots || [],
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
   * @param {string} token
   * @param {number} appID
   * @param {string} [cc]
   * @returns {Promise<import('../models').SteamGameDetails|null>}
   */
  async getGameDetails(token, appID, cc = 'de') {
    const appIdNum = Number(appID);
    if (!Number.isFinite(appIdNum) || appIdNum <= 0) throw new Error(`Invalid Steam AppID: ${String(appID)}`);
    const lang = 'en';
    const retries = 5;
    const retryDelay = 700;

    const requestedCc = typeof cc === 'string' && cc.trim() ? cc.trim() : undefined;
    const fallbackCc = 'de';

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

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WreckLauncher/1.0 (+steam title lookup)',
        },
      });
       const body = await response.json().catch(() => null);
       const statusCode = response.status;
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
      const appData = body?.[String(appIdNum)];
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
        : data?.price_overview && typeof data.price_overview === 'object' && typeof data.price_overview.initial === 'number'
          ? data.price_overview.initial
          : null;
      let heroImage = await super._healthCheckUrl('https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/'+data.steam_appid+'/library_600x900.jpg');
      if (!heroImage) {
        heroImage = await super._healthCheckUrl('https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/'+data.steam_appid+'/hero_capsule.jpg');
      }

      let gameDetails = {
        appid: data.steam_appid ?? appIdNum,
        name: data.name ?? null,
        banner_img: data.header_image ?? data.capsule_image ?? null,
        hero_img: heroImage ?? data.header_image ?? null,        
        genres: Array.isArray(data.genres) ? data.genres : [], 
        genre_names: Array.isArray(data.genres)          ? data.genres
              .map((g) => (g && typeof g === 'object' ? g.description : null))
              .filter((s) => typeof s === 'string' && s.trim())
          : [],
        short_description: typeof data.short_description === 'string' && data.short_description.trim() ? data.short_description : null, 
        long_description: typeof data.detailed_description === 'string' && data.detailed_description.trim() ? data.detailed_description : null,      
        price_overview: priceOverviewFinal,
        cost: normalizedCost,
        minimum_requirements: typeof minimumRequirements === 'string' && minimumRequirements.trim() ? minimumRequirements : null,
        cc: ccToUse ?? null,
        screenshots: Array.isArray(data.screenshots)          ? data.screenshots
              .map((s) => s?.path_full)
              .filter((s) => typeof s === 'string' && s.trim())
          : [],
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
          banner_img: gameDetails.banner_img || '',
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
