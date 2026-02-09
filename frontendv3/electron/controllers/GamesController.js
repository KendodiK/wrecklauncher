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

    const url = joinUrl(this.#serverUrl, 'api', 'games', 'upload', enc(token));

    const { ok, status, json, text } = await fetchJsonSafe(url, {
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
}

module.exports = GamesController;
