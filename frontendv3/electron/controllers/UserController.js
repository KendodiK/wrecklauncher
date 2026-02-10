// @ts-check

const TokenController = require('./TokenController');
const { enc, joinUrl, normalizeBaseUrl } = require('../lib/url');
const { fetchJsonSafe, httpErrorMessage } = require('../lib/http');

class UserController extends TokenController {
  /** @type {string} */
  #serverUrl;

  /**
   * @param {{ username: string, password: string, tokenFile: string, serverUrl: string }} cfg
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
    const token = await this.getToken();
    if (!token) throw new Error('Missing auth token');

    // Variant A (api.js)
    {
      const url = joinUrl(this.#serverUrl, 'api', 'platform', 'user_id', enc(platformName), enc(platformUsername));
      const { ok, status, json, text } = await fetchJsonSafe(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });
      if (ok && json && typeof json === 'object' && 'platformUserID' in json) return json.platformUserID;
      // If it exists but is error-ish, surface it.
      if (status !== 404 && status !== 405 && status !== 500 && status !== 502) {
        if (!ok) throw new Error(httpErrorMessage(status, json, text));
      }
    }

    // Variant B (server.js)
    {
      const url = joinUrl(this.#serverUrl, 'api', 'platform', 'UserID', enc(platformName), enc(platformUsername), enc(token));
      const { ok, status, json, text } = await fetchJsonSafe(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
      if (!ok) throw new Error(httpErrorMessage(status, json, text));
      if (!json) throw new Error(`Invalid JSON from server (HTTP ${status})`);
      return json.platformUserID ?? null;
    }
  }

  /**
   * server.js: GET /api/steam/key/:token
   * @returns {Promise<string>}
   */
  async #getSteamApiKey() {
    const token = await this.getToken();
    if (!token) throw new Error('Missing auth token');
    const url = joinUrl(this.#serverUrl, 'api', 'steam', 'key', enc(token));
    const { ok, status, json, text } = await fetchJsonSafe(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
    if (!ok) throw new Error(httpErrorMessage(status, json, text));
    const key = json?.steamApiKey;
    if (typeof key === 'string' && key.trim()) return key;
    throw new Error('steamApiKey missing in response');
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
