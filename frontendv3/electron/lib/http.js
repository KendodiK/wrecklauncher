// @ts-check

const { getLocalhostDispatcher } = require('./localhost-tls');

/**
 * @param {string} url
 * @returns {boolean}
 */
function isHttpsLocalhost(url) {
  try {
    const u = new URL(url);
    const isLocalhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
    return isLocalhost && u.protocol === 'https:';
  } catch {
    return false;
  }
}

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
 * @param {RequestInit & { dispatcher?: any }} [options]
 * @returns {Promise<{ ok: boolean, status: number, text: string, json: any|null, headers: any }>} 
 */
async function fetchJsonSafe(url, options) {
  /** @type {any} */
  let doFetch = globalThis.fetch;
  /** @type {any} */
  let undiciFetch = null;

  // We prefer Node's global fetch for general requests, but for localhost HTTPS
  // we may need undici's dispatcher feature to trust dev certs.
  try {
    ({ fetch: undiciFetch } = require('undici'));
  } catch {
    undiciFetch = null;
  }

  if (typeof doFetch !== 'function') {
    if (typeof undiciFetch === 'function') {
      doFetch = undiciFetch;
    } else {
      throw new Error('fetch() is not available (need Node 18+ or undici)');
    }
  }

  /** @type {RequestInit & { dispatcher?: any }} */
  const finalOptions = { ...(options || {}) };

  if (isHttpsLocalhost(url)) {
    // Use undici.fetch when we need dispatcher support.
    if (typeof undiciFetch === 'function') {
      doFetch = undiciFetch;
    }

    if (!('dispatcher' in finalOptions)) {
      const dispatcher = getLocalhostDispatcher();
      if (dispatcher) finalOptions.dispatcher = dispatcher;
    }
  }

  const res = await doFetch(url, finalOptions);
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
