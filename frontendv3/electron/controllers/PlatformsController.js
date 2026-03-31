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
          if (status === 401) {
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
        if (status === 401) {
          const e = new Error(msg);
          // @ts-ignore
          e.code = 'WRECK_INVALID_TOKEN';
          throw e;
        }
        throw new Error(msg);
      }
      return json;
    }
    async createPlatformUser(token, platformName, platformUsername, oauthToken, platformProfileId) {
        const platform = await this.getPlatform(platformName);
        const platformId = platform?.id;
        console.log('createPlatformUser - fetched platform:', { platform, platformId });
        if (!platformId) {
          throw new Error(`Platform not found or missing id for: ${String(platformName)}`);
        }

        const url = joinUrl(this.#serverUrl, 'api', 'platform-users');
        const { ok, status, json, text } = await fetchJsonSafe(url, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            platform_user_name: platformUsername,
            platform_id: platformId,
            platform_profile_id: platformProfileId,
            oauth_token: oauthToken,
          }),
        });
        if (!ok) {
          const msg = httpErrorMessage(status, json, text);
          if (status === 401) {
            const e = new Error(msg);
            // @ts-ignore
            e.code = 'WRECK_INVALID_TOKEN';
            throw e;
          }
          throw new Error(msg);
        }
        return json;
    }
async createSteamPlatformUser(token, platformUsername, platformProfileLink) {
  const getSteamIdFromProfileLink = async (link) => {
    const s = String(link ?? '');

    // Direct SteamID64: steamcommunity.com/profiles/76561198xxxxxxxxx
    const profilesMatch = s.match(/\/profiles\/(\d{17})/);
    if (profilesMatch) return profilesMatch[1];

    // Vanity URL: steamcommunity.com/id/vanityname  OR bare vanity name (e.g. "plati69")
    const vanityMatch = s.match(/\/id\/([^/?&#]+)/);
    const vanityName = vanityMatch ? vanityMatch[1] : (s.includes('/') ? null : s.trim());
    if (vanityName) {
      const { ok, status, json, text } = await fetchJsonSafe(
        joinUrl(this.#serverUrl, 'api', 'steam', 'profile-id', enc(vanityName)),
        { method: 'GET' }
      );
      if (!ok) throw new Error(`Failed to resolve Steam vanity URL: ${httpErrorMessage(status, json, text)}`);
      return json?.steamid ?? null;
    }

    return null;
  };

  const platformProfileId = await getSteamIdFromProfileLink(platformProfileLink);
  if (!platformProfileId) {
    throw new Error(`Could not extract Steam ID from profile link: ${String(platformProfileLink)}`);
  }

  return this.createPlatformUser(token, 'steam', platformUsername, '', platformProfileId);
}
async deletePlatformUser(token, platformUserId) {
  const url = joinUrl(this.#serverUrl, 'api', 'platform-user', enc(platformUserId));
  const { ok, status, json, text } = await fetchJsonSafe(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
  if (!ok) {
    const msg = httpErrorMessage(status, json, text);
    if (status === 401) {
      const e = new Error(msg);
      // @ts-ignore
      e.code = 'WRECK_INVALID_TOKEN';
      throw e;
    }
    throw new Error(msg);
  }
  return json;
}
async getPlatformUserIDAll(token) {
  const url = joinUrl(this.#serverUrl, 'api', 'platform-users');
  const { ok, status, json, text } = await fetchJsonSafe(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!ok) {
    const msg = httpErrorMessage(status, json, text);
    if (status === 401) {
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
