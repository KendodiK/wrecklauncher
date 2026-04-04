// @ts-check

const { enc, joinUrl, normalizeBaseUrl } = require('../lib/url');
const { fetchJsonSafe } = require('../lib/http');

class GamesController {
  /** @type {string} */
  #serverUrl;

  /**
   * @param {{ serverUrl: string }} cfg
   */
  constructor(cfg) {
    this.#serverUrl = normalizeBaseUrl(cfg.serverUrl || '', { defaultProtocol: 'http:' });
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
    if (id === 1) return 'steam';
    if (id === 3) return 'itchio';
    if (id === 4) return 'gog';
    return null;
  }

  /**
   * @param {number|string|null|undefined} platform
   * @returns {number|null}
   */
  _platformIdFromAny(platform) {
    if (platform === null || platform === undefined) return null;
    const raw = String(platform).trim().toLowerCase();
    if (!raw) return null;
    if (/^\d+$/.test(raw)) {
      const id = Number(raw);
      if (!Number.isFinite(id)) return null;
      if (id !== 1 && id !== 3 && id !== 4) return null;
      return id;
    }
    if (raw === 'steam') return 1;
    if (raw === 'itch' || raw === 'itchio' || raw === 'itch.io') return 3;
    if (raw === 'gog') return 4;
    return null;
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

    const platformId = this._platformIdFromAny(platform);
    if (!platformId) throw new Error(`Invalid platform: ${String(platform)}`);

    const normalizedCountryCode = String(countryCode || 'DE').trim() || 'DE';
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
      throw new Error(`Failed to fetch game details (HTTP ${status}): ${snippet}`);
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
   * @param {object} pirateSites 
   */
  //FINISH LATER!!!!!!!!!!!!!!!!!!!!
  async uploadPirateSites(token, appId, platform, pirateSites){
    if (!token || !String(token).trim()) throw new Error('Token is required');
    if (!appId || !String(appId).trim()) throw new Error('App ID is required');
    if (!platform || !String(platform).trim()) throw new Error('Platform is required');
    if (!pirateSites || !Array.isArray(pirateSites)) throw new Error('Pirate sites array is required');
    const gameUrl = joinUrl(this.#serverUrl, 'api', 'games', enc(String(platform)), enc(String(appId)));
    const { ok, status, json, text } = await fetchJsonSafe(gameUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    });

    if (!ok) {
      const apiError = json && typeof json === 'object' ? (json.error || json.message) : null;
      const snippet = String(apiError ?? text ?? 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 300);
      throw new Error(`Failed to fetch game details (HTTP ${status}): ${snippet}`);
    }
    for (const site of pirateSites) {
      if (!site || typeof site !== 'string' || !site.trim()) {
        throw new Error('Each pirate site must be a non-empty string');
      }    
    const url = joinUrl(this.#serverUrl, 'api', 'pirate_sites', enc(String(json.id)));
    console.log('Uploading pirate sites to:', url, 'Sites:', pirateSites);
    const { ok: uploadOk, status: uploadStatus, json: uploadJson, text: uploadText } = await fetchJsonSafe(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ sites: pirateSites })
    });
    if (!uploadOk) {
      const apiError = uploadJson && typeof uploadJson === 'object' ? (uploadJson.error || uploadJson.message) : null;
      const snippet = String(apiError ?? uploadText ?? 'Unknown error').replace(/\s+/g, ' ').trim().slice(0, 300);
      throw new Error(`Failed to upload pirate sites (HTTP ${uploadStatus}): ${snippet}`);
    }    
  }
  return true;
  }

}

module.exports = GamesController;
