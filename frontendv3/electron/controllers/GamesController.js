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
    const obj = json && typeof json === 'object' ? json : null;
    /*@type {import('../models').UploadGameRequest} */
    console.log('getAllDetailsByID response:', obj);
    return {
      app_id: obj?.app_id ?? null,
      name: obj?.name ?? null,
      platform_name: obj?.platform_name ?? null,
      banner_img: obj?.banner_img ?? null,
      description: obj?.description ?? null,
      minimum_requirements: obj?.minimum_requirements ?? null,
      cost: obj?.cost ?? 0,
      genre_names: Array.isArray(obj?.genre_names) ? obj.genre_names : null,
    };
  }
}

module.exports = GamesController;
