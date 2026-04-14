// @ts-check

const { enc, joinUrl, normalizeBaseUrl } = require('../lib/url');
const { fetchJsonSafe } = require('../lib/http');

class GamesController {
  /** @type {string} */
  #serverUrl;

  /** @type {Map<string, number>} */
  #platformIdByNameCache;

  /**
   * @param {{ serverUrl: string }} cfg
   */
  constructor(cfg) {
    this.#serverUrl = normalizeBaseUrl(cfg.serverUrl || '', { defaultProtocol: 'http:' });
    this.#platformIdByNameCache = new Map();
  }

  /**
   * @param {number} status
   * @param {any} json
   * @param {string} text
   * @returns {boolean}
   */
  _isLegacyListSchemaError(status, json, text) {
    if (Number(status) !== 500) return false;
    const msg = String((json && (json.error || json.message)) || text || '').toLowerCase();
    return msg.includes("unknown column 'g.cost'") || msg.includes('unknown column g.cost');
  }

  /**
   * @param {number|string|null|undefined} platformId
   * @returns {string|null}
   */
  _platformNameFromId(platformId) {
    const id = Number(platformId);
    if (!Number.isFinite(id) || id <= 0) return null;
    for (const [platformName, cachedId] of this.#platformIdByNameCache.entries()) {
      if (Number(cachedId) === id) return platformName;
    }
    return null;
  }

