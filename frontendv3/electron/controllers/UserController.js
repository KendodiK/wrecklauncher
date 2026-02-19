// @ts-check

const TokenController = require('./TokenController');
const { enc, joinUrl, normalizeBaseUrl } = require('../lib/url');
const { fetchJsonSafe, httpErrorMessage } = require('../lib/http');

class UserController extends TokenController {
  /** @type {string} */
  #serverUrl;

  /**
   * @param {{ username: string, password: string, email: string, tokenFile: string, serverUrl: string }} cfg
   */
  constructor(cfg) {
    super(cfg);
    this.#serverUrl = normalizeBaseUrl(cfg.serverUrl || '', { defaultProtocol: 'http:' });
  }

  /**
   * Tries both backend variants:
   * - api.js: GET /api/platform/user_id/:platform/:username (Bearer token)
   * - server.js: GET /api/platform/UserID/:platform/:username/:token
   *
   * @param {string} platformName
   * @param {string} platformUsername
   * @returns {Promise<string|number|null>}
   */
  async getPlatformUserID(platformName, platformUsername) {
    const attemptOnce = async () => {
      const token = await this.getToken();
      if (!token) throw new Error('Missing auth token');

      /** @type {Error|null} */
      let apiVariantError = null;

      // Variant A (api.js)
      {
        const url = joinUrl(this.#serverUrl, 'api', 'platform', 'user_id', enc(platformName), enc(platformUsername));
        const { ok, status, json, text } = await fetchJsonSafe(url, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        });
        if (ok && json && typeof json === 'object' && 'platformUserID' in json) return json.platformUserID;

        if (!ok) {
          const msg = httpErrorMessage(status, json, text);
          const hasMeaningfulJson = !!(json && typeof json === 'object' && (json.error || json.message));

          // Token invalid/rotated: caller will retry with a fresh login.
          if (status === 401 && /invalid token/i.test(msg)) {
            const e = new Error(msg);
            // @ts-ignore
            e.code = 'WRECK_INVALID_TOKEN';
            throw e;
          }

          if (hasMeaningfulJson) {
            throw new Error(msg);
          }

          if (status !== 404 && status !== 405) {
            throw new Error(msg);
          }

          apiVariantError = new Error(msg);
        }
      }
    };

    try {
      return await attemptOnce();
    } catch (err) {
      // One automatic retry on invalid/rotated token
      if (err && typeof err === 'object' && /** @type {any} */ (err).code === 'WRECK_INVALID_TOKEN') {
        await this._invalidateToken();
        return await attemptOnce();
      }
      throw err;
    }
  }

  /**
   * server.js: GET /api/steam/key/:token
   * @returns {Promise<string>}
   */
  async #getSteamApiKey() {
    const attemptOnce = async () => {
      const token = await this.getToken();
      if (!token) throw new Error('Missing auth token');
      const url = joinUrl(this.#serverUrl, 'api', 'steam', 'key');
      const { ok, status, json, text } = await fetchJsonSafe(url, { method: 'GET', headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` } });
      if (!ok) {
        const msg = httpErrorMessage(status, json, text);
        if (status === 401 && /invalid token/i.test(msg)) {
          const e = new Error(msg);
          // @ts-ignore
          e.code = 'WRECK_INVALID_TOKEN';
          throw e;
        }
        throw new Error(msg);
      }
      const key = json?.steamApiKey;
      if (typeof key === 'string' && key.trim()) return key;
      throw new Error('steamApiKey missing in response');
    };

    try {
      return await attemptOnce();
    } catch (err) {
      if (err && typeof err === 'object' && /** @type {any} */ (err).code === 'WRECK_INVALID_TOKEN') {
        await this._invalidateToken();
        return await attemptOnce();
      }
      throw err;
    }
  }

  /**
   * Fetch owned games via Steam Web API using backend-provided key.
   * @param {string} platformUsername
   * @returns {Promise<any[]>}
   */
  async getOwnedGamesFromSteam(platformUsername) {
    const steamID = await this.getPlatformUserID('steam', platformUsername);
    if (!steamID) throw new Error('Steam ID not found');

    const key = await this.#getSteamApiKey();
    console.log(`[UserController] Fetching owned games for SteamID ${steamID} with API key ${key}`);
    const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${encodeURIComponent(key)}&steamid=${encodeURIComponent(String(steamID))}&format=json`;
    const { ok, status, json, text } = await fetchJsonSafe(url, { method: 'GET' });
    if (!ok) throw new Error(httpErrorMessage(status, json, text));
    return json?.response?.games ?? [];
  }
}

module.exports = UserController;
