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
    async getPlatform(platformName){
      const url = joinUrl(this.#serverUrl, 'api', 'platforms', enc(platformName));
        const { ok, status, json, text } = await fetchJsonSafe(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
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
      console.log('createPlatform response:', { ok, status, json, text });
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
        const platform = await this.getPlatform(platformName);
        const platformId = platform?.id;
        console.log('createPlatformUser - fetched platform:', { platform, platformId });
        if (!platformId) {
          throw new Error(`Platform not found or missing id for: ${String(platformName)}`);
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
            platformId: platformId,
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
}

  module.exports = PlatformsController;
