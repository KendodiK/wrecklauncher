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
   * Resolve a platform user id by (platform_id, platform_user_name) for the authenticated native user.
   * Supports mixed backend endpoint variants for platform-users listing.
   *
   * @param {string|number} platformId
   * @param {string} platformUsername
   * @returns {Promise<string|number|null>}
   */
  async getPlatformUserId(platformId, platformUsername) {
    const normalizedPlatformId = String(platformId ?? '').trim();
    const normalizedPlatformIdNum = Number(normalizedPlatformId);
    const normalizedPlatformUsername = String(platformUsername ?? '').trim().toLowerCase();

    const attemptOnce = async () => {
      const token = await this.getToken();
      if (!token) throw new Error('Missing auth token');

      const nativeUserId = String(token).split('.')[0] || '';
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
          headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        });

        if (ok) {
          const rows = Array.isArray(json)
            ? json
            : (Array.isArray(json?.items) ? json.items : (Array.isArray(json?.data) ? json.data : []));

          for (const row of rows) {
            const rowPlatformIdRaw = row?.platform_id ?? row?.platformId ?? row?.platform;
            const rowPlatformIdNum = Number(rowPlatformIdRaw);
            const rowPlatformUsername = String(row?.platform_user_name ?? row?.platformUserName ?? '').trim().toLowerCase();

            const platformMatches = Number.isFinite(normalizedPlatformIdNum) && normalizedPlatformIdNum > 0
              ? (Number.isFinite(rowPlatformIdNum) && rowPlatformIdNum === normalizedPlatformIdNum)
              : String(rowPlatformIdRaw ?? '').trim() === normalizedPlatformId;

            if (!platformMatches) continue;
            if (normalizedPlatformUsername && rowPlatformUsername !== normalizedPlatformUsername) continue;

            return row?.id ?? row?.platformUserID ?? row?.platform_user_id ?? null;
          }

          return null;
        }

        const msg = httpErrorMessage(status, json, text);

        // Token invalid/rotated: caller will retry with a fresh login.
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

      throw lastCompatibilityError || new Error('No compatible platform-users endpoint found');
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
   * Backward-compatible alias for the legacy uppercase-ID method name.
   * @param {string|number} platformId
   * @param {string} platformUsername
   * @returns {Promise<string|number|null>}
   */
  async getPlatformUserID(platformId, platformUsername) {
    return this.getPlatformUserId(platformId, platformUsername);
  }

  /**
   * Fetch owned games via Steam Web API using backend-provided key.
   * @returns {Promise<any[]>}
   */
  async getOwnedGamesFromSteam() {
    const token = await this.getToken();
    if (!token) throw new Error('Missing auth token');

    const endpoints = [
      joinUrl(this.#serverUrl, 'steam', 'api', 'get-owned-games'),
      joinUrl(this.#serverUrl, 'steam', 'api', 'getOwnedGames'),
      joinUrl(this.#serverUrl, 'api', 'steam', 'owned-games'),
    ];

    /** @type {Error|null} */
    let lastCompatibilityError = null;

    for (const url of endpoints) {
      const { ok, status, json, text } = await fetchJsonSafe(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });

      if (ok) {
        if (Array.isArray(json)) return json;
        if (Array.isArray(json?.ownedGames)) return json.ownedGames;
        if (Array.isArray(json?.response?.games)) return json.response.games;
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

    throw lastCompatibilityError || new Error('No compatible Steam owned-games endpoint found');
  }

  /**
   * Resolves the currently authenticated user's profile from the saved auth token.
   * Returns a normalized user object for renderer bootstrap.
   *
   * @param {string|null|undefined} tokenOverride
   * @returns {Promise<{ id: string|number|null, username: string, bio: string|null, avatarUrl: string|null }|null>}
   */
  async getCurrentUserInfo(tokenOverride) {
    const token =
      typeof tokenOverride === 'string' && tokenOverride.trim()
        ? tokenOverride.trim()
        : await this.getToken();

    if (!token) return null;

    const parts = String(token).split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      const e = new Error('Invalid token format');
      // @ts-ignore
      e.code = 'WRECK_INVALID_TOKEN';
      throw e;
    }

    const userId = String(parts[0]).trim();
    if (!userId) {
      const e = new Error('Invalid token format');
      // @ts-ignore
      e.code = 'WRECK_INVALID_TOKEN';
      throw e;
    }

    // Best-effort token validation against auth-protected endpoints.
    // If these endpoints are missing on a backend variant, we still proceed to profile fetch.
    const validationAttempts = [
      joinUrl(this.#serverUrl, 'api', 'platform-users', enc(userId)),
      joinUrl(this.#serverUrl, 'api', 'platform_users'),
    ];

    for (const url of validationAttempts) {
      const { ok, status, json, text } = await fetchJsonSafe(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (ok) break;

      const msg = httpErrorMessage(status, json, text);
      if (status === 401) {
        const e = new Error(msg);
        // @ts-ignore
        e.code = 'WRECK_INVALID_TOKEN';
        throw e;
      }

      if (status === 404 || status === 405) {
        continue;
      }
    }

    const attempts = [
      {
        url: joinUrl(this.#serverUrl, 'api', 'native-users', enc(userId)),
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      },
      {
        url: joinUrl(this.#serverUrl, 'api', 'nativeUser'),
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      },
    ];

    for (const attempt of attempts) {
      const { ok, status, json, text } = await fetchJsonSafe(attempt.url, {
        method: attempt.method,
        headers: attempt.headers,
      });

      if (ok) {
        const raw = json && typeof json === 'object' ? json : {};
        const username = String(raw?.name ?? raw?.username ?? raw?.user_name ?? '').trim() || `User ${userId}`;
        return {
          id: raw?.id ?? userId,
          username,
          bio: raw?.bio ?? null,
          avatarUrl: raw?.pfp ?? raw?.avatarUrl ?? null,
        };
      }

      const msg = httpErrorMessage(status, json, text);
      if (status === 401) {
        const e = new Error(msg);
        // @ts-ignore
        e.code = 'WRECK_INVALID_TOKEN';
        throw e;
      }

      if (status === 404 || status === 405) {
        continue;
      }

      throw new Error(msg);
    }

    return {
      id: userId,
      username: `User ${userId}`,
      bio: null,
      avatarUrl: null,
    };
  }
}

module.exports = UserController;
