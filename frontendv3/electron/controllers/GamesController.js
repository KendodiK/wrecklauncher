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
    const url = joinUrl(this.#serverUrl, 'api', 'games', enc(String(id)), 'all');

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
   * @param {string} platform 
   * @returns 
   */
  async getAllDetailsByAppIDAndPlatform(appId, platform){
    if (!appId || !String(appId).trim()) throw new Error('App ID is required');
    if (!platform || !String(platform).trim()) throw new Error('Platform is required');
    const url = joinUrl(this.#serverUrl, 'api', 'games', enc(String(platform)), enc(String(appId)), 'all');
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
    console.log('getAllDetailsByAppIDAndPlatform response:', obj);
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
