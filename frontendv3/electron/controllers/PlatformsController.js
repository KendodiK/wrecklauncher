const { joinUrl, normalizeBaseUrl } = require('../lib/url');
const { fetchJsonSafe, httpErrorMessage } = require('../lib/http');

function enc(v) {
  return encodeURIComponent(String(v ?? ''));
}
class PlatformsController {

    /** @type {string} */
    #serverUrl;

    /**
     * @param {{ serverUrl: string }} cfg
     */
    constructor(cfg) {
        this.#serverUrl = normalizeBaseUrl(cfg.serverUrl || '', { defaultProtocol: 'http:' });
    }
    async getPlatform(token, platformName){
      const url = joinUrl(this.#serverUrl, 'api', 'platforms', enc(platformName));
        const { ok, status, json, text } = await fetchJsonSafe(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
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

    async createPlatform(token, platformName) {
      const url = joinUrl(this.#serverUrl, 'api', 'platforms');
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

    async createPlatformUserById(token, platformId, platformUsername, platformPassword, platformProfileId) {
        const idNum = Number(platformId);
        if (!Number.isFinite(idNum) || idNum <= 0) {
          throw new Error(`Invalid platformId: ${String(platformId)}`);
        }
        const url = joinUrl(this.#serverUrl, 'api', 'platform_users');
        const { ok, status, json, text } = await fetchJsonSafe(url, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            platformUserName: platformUsername,
            platformId: idNum,
            platfProfId: platformProfileId,
            platformPassword: platformPassword,
          }),
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
        const platform = await this.getPlatform(token, platformName);
        const platformId = platform?.id;
        if (!platformId) {
          throw new Error(`Platform not found or missing id for: ${String(platformName)}`);
        }
        return await this.createPlatformUserById(token, platformId, platformUsername, platformPassword, platformProfileId);
      }
}

  module.exports = PlatformsController;
