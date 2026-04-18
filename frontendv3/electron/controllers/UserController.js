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
   * @param {string|null|undefined} token
   * @returns {string|null}
   */
  #extractNativeUserIdFromToken(token) {
    const raw = String(token || '').trim();
    if (!raw) return null;
    const [nativeUserId] = raw.split('.');
    const normalized = String(nativeUserId || '').trim();
    return normalized || null;
  }

  /**
   * @param {any} raw
   * @param {string|number|null} [fallbackId]
   * @returns {{ id: string|number|null, username: string, bio: string|null, avatarUrl: string|null }|null}
   */
  #normalizeNativeUser(raw, fallbackId = null) {
    if (!raw || typeof raw !== 'object') return null;
    const username = String(raw?.name ?? raw?.username ?? raw?.user_name ?? '').trim();
    const id = raw?.id ?? fallbackId ?? null;
    if (!username && (id === null || id === undefined || String(id).trim() === '')) {
      return null;
    }

    return {
      id,
      username: username || `User ${String(id || '').trim() || '?'}`,
      bio: raw?.bio ?? null,
      avatarUrl: raw?.pfp ?? raw?.avatarUrl ?? null,
    };
  }

  /**
   * @param {string|number} userId
   * @param {string|null|undefined} [tokenOverride]
   * @returns {Promise<{ id: string|number|null, username: string, bio: string|null, avatarUrl: string|null }|null>}
   */
  async getNativeUserById(userId, tokenOverride) {
    const normalizedUserId = String(userId ?? '').trim();
    if (!normalizedUserId) return null;

    const token =
      typeof tokenOverride === 'string' && tokenOverride.trim()
        ? tokenOverride.trim()
        : await this.getToken().catch(() => null);

    const headers = { 'Accept': 'application/json' };
    if (token) {
      // @ts-ignore
      headers.Authorization = `Bearer ${token}`;
    }

    const url = joinUrl(this.#serverUrl, 'api', 'native-users', enc(normalizedUserId));
    const { ok, status, json, text } = await fetchJsonSafe(url, {
      method: 'GET',
      headers,
    });

    if (!ok) {
      const msg = httpErrorMessage(status, json, text);
      if (status === 401) {
        const e = new Error(msg);
        // @ts-ignore
        e.code = 'WRECK_INVALID_TOKEN';
        throw e;
      }
      if (status === 404 || status === 405) return null;
      throw new Error(msg);
    }

    return this.#normalizeNativeUser(json, normalizedUserId);
  }

  /**
   * @param {string} name
   * @returns {Promise<Array<{ id: string|number|null, username: string, bio: string|null, avatarUrl: string|null }>>}
   */
  async searchNativeUsersByName(name) {
    const needle = String(name || '').trim();
    if (!needle) return [];

    const url = joinUrl(this.#serverUrl, 'api', 'native-users', 'name', enc(needle));
    const { ok, status, json, text } = await fetchJsonSafe(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!ok) {
      const msg = httpErrorMessage(status, json, text);
      if (status === 404 || status === 405) return [];
      throw new Error(msg);
    }

    const rows = Array.isArray(json)
      ? json
      : (Array.isArray(json?.items) ? json.items : (Array.isArray(json?.data) ? json.data : []));

    const normalizedRows = rows
      .map((row) => this.#normalizeNativeUser(row))
      .filter((row) => !!row);

    const deduped = [];
    const seen = new Set();
    for (const row of normalizedRows) {
      const key = String(row?.id ?? row?.username ?? '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }

    return deduped;
  }

  /**
   * @param {string|number|null|undefined} [nativeUserIdOverride]
   * @returns {Promise<Array<{ friendshipId: string|number|null, userId: string|number, username: string, bio: string|null, avatarUrl: string|null }>>}
   */
  async getFriendsWithProfiles(nativeUserIdOverride) {
    const token = await this.getToken();
    if (!token) throw new Error('Missing auth token');

    const nativeUserId =
      String(nativeUserIdOverride ?? '').trim() || this.#extractNativeUserIdFromToken(token);
    if (!nativeUserId) throw new Error('Missing native user id');

    const url = joinUrl(this.#serverUrl, 'api', 'friends', enc(nativeUserId));
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
      if (status === 404 || status === 405) return [];
      throw new Error(msg);
    }

    const rows = Array.isArray(json)
      ? json
      : (Array.isArray(json?.items) ? json.items : (Array.isArray(json?.data) ? json.data : []));

    const normalizedRows = rows
      .map((row) => {
        if (!row || typeof row !== 'object') return null;
        const friendshipId = row?.id ?? row?.friendship_id ?? row?.friendshipId ?? null;
        const friendUserId = row?.user_id ?? row?.userId ?? row?.friend_user_id ?? row?.friendUserId ?? null;
        const normalizedFriendUserId = String(friendUserId ?? '').trim();
        if (!normalizedFriendUserId) return null;
        return {
          friendshipId,
          userId: normalizedFriendUserId,
        };
      })
      .filter((row) => !!row);

    const uniqueIds = Array.from(new Set(normalizedRows.map((row) => String(row.userId || '').trim()).filter(Boolean)));
    const profileById = new Map();
    const profiles = await Promise.all(uniqueIds.map((id) => this.getNativeUserById(id).catch(() => null)));
    for (const profile of profiles) {
      const id = String(profile?.id ?? '').trim();
      if (!id) continue;
      profileById.set(id, profile);
    }

    const friends = normalizedRows.map((row) => {
      const profile = profileById.get(String(row.userId || '').trim()) || null;
      const normalizedProfile = profile || {
        id: row.userId,
        username: `User ${row.userId}`,
        bio: null,
        avatarUrl: null,
      };
      return {
        friendshipId: row.friendshipId,
        userId: normalizedProfile.id ?? row.userId,
        username: normalizedProfile.username,
        bio: normalizedProfile.bio,
        avatarUrl: normalizedProfile.avatarUrl,
      };
    });

    friends.sort((left, right) => String(left.username || '').localeCompare(String(right.username || '')));
    return friends;
  }

  /**
   * @param {string|number} friendUserId
   * @returns {Promise<any>}
   */
  async addFriend(friendUserId) {
    const token = await this.getToken();
    if (!token) throw new Error('Missing auth token');

    const normalizedFriendUserId = String(friendUserId ?? '').trim();
    if (!normalizedFriendUserId) {
      throw new Error('Invalid friend user id');
    }

    const url = joinUrl(this.#serverUrl, 'api', 'friends');
    const { ok, status, json, text } = await fetchJsonSafe(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ friend_user_id: normalizedFriendUserId }),
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

    return json ?? { ok: true };
  }

  /**
   * @param {string|number} friendshipId
   * @returns {Promise<{ ok: true, friendshipId: number|string }>} 
   */
  async deleteFriend(friendshipId) {
    const token = await this.getToken();
    if (!token) throw new Error('Missing auth token');

    const normalizedFriendshipId = String(friendshipId ?? '').trim();
    if (!normalizedFriendshipId) {
      throw new Error('Invalid friendship id');
    }

    const url = joinUrl(this.#serverUrl, 'api', 'friends', enc(normalizedFriendshipId));
    const { ok, status, json, text } = await fetchJsonSafe(url, {
      method: 'DELETE',
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

    return { ok: true, friendshipId: normalizedFriendshipId };
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
   * Fetch owned Steam games for a specific native user id.
   * @param {string|number} nativeUserId
   * @returns {Promise<any[]>}
   */
  async getOwnedGamesFromSteamByNativeUserId(nativeUserId) {
    const token = await this.getToken();
    if (!token) throw new Error('Missing auth token');

    const normalizedNativeUserId = String(nativeUserId ?? '').trim();
    if (!normalizedNativeUserId) {
      throw new Error('Missing native user id');
    }

    const url = joinUrl(this.#serverUrl, 'api', 'native-users', enc(normalizedNativeUserId), 'steam-owned-games');
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
    if (status === 404 || status === 405) return [];
    throw new Error(msg);
  }

  /**
   * Updates the authenticated native user's profile fields on the backend database.
   * Supports both current and legacy API paths.
   *
   * @param {{ bio?: any, avatarUrl?: any, avatar_url?: any, pfp?: any }} profilePatch
   * @param {string|null|undefined} tokenOverride
   * @returns {Promise<{ id: string|number|null, username: string, bio: string|null, avatarUrl: string|null }|null>}
   */
  async updateCurrentUserProfile(profilePatch, tokenOverride) {
    const token =
      typeof tokenOverride === 'string' && tokenOverride.trim()
        ? tokenOverride.trim()
        : await this.getToken();

    if (!token) throw new Error('Missing auth token');

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

    const patch = profilePatch && typeof profilePatch === 'object' ? profilePatch : {};
    const hasBio = Object.prototype.hasOwnProperty.call(patch, 'bio');
    const hasAvatar =
      Object.prototype.hasOwnProperty.call(patch, 'avatarUrl')
      || Object.prototype.hasOwnProperty.call(patch, 'avatar_url')
      || Object.prototype.hasOwnProperty.call(patch, 'pfp');

    const payload = {};
    if (hasBio) {
      payload.bio = patch.bio == null ? '' : String(patch.bio);
    }
    if (hasAvatar) {
      const avatarRaw = patch.avatarUrl ?? patch.avatar_url ?? patch.pfp;
      payload.pfp = avatarRaw == null ? '' : String(avatarRaw);
    }

    if (Object.keys(payload).length < 1) {
      return await this.getCurrentUserInfo(token);
    }

    const updateUrl = joinUrl(this.#serverUrl, 'api', 'native-users');
    const { ok, status, json, text } = await fetchJsonSafe(updateUrl, {
      method: 'PUT',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
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

    const normalized = this.#normalizeNativeUser(json, userId);
    if (normalized) return normalized;

    const refreshed = await this.getCurrentUserInfo(token);
    if (refreshed) return refreshed;

    return {
      id: userId,
      username: `User ${userId}`,
      bio: hasBio ? payload.bio : null,
      avatarUrl: hasAvatar ? payload.pfp : null,
    };
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

    const profileUrl = joinUrl(this.#serverUrl, 'api', 'native-users', enc(userId));
    const { ok, status, json, text } = await fetchJsonSafe(profileUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
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

    if (status !== 404 && status !== 405) {
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