  /**
   * @param {string|number|null|undefined} platform
   * @returns {string}
   */
  _normalizePlatformLookupName(platform) {
    const raw = String(platform ?? '').trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'itch' || raw === 'itch.io') return 'itchio';
    if (raw === 'gog.com') return 'gog';
    return raw;
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  _normalizeTitleForCompare(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[\u00a9\u00ae\u2122]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * @param {unknown} query
   * @param {unknown} candidate
   * @returns {number}
   */
  _titleMatchScore(query, candidate) {
    const q = this._normalizeTitleForCompare(query);
    const c = this._normalizeTitleForCompare(candidate);
    if (!q || !c) return 0;
    if (q === c) return 1;
    if (q.includes(c) || c.includes(q)) return 0.9;

    const qTokens = new Set(q.split(' ').filter((t) => t.length > 1));
    const cTokens = new Set(c.split(' ').filter((t) => t.length > 1));
    if (qTokens.size < 1 || cTokens.size < 1) return 0;

    let overlap = 0;
    for (const token of qTokens) {
      if (cTokens.has(token)) overlap += 1;
    }
    if (overlap < 1) return 0;

    const union = qTokens.size + cTokens.size - overlap;
    const jaccard = union > 0 ? overlap / union : 0;
    const coverage = overlap / Math.min(qTokens.size, cTokens.size);
    return Math.max(jaccard, coverage * 0.9);
  }

  /**
   * @param {string} platformName
   * @returns {Promise<number|null>}
   */
  async _fetchPlatformIdByName(platformName) {
    const normalizedName = this._normalizePlatformLookupName(platformName);
    if (!normalizedName) return null;

    const cachedId = this.#platformIdByNameCache.get(normalizedName);
    if (typeof cachedId === 'number' && Number.isFinite(cachedId) && cachedId > 0) {
      return cachedId;
    }

    const url = joinUrl(this.#serverUrl, 'api', 'platforms', enc(normalizedName));
    const { ok, status, json, text } = await fetchJsonSafe(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!ok) {
      if (Number(status) === 404) return null;
      const snippet = String((json && (json.error || json.message)) || text || 'Unknown error')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 300);
      throw new Error(`Failed to resolve platform "${normalizedName}" (HTTP ${status}): ${snippet}`);
    }

    const id = Number(json?.id);
    if (!Number.isFinite(id) || id <= 0) return null;

    this.#platformIdByNameCache.set(normalizedName, id);
    return id;
  }

  /**
   * Resolve a platform reference to candidate numeric platform ids using backend lookup.
   *
   * @param {number|string|null|undefined} platform
    * @returns {Promise<number[]>}
   */
  async _resolvePlatformIds(platform) {
    if (platform === null || platform === undefined) return [];
    const raw = String(platform).trim();
    if (!raw) return [];
    if (/^\d+$/.test(raw)) {
      const id = Number(raw);
      if (!Number.isFinite(id) || id <= 0) return [];
      return [id];
    }

    const normalized = this._normalizePlatformLookupName(raw);
    if (!normalized) return [];

    /** @type {Record<string, string[]>} */
    const candidatesByPlatform = {
      steam: ['steam'],
      gog: ['gog', 'gog.com'],
      itchio: ['itchio', 'itch', 'itch.io'],
    };

    const namesToTry = candidatesByPlatform[normalized] || [normalized];
    /** @type {number[]} */
    const ids = [];

    for (const name of namesToTry) {
      const id = await this._fetchPlatformIdByName(name);
      if (!id || ids.includes(id)) continue;
      ids.push(id);
      this.#platformIdByNameCache.set(this._normalizePlatformLookupName(name), id);
    }

    return ids;
  }

  /**
   * @param {number|string|null|undefined} platform
   * @returns {number|null}
   */
  _platformIdFromAny(platform) {
    if (platform === null || platform === undefined) return null;

    const raw = String(platform).trim();
    if (!raw) return null;

    if (/^\d+$/.test(raw)) {
      const id = Number(raw);
      return Number.isFinite(id) && id > 0 ? id : null;
    }

    const normalizedName = this._normalizePlatformLookupName(raw);
    const cachedId = this.#platformIdByNameCache.get(normalizedName);
    return typeof cachedId === 'number' && Number.isFinite(cachedId) && cachedId > 0 ? cachedId : null;
  }

  /**
   * Fallback for legacy backends where /api/games/list errors due DB schema mismatch.
   * It reconstructs a page by reading sequential IDs from /api/games/:id.
   *
   * @param {number} from
   * @param {number} pageSize
   * @returns {Promise<import('../models').GameListItem[]>}
   */
  async _getGamesByIdFallback(from, pageSize = 20) {
    const startId = Math.max(1, Number(from) + 1);
    const maxAttempts = pageSize * 6;
    const chunkSize = 8;
    /** @type {import('../models').GameListItem[]} */
    const results = [];

    let nextId = startId;
    let attempts = 0;

    while (results.length < pageSize && attempts < maxAttempts) {
      const batchIds = [];
      for (let i = 0; i < chunkSize && attempts < maxAttempts; i++) {
        batchIds.push(nextId++);
        attempts++;
      }

      const batch = await Promise.all(
        batchIds.map(async (id) => {
          const detailUrl = joinUrl(this.#serverUrl, 'api', 'games', enc(String(id)));
          const { ok, json } = await fetchJsonSafe(detailUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
          });

          if (!ok || !json || typeof json !== 'object') return null;

          const numericCost = Number(json.cost ?? json.price ?? 0);
          const numericPlatformId = Number(json.platform_id ?? 0);
          return {
            id: Number(json.id ?? id),
            app_id: json.app_id ?? json.id ?? id,
            name: json.name ?? `Game ${id}`,
            banner_img: json.banner_img ?? null,
            description: json.description ?? '',
            minimum_requirements: json.minimum_requirements ?? '',
            cost: Number.isFinite(numericCost) ? numericCost : 0,
            platform_id: Number.isFinite(numericPlatformId) ? numericPlatformId : 0,
            platform: json.platform_name ?? json.platform ?? this._platformNameFromId(json.platform_id),
          };
        })
      );

      for (const item of batch) {
        if (!item) continue;
        results.push(item);
        if (results.length >= pageSize) break;
      }
    }

    return results;
  }
/**

*Return the first non-empty string found at any of the provided nested paths inside source.
*Each path is an array of keys (strings or numbers) describing a nested access sequence (e.g. ['images','logo']).
*Only string values are considered valid; the found string is trimmed before being returned.
*@param {Object|null|undefined} source - The object to search through.
*@param {Array<Array<string|number>>} paths - Array of paths; each path is an array of keys to traverse.
*@returns {string|null} The trimmed string found at the first matching path, or null if none found.
*@example
*const obj = { images: { logo: ' //example.png ' } };
*getFirstStringByPaths(obj, [['images','logo'], ['image']]); // returns '//example.png'
*/
  _getFirstStringByPaths(source, paths) {
  for (const path of paths) {
    let cursor = source;
    let validPath = true;
    for (const key of path) {
      if (cursor == null || !(key in cursor)) {
        validPath = false;
        break;
      }
      //@ts-ignore
      cursor = cursor[key];
    }
    if (validPath && typeof cursor === 'string' && cursor.trim()) {
      return cursor.trim();
    }
  }
  return null;
}


/**
 * Normalizes an array of genre names by converting them to title case, removing duplicates, and filtering out utility genres.
 * @param {Array<string>} genreNames The array of genre names to normalize.
 * @returns {Array<string>} The normalized array of genre names.
 */
  _normalizeGenreNames(genreNames) {
  if (!Array.isArray(genreNames)) return [];
  const utilityGenreSet = new Set([
    'free',
    'paid',
    'on sale',
    'demo',
    'released',
    'coming soon',
    'new & popular',
    'top sellers',
  ]);
  const seen = new Set();
  const out = [];
  for (const raw of genreNames) {
    if (raw == null) continue;
    const genre = this._toTitleCaseWords(String(raw).replace(/[-_]/g, ' '));
    if (!genre) continue;
    const key = genre.toLowerCase();
    if (utilityGenreSet.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(genre);
  }
  return out;
}
/**
 * Converts a string to title case, trimming whitespace and replacing hyphens and underscores with spaces.
 * @param {string} text Text you want to clean up from whitespaces
 * @returns {string|null} The normalized string or null if the input is not a valid string
 */
  _toTitleCaseWords(text) {
  if (typeof text !== 'string') return null;
  const normalized = this._collapseWhitespace(text.toLowerCase());
  if (!normalized) return null;
  return normalized
    .split(' ')
    //@ts-ignore
    .map((w) => w ? (w[0].toUpperCase() + w.slice(1)) : w)
    .join(' ');
}
/**
 * Collapses multiple whitespace characters into a single space and trims the string.
 * @param {string} text The string to collapse whitespace in.
 * @returns {string|null} The collapsed string or null if the input is not a valid string.
 */
_collapseWhitespace(text) {
  if (typeof text !== 'string') return null;
  return text.replace(/\s+/g, ' ').trim();
}

  /**
   * @param {unknown} value
   * @returns {string|null}
   */
  _toOptionalString(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text ? text : null;
  }

  /**
   * @param {unknown} value
   * @returns {string}
   */
  _toComparableText(value) {
    if (value === null || value === undefined) return '';
    return String(value).replace(/\s+/g, ' ').trim();
  }

  /**
   * @param {unknown} value
   * @returns {number|null}
   */
  _toOptionalFiniteNumber(value) {
    if (value === null || value === undefined) return null;
    const asString = typeof value === 'string' ? value.trim() : null;
    if (asString === '') return null;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  /**
   * @param {number|null} left
   * @param {number|null} right
   * @returns {boolean}
   */
  _areCostsEquivalent(left, right) {
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (Math.abs((left ?? 0) - (right ?? 0)) <= 0.009) return true;

    // Handle mixed representations where one side is cents and the other is full currency units.
    if (Math.abs(((left ?? 0) * 100) - (right ?? 0)) <= 0.9) return true;
    if (Math.abs(((right ?? 0) * 100) - (left ?? 0)) <= 0.9) return true;
    return false;
  }

  /**
   * @param {any} value
   * @returns {string[]}
   */
  _normalizeGenresForCompare(value) {
    if (!Array.isArray(value)) return [];
    const seen = new Set();
    const normalized = [];
    for (const raw of value) {
      if (raw === null || raw === undefined) continue;
      const name = String(raw).trim().toLowerCase();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      normalized.push(name);
    }
    normalized.sort();
    return normalized;
  }

  /**
   * @param {number} status
   * @returns {boolean}
   */
  _isUnauthorizedStatus(status) {
    return Number(status) === 401;
  }

  /**
   * @param {unknown} err
   * @returns {boolean}
   */
  _isNotFoundError(err) {
    const message = String(err instanceof Error ? err.message : err || '').toLowerCase();
    return message.includes('http 404') || message.includes('not found');
  }

  /**
   * @param {any} existing
   * @param {any} scraped
   * @returns {{ payload: Record<string, any>, changedFields: string[] }}
   */
  _buildScrapedSyncDiff(existing, scraped) {
    /** @type {Record<string, any>} */
    const payload = {};
    /** @type {string[]} */
    const changedFields = [];

    /**
     * @param {string} field
     * @param {unknown} nextValue
     * @param {unknown} currentValue
     */
    const maybeSetText = (field, nextValue, currentValue) => {
      const next = this._toOptionalString(nextValue);
      if (!next) return;
      const currentComparable = this._toComparableText(currentValue);
      const nextComparable = this._toComparableText(next);
      if (nextComparable !== currentComparable) {
        payload[field] = next;
        changedFields.push(field);
      }
    };

    const nextAppId = this._toOptionalString(scraped?.app_id);
    const currentAppId = this._toOptionalString(existing?.app_id);
    if (nextAppId && nextAppId !== currentAppId) {
      payload.app_id = nextAppId;
      changedFields.push('app_id');
    }

    const nextPlatformId = this._platformIdFromAny(scraped?.platform_name ?? scraped?.platform_id);
    const currentPlatformId = this._platformIdFromAny(existing?.platform_name ?? existing?.platform_id);
    if (nextPlatformId && nextPlatformId !== currentPlatformId) {
      payload.platform_id = nextPlatformId;
      changedFields.push('platform_id');
    }

    maybeSetText('name', scraped?.name, existing?.name);
    maybeSetText('banner_img', scraped?.banner_img, existing?.banner_img);
    maybeSetText('description', scraped?.description, existing?.description);
    maybeSetText('minimum_requirements', scraped?.minimum_requirements, existing?.minimum_requirements);

    const nextCost = this._toOptionalFiniteNumber(scraped?.cost);
    const currentCost = this._toOptionalFiniteNumber(existing?.cost);
    if (nextCost !== null) {
      const changed = currentCost === null ? true : !this._areCostsEquivalent(currentCost, nextCost);
      if (changed) {
        payload.cost = nextCost;
        changedFields.push('cost');
      }
    }

    const nextGenres = this._normalizeGenresForCompare(scraped?.genre_names);
    const currentGenres = this._normalizeGenresForCompare(existing?.genre_names);
    if (nextGenres.length > 0 && nextGenres.join('|') !== currentGenres.join('|')) {
      payload.genre_names = nextGenres;
      changedFields.push('genre_names');
    }

    return { payload, changedFields };
  }

  /**
   * POST /api/games/upload
   * Auth: Authorization: Bearer <token>
   *
   * @param {string} token
   * @param {import('../models').UploadGameRequest|any} request
   * @returns {Promise<import('../models').UploadGameResult>}
   */
  async uploadGame(token, request) {
    if (!token || !String(token).trim()) throw new Error('Token is required');
    if (!request || typeof request !== 'object') throw new Error('Request body is required');
    let url = joinUrl(this.#serverUrl, 'api', 'games');
    let { ok, status, json, text } = await fetchJsonSafe(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(request),
      });
    return {
      ok,
      statusCode: status,
      response: json && typeof json === 'object' ? json : null,
      rawJson: json,
      rawText: text ?? null,
    };
  }

  /**
   * PUT /api/games/:gameId
   * Auth: Authorization: Bearer <token>
   *
   * @param {string} token
   * @param {number|string} gameId
   * @param {Record<string, any>} request
   * @returns {Promise<import('../models').UploadGameResult>}
   */
  async updateGame(token, gameId, request) {
    if (!token || !String(token).trim()) throw new Error('Token is required');
    const numericGameId = Number(gameId);
    if (!Number.isFinite(numericGameId) || numericGameId <= 0) throw new Error('Game ID is required');
    if (!request || typeof request !== 'object') throw new Error('Request body is required');

    const url = joinUrl(this.#serverUrl, 'api', 'games', enc(String(numericGameId)));
    const { ok, status, json, text } = await fetchJsonSafe(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });

    if (!ok) {
      const apiError = json && typeof json === 'object' ? (json.error || json.message) : null;
      const snippet = String(apiError ?? text ?? 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 300);
      if (this._isUnauthorizedStatus(status)) {
        const e = new Error(`Unauthorized (token invalid/expired): ${snippet || 'Unauthorized'}`);
        // @ts-ignore
        e.code = 'WRECK_INVALID_TOKEN';
        throw e;
      }
      throw new Error(`Game update failed (HTTP ${status}): ${snippet}`);
    }

    return {
      ok,
      statusCode: status,
      response: json && typeof json === 'object' ? json : null,
      rawJson: json,
      rawText: text ?? null,
    };
  }

  /**
   * Compare scraped detail payload to the existing game row (same app_id + platform)
   * and update only when meaningful fields changed.
   *
   * @param {string} token
   * @param {Record<string, any>} scrapedGame
   * @returns {Promise<{ action: 'created'|'updated'|'unchanged'|'skipped', changedFields: string[], gameId: number|null, reason?: string }>} 
   */
  async syncScrapedGameWithServer(token, scrapedGame) {
    const tokenStr = typeof token === 'string' ? token.trim() : '';
    if (!tokenStr) {
      return { action: 'skipped', changedFields: [], gameId: null, reason: 'missing-token' };
    }
    if (!scrapedGame || typeof scrapedGame !== 'object') {
      return { action: 'skipped', changedFields: [], gameId: null, reason: 'invalid-payload' };
    }

    const appIdNum = Number(scrapedGame.app_id);
    const platformName = this._toOptionalString(scrapedGame.platform_name);
    if (!Number.isFinite(appIdNum) || appIdNum <= 0 || !platformName) {
      return { action: 'skipped', changedFields: [], gameId: null, reason: 'missing-app-or-platform' };
    }

    const countryCode = this._toOptionalString(scrapedGame.country_code) || 'DE';
    const normalizedGenreNames = this._normalizeGenreNames(
      Array.isArray(scrapedGame.genre_names) ? scrapedGame.genre_names : []
    );

    const normalizedRequest = {
      app_id: String(appIdNum),
      platform_name: platformName,
      name: this._toOptionalString(scrapedGame.name) || `game:${String(appIdNum)}`,
      banner_img: this._toOptionalString(scrapedGame.banner_img) || '',
      description: this._toOptionalString(scrapedGame.description) || '',
      minimum_requirements: this._toOptionalString(scrapedGame.minimum_requirements) || '',
      cost: this._toOptionalFiniteNumber(scrapedGame.cost),
      genre_names: normalizedGenreNames,
      country_code: countryCode,
    };

    let existing = null;
    try {
      existing = await this.getAllDetailsByAppIDAndPlatform(normalizedRequest.app_id, platformName, countryCode);
    } catch (err) {
      if (!this._isNotFoundError(err)) throw err;
    }

    if (!existing) {
      const uploadResult = await this.uploadGame(tokenStr, normalizedRequest);
      if (!uploadResult.ok) {
        if (this._isUnauthorizedStatus(uploadResult.statusCode)) {
          const msg = uploadResult.rawText || uploadResult.response?.error || uploadResult.response?.message || 'Unauthorized';
          const e = new Error(`Unauthorized (token invalid/expired): ${String(msg).slice(0, 300)}`);
          // @ts-ignore
          e.code = 'WRECK_INVALID_TOKEN';
          throw e;
        }
        if (uploadResult.statusCode !== 400) {
          const msg = uploadResult.rawText || uploadResult.response?.error || uploadResult.response?.message || 'Unknown error';
          throw new Error(`Game upload failed (HTTP ${uploadResult.statusCode}): ${String(msg).slice(0, 300)}`);
        }
      }
      const createdGameId = Number(uploadResult.response?.gameId ?? null);
      return {
        action: uploadResult.ok ? 'created' : 'unchanged',
        changedFields: uploadResult.ok ? ['created'] : [],
        gameId: Number.isFinite(createdGameId) && createdGameId > 0 ? createdGameId : null,
      };
    }

    const gameId = Number(existing.id);
    if (!Number.isFinite(gameId) || gameId <= 0) {
      return { action: 'skipped', changedFields: [], gameId: null, reason: 'missing-game-id' };
    }

    const diff = this._buildScrapedSyncDiff(existing, normalizedRequest);
    if (diff.changedFields.length < 1) {
      return { action: 'unchanged', changedFields: [], gameId };
    }

    await this.updateGame(tokenStr, gameId, diff.payload);
    return { action: 'updated', changedFields: diff.changedFields, gameId };
  }

  /**
   * Get all details of a game by ID.
   * 
   * @param {number} id 
    * @returns {Promise<import('../models').GameDetails>}
   */
  async getAllDetailsByID(id, countryCode = 'DE'){
    // Note: allow numeric 0 check explicitly; reject null/undefined/NaN.
    if (id === undefined || id === null || Number.isNaN(Number(id))) throw new Error('Game ID is required');

    // Backend endpoint is /api/games/:appId/all where :appId is the platform-specific app id (e.g. Steam appid).
    const normalizedCountryCode = String(countryCode || 'DE').trim() || 'DE';
    const url = `${joinUrl(this.#serverUrl, 'api', 'games', enc(String(id)), 'details')}?country_code=${enc(normalizedCountryCode)}`;

    const { ok, status, json, text } = await fetchJsonSafe(url,{
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!ok) {
      const apiError = json && typeof json === 'object' ? (json.error || json.message) : null;
      const snippet = String(apiError ?? text ?? 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 300);
      throw new Error(`Failed to fetch game details (HTTP ${status}): ${snippet}`);
    }

    const obj = json && typeof json === 'object' ? json : null;
    console.log('getAllDetailsByID response:', obj);

    const rawGenres = Array.isArray(obj?.genres) ? obj.genres : null;
    const genreNamesFromBackend = Array.isArray(rawGenres)
      ? rawGenres
          .map((g) => (g && typeof g === 'object' ? (g.genre ?? g.name ?? g.description) : null))
          .filter((v) => typeof v === 'string' && v.trim())
      : null;

    return {
      id: obj?.id ?? null,
      app_id: obj?.app_id ?? null,
      name: obj?.name ?? null,
      // Backend currently returns `platform` (see SQL alias); keep `platform_name` for renderer compatibility.
      platform_name: obj?.platform_name ?? obj?.platform ?? null,
      banner_img: obj?.banner_img ?? null,
      description: obj?.description ?? null,
      minimum_requirements: obj?.minimum_requirements ?? null,
      cost: this._toOptionalFiniteNumber(obj?.cost),
      price: this._toOptionalFiniteNumber(obj?.price),
      currency: this._toOptionalString(obj?.currency),
      formated_price: this._toOptionalString(obj?.formated_price),
      country_code: this._toOptionalString(obj?.country_code),
      // Backend returns `genres` as rows; derive `genre_names` for the existing UploadGameRequest shape.
      genre_names: Array.isArray(obj?.genre_names)
        ? obj.genre_names
        : (genreNamesFromBackend && genreNamesFromBackend.length ? genreNamesFromBackend : null),
    };
  }
  /**
   * 
   * @param {string|number} appId 
   * @param {string|number} platform 
   * @param {string} countryCode
   * @returns 
   */
  async getAllDetailsByAppIDAndPlatform(appId, platform, countryCode = 'DE'){
    if (!appId || !String(appId).trim()) throw new Error('App ID is required');
    if (!platform || !String(platform).trim()) throw new Error('Platform is required');

    const platformIds = await this._resolvePlatformIds(platform);
    if (platformIds.length < 1) throw new Error(`Invalid platform: ${String(platform)}`);

    const normalizedCountryCode = String(countryCode || 'DE').trim() || 'DE';
    let lastNotFoundError = null;
    for (const platformId of platformIds) {
      const url = `${joinUrl(this.#serverUrl, 'api', 'games', 'platforms', enc(String(platformId)), 'app-id', enc(String(appId)), 'details')}?country_code=${enc(normalizedCountryCode)}`;
      const { ok, status, json, text } = await fetchJsonSafe(url,{
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      if (!ok) {
        const apiError = json && typeof json === 'object' ? (json.error || json.message) : null;
        const snippet = String(apiError ?? text ?? 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 300);
        const error = new Error(`Failed to fetch game details (HTTP ${status}): ${snippet}`);
        if (Number(status) === 404) {
          lastNotFoundError = error;
          continue;
        }
        throw error;
      }

      const obj = json && typeof json === 'object' ? json : null;
      const rawGenres = Array.isArray(obj?.genres) ? obj.genres : null;
      const genreNamesFromBackend = Array.isArray(rawGenres)
        ? rawGenres          .map((g) => (g && typeof g === 'object' ? (g.genre ?? g.name ?? g.description) : null))
            .filter((v) => typeof v === 'string' && v.trim())
        : null;
      console.log('Platform + appid gameDetails: ', json);
      return {
        id: obj?.id ?? null,
        app_id: obj?.app_id ?? null,
        name: obj?.name ?? null,
        platform_name: obj?.platform_name ?? obj?.platform ?? null,
        banner_img: obj?.banner_img ?? null,
        description: obj?.description ?? null,
        minimum_requirements: obj?.minimum_requirements ?? null,
        cost: this._toOptionalFiniteNumber(obj?.cost),
        price: this._toOptionalFiniteNumber(obj?.price),
        currency: this._toOptionalString(obj?.currency),
        formated_price: this._toOptionalString(obj?.formated_price),
        country_code: this._toOptionalString(obj?.country_code),
        genre_names: Array.isArray(obj?.genre_names)
          ? obj.genre_names
          : (genreNamesFromBackend && genreNamesFromBackend.length ? genreNamesFromBackend : null),
        pirate_sites: Array.isArray(obj?.pirate_sites) ? obj.pirate_sites : null,
      };
    }

    if (lastNotFoundError) throw lastNotFoundError;
    throw new Error('Failed to fetch game details: no platform candidates resolved');
  }

  /**
   * GET /api/games/list/:from
   * Returns up to 20 games starting from the given offset.
   * Each element is a joined row of `games` + `platforms` as returned by the backend
   * (`GamesController.getWithAllForeign`); see {@link import('../models').GameListItem}.
   *
   * @param {number} from  Row offset (0-based)
   * @returns {Promise<import('../models').GameListItem[]>}  Array of up to 20 game rows
   */
  async getGames(from, countryCode = "DE") {
    if (from === undefined || from === null || Number.isNaN(Number(from))) throw new Error('from is required');

    const normalizedCountryCode = String(countryCode || 'DE').trim() || 'DE';
    const url = `${joinUrl(this.#serverUrl, 'api', 'games', 'list', enc(String(from)))}?country_code=${enc(normalizedCountryCode)}`;

    const { ok, status, json, text } = await fetchJsonSafe(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!ok && this._isLegacyListSchemaError(status, json, text)) {
      const fallbackGames = await this._getGamesByIdFallback(Number(from), 20);
      if (fallbackGames.length > 0) {
        return fallbackGames;
      }
    }

    if (!ok) {
      const apiError = json && typeof json === 'object' ? (json.error || json.message) : null;
      const snippet = String(apiError ?? text ?? 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 300);
      throw new Error(`Failed to fetch games (HTTP ${status}): ${snippet}`);
    }

    return Array.isArray(json) ? json : (json ?? []);
  }
  /**
   * 
   * @param {string} token 
   * @param {string} appId 
   * @param {string} platform 
   * @param {Array<string|{name?: string, site_name?: string, url?: string, link?: string}>} pirateSites 
   */
  async uploadPirateSites(token, appId, platform, pirateSites){
    const tokenStr = String(token || '').trim();
    if (!tokenStr) throw new Error('Token is required');
    if (appId == null || String(appId).trim() === '') throw new Error('App ID is required');
    if (platform == null || String(platform).trim() === '') throw new Error('Platform is required');
    if (!Array.isArray(pirateSites)) throw new Error('Pirate sites array is required');

    /**
     * @param {unknown} value
     * @returns {string|null}
     */
    const normalizeSiteName = (value) => {
      const raw = String(value || '').trim().toLowerCase();
      if (!raw) return null;
      if (raw.includes('fitgirl')) return 'fitgirl';
      if (raw.includes('pcgames')) return 'pcgames';
      if (raw.includes('dodi')) return 'dodi';
      const compact = raw.replace(/[^a-z0-9]/g, '');
      return compact ? compact.slice(0, 10) : null;
    };

    /**
     * Keep persisted pirate links under legacy DB limits.
     * For magnets we preserve core identifiers (xt + dn) and drop long tracker lists.
     * @param {string} rawLink
     * @param {number} [maxLength]
     * @returns {string}
     */
    const compactPirateLinkForStorage = (rawLink, maxLength = 500) => {
      const link = String(rawLink || '').trim();
      if (!link) return '';
      if (link.length <= maxLength) return link;

      if (/^magnet:\?/i.test(link)) {
        try {
          const qIndex = link.indexOf('?');
          const query = qIndex >= 0 ? link.slice(qIndex + 1) : '';
          const params = new URLSearchParams(query);
          const xt = params.get('xt');
          const dn = params.get('dn');
          const ws = params.get('ws');

          const compactParams = new URLSearchParams();
          if (xt) compactParams.set('xt', xt);
          if (dn) compactParams.set('dn', dn);
          if (ws) compactParams.set('ws', ws);

          const compactMagnet = `magnet:?${compactParams.toString()}`;
          if ((xt || dn) && compactMagnet.length <= maxLength) {
            return compactMagnet;
          }

          if (xt) {
            const xtOnly = `magnet:?xt=${encodeURIComponent(xt)}`;
            if (xtOnly.length <= maxLength) return xtOnly;
          }
        } catch {
          // fall through to hard cut below
        }
      }

      // Last-resort hard cut for unexpected overly long non-magnet links.
      return link.slice(0, Math.max(32, maxLength));
    };

    /** @type {Array<{ originalLink: string, link: string, siteName: string|null, siteId: number|null }>} */
    const normalizedSites = [];
    const seenLinks = new Set();

    for (const rawSite of pirateSites) {
      let link = null;
      let siteName = null;
      let siteId = null;

      if (typeof rawSite === 'string') {
        link = rawSite.trim();
      } else if (rawSite && typeof rawSite === 'object') {
        const anySite = /** @type {any} */ (rawSite);
        link = String(anySite.url ?? anySite.link ?? '').trim();
        siteName = normalizeSiteName(anySite.name ?? anySite.site_name ?? anySite.siteName ?? null);
        const parsedSiteId = Number(anySite.site_id ?? anySite.siteId ?? anySite.pirate_site_id ?? anySite.pirateSiteId ?? null);
        siteId = Number.isFinite(parsedSiteId) && parsedSiteId > 0 ? parsedSiteId : null;
      }

      if (!link) continue;
      if (!/^https?:\/\//i.test(link) && !/^magnet:\?/i.test(link)) continue;

      const dedupeKey = link.trim().toLowerCase();
      if (seenLinks.has(dedupeKey)) continue;
      seenLinks.add(dedupeKey);

      normalizedSites.push({
        originalLink: link,
        link: compactPirateLinkForStorage(link, 500),
        siteName,
        siteId,
      });
    }

    if (normalizedSites.length < 1) {
      return { uploaded: 0, skipped: 0, errors: [] };
    }

    // Resolve DB game id from (platform, app_id) before attaching pirate links.
    const details = await this.getAllDetailsByAppIDAndPlatform(String(appId), String(platform), 'DE');
    const gameId = Number(details?.id);
    if (!Number.isFinite(gameId) || gameId <= 0) {
      throw new Error(`Failed to resolve game id for appId=${String(appId)} platform=${String(platform)}`);
    }

    const authHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${tokenStr}`,
    };

    /** @type {{ uploaded: number, skipped: number, errors: string[] }} */
    const summary = { uploaded: 0, skipped: 0, errors: [] };

    for (const site of normalizedSites) {
      const postNewPath = joinUrl(this.#serverUrl, 'api', 'pirate-sites', enc(String(gameId)));
      const putNewPath = joinUrl(this.#serverUrl, 'api', 'pirate-sites', enc(String(gameId)));
      const legacyPath = joinUrl(this.#serverUrl, 'api', 'pirate_sites', enc(String(gameId)));
      const explicitSiteId = Number.isFinite(Number(site.siteId)) && Number(site.siteId) > 0
        ? Number(site.siteId)
        : null;
      const structuredBody = {
        game_id: gameId,
        gameId,
        link: site.link,
        ...(site.siteName ? { site_name: site.siteName, siteName: site.siteName } : {}),
        ...(typeof explicitSiteId === 'number' && Number.isFinite(explicitSiteId)
          ? {
              site_id: explicitSiteId,
              siteId: explicitSiteId,
              pirate_site_id: explicitSiteId,
              pirateSiteId: explicitSiteId,
            }
          : {}),
      };
      const attemptBodies = [
        {
          label: 'POST /api/pirate-sites/:gameId',
          method: 'POST',
          url: postNewPath,
          body: structuredBody,
        },
        {
          label: 'PUT /api/pirate-sites/:gameId',
          method: 'PUT',
          url: putNewPath,
          body: structuredBody,
        },
        {
          label: 'PUT /api/pirate-sites/:gameId (sites array)',
          method: 'PUT',
          url: putNewPath,
          body: { sites: [site.link] },
        },
        {
          label: 'PUT /api/pirate_sites/:gameId',
          method: 'PUT',
          url: legacyPath,
          body: structuredBody,
        },
        {
          label: 'PUT /api/pirate_sites/:gameId (sites array)',
          method: 'PUT',
          url: legacyPath,
          body: { sites: [site.link] },
        },
        {
          label: 'POST /api/pirate_sites/:gameId',
          method: 'POST',
          url: legacyPath,
          body: structuredBody,
        },
      ];

      if (typeof explicitSiteId === 'number' && Number.isFinite(explicitSiteId) && explicitSiteId > 0) {
        attemptBodies.push(
          {
            label: 'PUT /api/pirate-sites/:siteId/game/:gameId',
            method: 'PUT',
            url: joinUrl(this.#serverUrl, 'api', 'pirate-sites', enc(String(explicitSiteId)), 'game', enc(String(gameId))),
            body: { game_id: gameId, gameId, link: site.link },
          },
          {
            label: 'PUT /api/pirate_sites/:siteId/game/:gameId',
            method: 'PUT',
            url: joinUrl(this.#serverUrl, 'api', 'pirate_sites', enc(String(explicitSiteId)), 'game', enc(String(gameId))),
            body: { game_id: gameId, gameId, link: site.link },
          }
        );
      }

      let uploaded = false;
      let lastErrorMessage = 'unknown upload error';
      const attemptErrors = [];

      for (const attempt of attemptBodies) {
        const { ok, status, json, text } = await fetchJsonSafe(attempt.url, {
          method: attempt.method,
          headers: authHeaders,
          body: JSON.stringify(attempt.body),
        });

        if (ok) {
          summary.uploaded += 1;
          uploaded = true;
          break;
        }

        const apiError = json && typeof json === 'object' ? (json.error || json.message) : null;
        const snippet = String(apiError ?? text ?? 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 300);
        const lowered = snippet.toLowerCase();
        attemptErrors.push(`${attempt.label}: HTTP ${status} ${snippet}`);

        if (status === 401) {
          const unauthorizedError = new Error(`Failed to upload pirate sites (HTTP ${status}): ${snippet}`);
          // @ts-ignore
          unauthorizedError.code = 'WRECK_INVALID_TOKEN';
          throw unauthorizedError;
        }

        if (lowered.includes('duplicate') || lowered.includes('already exists')) {
          summary.skipped += 1;
          uploaded = true;
          break;
        }

        if (!lastErrorMessage || lastErrorMessage === 'unknown upload error' || (status !== 404 && status !== 405)) {
          lastErrorMessage = `HTTP ${status}: ${snippet}`;
        }

        // Route mismatch and payload mismatch are expected between backend variants,
        // so keep trying fallback variants before failing this site.
        if (status === 404 || status === 405 || status === 400 || status === 422 || status === 500) {
          continue;
        }
      }

      if (!uploaded) {
        const compactAttempts = attemptErrors.slice(0, 8).join(' | ');
        summary.errors.push(`${site.originalLink.slice(0, 80)} -> ${lastErrorMessage} (${compactAttempts})`);
      }
    }

    if (summary.errors.length > 0) {
      console.warn('[GamesController.uploadPirateSites] some uploads failed:', summary.errors);
    }

    return summary;
  }

}

module.exports = GamesController;
