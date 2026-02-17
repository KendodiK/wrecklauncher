// @ts-check

/**
 * @param {number} status
 * @param {any|null} json
 * @param {string} text
 * @returns {string}
 */
function httpErrorMessage(status, json, text) {
  const jsonMsg = json?.error || json?.message;
  if (typeof jsonMsg === 'string' && jsonMsg.trim()) return jsonMsg;
  const snippet = String(text || '').trim().slice(0, 300);
  return snippet || `HTTP ${status}`;
}

/**
 * Fetches a URL and returns both text and parsed JSON (if any).
 * Uses global fetch when available; falls back to undici.fetch.
 *
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<{ ok: boolean, status: number, text: string, json: any|null, headers: any }>} 
 */
async function fetchJsonSafe(url, options) {
  /** @type {any} */
  let doFetch = globalThis.fetch;
  if (typeof doFetch !== 'function') {
    try {
      ({ fetch: doFetch } = require('undici'));
    } catch {
      throw new Error('fetch() is not available (need Node 18+ or undici)');
    }
  }

  const res = await doFetch(url, options);
  const text = await res.text();

  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  return { ok: !!res.ok, status: Number(res.status) || 0, text, json, headers: res.headers };
}

module.exports = {
  fetchJsonSafe,
  httpErrorMessage,
};
