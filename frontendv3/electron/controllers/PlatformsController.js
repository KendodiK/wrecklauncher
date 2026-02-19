const { joinUrl, normalizeBaseUrl } = require('../lib/url');
const { fetchJsonSafe, httpErrorMessage } = require('../lib/http');
class PlatformsController {

    /** @type {string} */
    #serverUrl;

    /**
     * @param {{ serverUrl: string }} cfg
     */
    constructor(cfg) {
        this.#serverUrl = normalizeBaseUrl(cfg.serverUrl || '', { defaultProtocol: 'http:' });
    }

    async createPlatform(token, platformName) {
      const url = joinUrl(this.#serverUrl, 'api', 'platform');
      const { ok, status, json, text } = await fetchJsonSafe(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ platformName }),
      });
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
      return json;
    }
    async createPlatformUser(token, platformName, platformUsername, platformPassword, platformProfileId) {
        const url = joinUrl(this.#serverUrl, 'api', 'platform', 'user');
        const { ok, status, json, text } = await fetchJsonSafe(url, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ platformName, platformUsername, platformPassword, platformProfileId }),
        });
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
        return json;
    }
}

  module.exports = PlatformsController;
