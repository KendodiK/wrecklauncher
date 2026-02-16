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
   * POST /api/games/upload/:token
   * Note: api.js validates auth via Authorization header; keep both.
   *
   * @param {string} token
   * @param {import('../models').UploadGameRequest|any} request
   * @returns {Promise<import('../models').UploadGameResult>}
   */
  async uploadGame(token, request) {
    if (!token || !String(token).trim()) throw new Error('Token is required');
    if (!request || typeof request !== 'object') throw new Error('Request body is required');

    const url = joinUrl(this.#serverUrl, 'api', 'games',);

    const { ok, status, json, text } = await fetchJsonSafe(url,{
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
   * @param {string} token 
   * @param {number} id 
   * @returns {Promise<import('../models').UploadGameRequest>}
   */
  async getAllDetailsByID(token, id){
    if (!token || !String(token).trim()) throw new Error('Token is required');
    if (!id || !String(id).trim()) throw new Error('Game ID is required');
    const url = joinUrl(this.#serverUrl, 'api', 'games', enc(stringify({id})), 'all');

    const { ok, status, json, text } = await fetchJsonSafe(url,{
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });    
    /*@type {import('../models').UploadGameRequest} */
    return {
      app_id: json && typeof json === 'object' && 'app_id' in json ? json.app_id : null,
      name: json && typeof json === 'object' && 'name' in json ? json.name : null,
      platform_name: json && typeof json === 'object' && 'platform_name' in json ? json.platform_name : null,
      banner_img: json && typeof json === 'object' && 'banner_img' in json ? json.banner_img : null,
      description: json && typeof json === 'object' && 'description' in json ? json.description : null,
      minimum_requirements: json && typeof json === 'object' && 'minimum_requirements' in json ? json.minimum_requirements : null,
      cost: json && typeof json === 'object' && 'cost' in json ? json.cost : null,
      genre_names: json && typeof json === 'object' && 'genre_names' in json && Array.isArray(json.genre_names) ? json.genre_names : null,
    };
  }
}

module.exports = GamesController;
