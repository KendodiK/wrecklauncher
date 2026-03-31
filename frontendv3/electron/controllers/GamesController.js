// @ts-check

const { enc, joinUrl, normalizeBaseUrl } = require('../lib/url');
const { fetchJsonSafe } = require('../lib/http');
const { stringify } = require('querystring');

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
   * Get all details of a game by ID.
   * 
   * @param {number} id 
    * @returns {Promise<import('../models').GameDetails>}
   */
  async getAllDetailsByID(id){
    // Note: allow numeric 0 check explicitly; reject null/undefined/NaN.
    if (id === undefined || id === null || Number.isNaN(Number(id))) throw new Error('Game ID is required');

    // Backend endpoint is /api/games/:appId/all where :appId is the platform-specific app id (e.g. Steam appid).
    const url = joinUrl(this.#serverUrl, 'api', 'games', enc(String(id)), 'details');

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
      app_id: obj?.app_id ?? null,
      name: obj?.name ?? null,
      // Backend currently returns `platform` (see SQL alias); keep `platform_name` for renderer compatibility.
      platform_name: obj?.platform_name ?? obj?.platform ?? null,
      banner_img: obj?.banner_img ?? null,
      description: obj?.description ?? null,
      minimum_requirements: obj?.minimum_requirements ?? null,
      cost: obj?.cost ?? 0,
      // Backend returns `genres` as rows; derive `genre_names` for the existing UploadGameRequest shape.
      genre_names: Array.isArray(obj?.genre_names)
        ? obj.genre_names
        : (genreNamesFromBackend && genreNamesFromBackend.length ? genreNamesFromBackend : null),
    };
  }
  /**
   * 
   * @param {string} appId 
   * @param {string} platformId 
   * @returns 
   */
  async getAllDetailsByAppIDAndPlatform(appId, platformId){
    if (!appId || !String(appId).trim()) throw new Error('App ID is required');
    if (!platformId || !String(platformId).trim()) throw new Error('Platform ID is required');
    const url = joinUrl(this.#serverUrl, 'api', 'games','platform', enc(String(platformId)),'app-id', enc(String(appId)), 'details');
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
      app_id: obj?.app_id ?? null,
      name: obj?.name ?? null,
      platform_name: obj?.platform_name ?? obj?.platform ?? null,
      banner_img: obj?.banner_img ?? null,
      description: obj?.description ?? null,
      minimum_requirements: obj?.minimum_requirements ?? null,
      cost: obj?.cost ?? 0,
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
  async getGames(from) {
    if (from === undefined || from === null || Number.isNaN(Number(from))) throw new Error('from is required');

    const url = joinUrl(this.#serverUrl, 'api', 'games', 'list', enc(String(from)));

    const { ok, status, json, text } = await fetchJsonSafe(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

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
