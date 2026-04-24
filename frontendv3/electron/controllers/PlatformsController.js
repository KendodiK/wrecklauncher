const { stat } = require("original-fs");

// @ts-check
class PlatformsController {

  /** @type {string} */
  #serverUrl;

  /**
   * @param {{ serverUrl: string }} cfg
   */
  constructor(cfg) {
    this.#serverUrl = cfg.serverUrl || '';
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  _normalizePlatformName(value) {
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'itch' || raw === 'itch.io') return 'itchio';
    if (raw === 'gog.com') return 'gog';
    return raw;
  }


  /**
   * @param {string} token
   * @returns {string}
   */
  _extractNativeUserIdFromToken(token) {
    const parts = String(token || '').trim().split('.');
    if (parts.length !== 2 || !parts[0]) return '';
    return parts[0];
  }
/**
 * 
 * @param {string} platformName 
 * @returns 
 */
  async getPlatform(platformName) {
    const platformname = this._normalizePlatformName(platformName);
    if (!platformname) throw new Error('platformName is required');
    const url = `${this.#serverUrl}/api/platforms/${encodeURIComponent(platformname)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      const {ok, status} = response;
      const json = await response.json().catch(() => null);
      const text = await response.text().catch(() => null);
      if (ok && json && typeof json === 'object') {
        return json;
      }      
      if (status === 401) {
        const e = new Error(`Unauthorized access when fetching platform "${platformName}": ${status} - ${text || JSON.stringify(json)}`);
        // @ts-ignore
        e.code = 'WRECK_INVALID_TOKEN';
        throw e;
      }
      throw new Error(`Failed to fetch platform "${platformName}": ${status} - ${text || JSON.stringify(json)}`);
  }
/**
 * 
 * @param {string} token 
 * @param {string} platformName 
 * @returns 
 */
  async createPlatform(token, platformName) {
    const normalizedName = this._normalizePlatformName(platformName);
    if (!normalizedName) throw new Error('platformName is required');

    const url = `${this.#serverUrl}/api/platforms`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      // Keep both keys for compatibility with mixed backend versions.
      body: JSON.stringify({
        platform_name: normalizedName,
        platformName: normalizedName,
        name: normalizedName,
      }),
    });
    const {ok, status} = response;
    const json = await response.json().catch(() => null);
    const text = await response.text().catch(() => null);
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
/**
 * 
 * @param {string} token 
 * @param {string} platformName 
 * @param {string} platformUsername 
 * @param {string} oauthToken 
 * @param {string|number} platformProfileId 
 * @returns 
 */
  async createPlatformUser(token, platformName, platformUsername, oauthToken, platformProfileId) {
    const normalizedPlatformName = this._normalizePlatformName(platformName);
    const normalizedPlatformUsername = String(platformUsername ?? '').trim();
    const normalizedOauthToken = String(oauthToken ?? '').trim();
    const normalizedProfileId = String(platformProfileId ?? '').trim();

    if (!normalizedPlatformName) throw new Error('platformName is required');
    if (!normalizedPlatformUsername) throw new Error('platformUsername is required');
    if (!normalizedProfileId) throw new Error('platformProfileId is required');

    let platformId = null;
    if (/^\d+$/.test(normalizedPlatformName)) {
      const id = Number(normalizedPlatformName);
      platformId = Number.isFinite(id) && id > 0 ? id : null;
    } else {
      const platform = await this.getPlatform(normalizedPlatformName);
      const id = Number(platform?.id ?? platform?.platform_id);
      platformId = Number.isFinite(id) && id > 0 ? id : null;
    }

    if (!platformId) {
      throw new Error(`Platform not found or missing id for: ${String(platformName)}`);
    }

    const url = `${this.#serverUrl}/api/platform-users`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          platform_user_name: normalizedPlatformUsername,
          platform_id: platformId,
          // Support both backend field variants: legacy `platform_prof_id` and corrected `platform_profile_id`.
          platform_prof_id: normalizedProfileId,
          platform_profile_id: normalizedProfileId,
          oauth_token: normalizedOauthToken,
        }),
      });
      const {ok, status} = response;
      const json = await response.json().catch(() => null);
      const text = await response.text().catch(() => null);
      if (ok) return json;

      const msg = httpErrorMessage(status, json, text);
      if (status === 401) {
        const e = new Error(msg);
        // @ts-ignore
        e.code = 'WRECK_INVALID_TOKEN';
        throw e;
      }
      throw new Error(msg);
  }
