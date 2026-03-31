// @ts-check

const TokenController = require('./TokenController');
const { enc, joinUrl, normalizeBaseUrl } = require('../lib/url');
const { fetchJsonSafe, httpErrorMessage } = require('../lib/http');

class UserController extends TokenController {
  /** @type {string} */
  #serverUrl;

  /**
   * @param {{ serverUrl: string }} cfg
   */
  constructor(cfg) {
    super(cfg.serverUrl);
    this.#serverUrl = normalizeBaseUrl(cfg.serverUrl || '', { defaultProtocol: 'http:' });
  }

  /**
   * Tries both backend variants:
   * - api.js: GET /api/platform/user_id/:platform/:username (Bearer token)
   * - server.js: GET /api/platform/UserID/:platform/:username/:token
   *
   * @param {string} platformId
   * @param {string} platformUsername
   * @returns {Promise<string|number|null>}
   */
  async getPlatformUserID(platformId, platformUsername) {
    const attemptOnce = async () => {
      const token = await this.getToken();
      if (!token) throw new Error('Missing auth token');

      /** @type {Error|null} */
      let apiVariantError = null;      
        //platform-users
        const url = joinUrl(this.#serverUrl, 'api', 'platform-users', enc(String(token).split('.')[0]));
        const { ok, status, json, text } = await fetchJsonSafe(url, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        });
        if (ok && json && typeof json === 'object' && 'platformUserID' in json) {
          for (const row of json){
            if(row.platform_id === platformId && row.platform_user_name === platformUsername){
              return row.platformUserID;
            }
          }
          return null;
        }

        if (!ok) {
          const msg = httpErrorMessage(status, json, text);
          const hasMeaningfulJson = !!(json && typeof json === 'object' && (json.error || json.message));

          // Token invalid/rotated: caller will retry with a fresh login.
          if (status === 401) {
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
   * Fetch owned games via Steam Web API using backend-provided key.
   * @returns {Promise<any[]>}
   */
  async getOwnedGamesFromSteam() {
    const url = joinUrl(this.#serverUrl, 'api', 'steam', 'owned-games');
    const { ok, status, json, text } = await fetchJsonSafe(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${await this.getToken()}`, 'Accept': 'application/json' },
    });
    if (!ok) throw new Error(httpErrorMessage(status, json, text));    
    return Array.isArray(json) ? json : [];
  }
}

module.exports = UserController;
