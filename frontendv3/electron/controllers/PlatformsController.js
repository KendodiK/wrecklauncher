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
   * @param {unknown} platformName
   * @returns {string[]}
   */
  _expandPlatformNameCandidates(platformName) {
    const normalized = this._normalizePlatformName(platformName);
    if (!normalized) return [];

    const candidates = [normalized];
    if (normalized === 'itchio') candidates.push('itch', 'itch.io');
    if (normalized === 'gog') candidates.push('gog.com');

    return Array.from(new Set(candidates.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)));
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

  async getPlatform(platformName) {
    const candidates = this._expandPlatformNameCandidates(platformName);
    if (candidates.length < 1) {
      throw new Error('platformName is required');
    }

    /** @type {Error|null} */
    let lastCompatibilityError = null;

    for (const candidate of candidates) {
      const url = joinUrl(this.#serverUrl, 'api', 'platforms', enc(candidate));
      const { ok, status, json, text } = await fetchJsonSafe(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (ok && json && typeof json === 'object') {
        return json;
      }

      const msg = httpErrorMessage(status, json, text);
      if (status === 401) {
        const e = new Error(msg);
        // @ts-ignore
        e.code = 'WRECK_INVALID_TOKEN';
        throw e;
      }

      if (status === 404 || status === 405) {
        lastCompatibilityError = new Error(msg);
        continue;
      }

      throw new Error(msg);
    }

    throw lastCompatibilityError || new Error(`Platform not found: ${String(platformName)}`);
  }

  async createPlatform(token, platformName) {
    const normalizedName = this._normalizePlatformName(platformName);
    if (!normalizedName) throw new Error('platformName is required');

    const url = joinUrl(this.#serverUrl, 'api', 'platforms');
    const { ok, status, json, text } = await fetchJsonSafe(url, {
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

    const endpoints = [
      joinUrl(this.#serverUrl, 'api', 'platform-users'),
      joinUrl(this.#serverUrl, 'api', 'platform_users'),
    ];

    /** @type {Error|null} */
    let lastCompatibilityError = null;

    for (const url of endpoints) {
      const { ok, status, json, text } = await fetchJsonSafe(url, {
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

      if (ok) return json;

      const msg = httpErrorMessage(status, json, text);
      if (status === 401) {
        const e = new Error(msg);
        // @ts-ignore
        e.code = 'WRECK_INVALID_TOKEN';
        throw e;
      }

      if (status === 404 || status === 405) {
        lastCompatibilityError = new Error(msg);
        continue;
      }

      throw new Error(msg);
    }

    throw lastCompatibilityError || new Error('No compatible platform-user create endpoint found');
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
    const normalizedId = String(platformUserId ?? '').trim();
    if (!normalizedId) throw new Error('platformUserId is required');

    const endpoints = [
      joinUrl(this.#serverUrl, 'api', 'platform-users', enc(normalizedId)),
      joinUrl(this.#serverUrl, 'api', 'platform_user', enc(normalizedId)),
      joinUrl(this.#serverUrl, 'api', 'platform-user', enc(normalizedId)),
    ];

    /** @type {Error|null} */
    let lastCompatibilityError = null;

    for (const url of endpoints) {
      const { ok, status, json, text } = await fetchJsonSafe(url, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (ok) return json ?? { deleted: true };

      const msg = httpErrorMessage(status, json, text);
      if (status === 401) {
        const e = new Error(msg);
        // @ts-ignore
        e.code = 'WRECK_INVALID_TOKEN';
        throw e;
      }

      if (status === 404 || status === 405) {
        lastCompatibilityError = new Error(msg);
        continue;
      }

      throw new Error(msg);
    }

    throw lastCompatibilityError || new Error('No compatible platform-user delete endpoint found');
  }

  async getAllPlatformUserIds(token) {
    const nativeUserId = this._extractNativeUserIdFromToken(token);
    const endpoints = [
      nativeUserId ? joinUrl(this.#serverUrl, 'api', 'platform-users', enc(nativeUserId)) : null,
      joinUrl(this.#serverUrl, 'api', 'platform-users'),
      joinUrl(this.#serverUrl, 'api', 'platform_users'),
    ].filter(Boolean);

    /** @type {Error|null} */
    let lastCompatibilityError = null;

    for (const url of endpoints) {
      const { ok, status, json, text } = await fetchJsonSafe(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (ok) {
        if (Array.isArray(json)) return json;
        if (Array.isArray(json?.items)) return json.items;
        if (Array.isArray(json?.data)) return json.data;
        return [];
      }

      const msg = httpErrorMessage(status, json, text);
      if (status === 401) {
        const e = new Error(msg);
        // @ts-ignore
        e.code = 'WRECK_INVALID_TOKEN';
        throw e;
      }

      if (status === 404 || status === 405) {
        lastCompatibilityError = new Error(msg);
        continue;
      }

      throw new Error(msg);
    }

    throw lastCompatibilityError || new Error('No compatible platform-users list endpoint found');
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