/**
 * 
 * @param {string} token 
 * @param {string} platformUsername 
 * @param {string} platformProfileLink 
 * @returns 
 */
  async createSteamPlatformUser(token, platformUsername, platformProfileLink) {
    /**
     * 
     * @param {string} link 
     * @returns 
     */
    const getSteamIdFromProfileLink = async (link) => {
      const s = String(link ?? '');

      // Direct SteamID64: steamcommunity.com/profiles/76561198xxxxxxxxx
      const profilesMatch = s.match(/\/profiles\/(\d{17})/);
      if (profilesMatch) return profilesMatch[1];

      // Vanity URL: steamcommunity.com/id/vanityname  OR bare vanity name (e.g. "plati69")
      const vanityMatch = s.match(/\/id\/([^/?&#]+)/);
      const vanityName = vanityMatch ? vanityMatch[1] : (s.includes('/') ? null : s.trim());
      if (vanityName) {
        const response = await fetch(
          `${this.#serverUrl}/api/steam/profile-id/${encodeURIComponent(vanityName)}`,
          { method: 'GET' }
        );
        const { ok, status } = response;
        const json = await response.json().catch(() => null);
        const text = await response.text().catch(() => null);
        if (!ok) throw new Error(`Failed to resolve Steam vanity URL: ${status} - ${text || JSON.stringify(json)}`);
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
    const normalizedId = String(platformUserId ?? '').trim();
    if (!normalizedId) throw new Error('platformUserId is required');

    const url = `${this.#serverUrl}/api/platform-users/${encodeURIComponent(normalizedId)}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const { ok, status } = response;
    const json = await response.json().catch(() => null);
    const text = await response.text().catch(() => null);

    if (ok) return json ?? { deleted: true };

    if (status === 401) {
      const e = new Error("Unauthorized access when deleting platform user: " + (text || JSON.stringify(json)));
      // @ts-ignore
      e.code = 'WRECK_INVALID_TOKEN';
      throw e;
    }

    // If the row is already missing for the authenticated user, keep disconnect idempotent.
    if (status === 404) {
      return {
        deleted: false,
        missing: true,
        id: normalizedId,
        message: msg,
      };
    }

    throw new Error("Failed to delete platform user: " + (text || JSON.stringify(json)));
  }

  async getAllPlatformUserIds(token) {
    const nativeUserId = this._extractNativeUserIdFromToken(token);
    const url = `${this.#serverUrl}/api/platform-users/${encodeURIComponent(nativeUserId)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      const { ok, status } = response;
      const json = await response.json().catch(() => null);
      const text = await response.text().catch(() => null);

      if (ok) {
        if (Array.isArray(json)) return json;
        if (Array.isArray(json?.items)) return json.items;
        if (Array.isArray(json?.data)) return json.data;
        return [];
      }

      if (status === 401) {
        const e = new Error("Unauthorized access when fetching platform user IDs: " + (text || JSON.stringify(json)));
        // @ts-ignore
        e.code = 'WRECK_INVALID_TOKEN';
        throw e;
      }


      throw new Error("Failed to fetch platform user IDs: " + (text || JSON.stringify(json)));
  }

  /**
   * Backward-compatible alias for the legacy uppercase-ID method name.
   * @param {string} token
   * @returns {Promise<any[]>}
   */
  async getPlatformUserIDAll(token) {
    return this.getAllPlatformUserIds(token);
  }
}

module.exports = PlatformsController;
