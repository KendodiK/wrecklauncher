// @ts-check

const fs = require('fs/promises');
const path = require('path');
const fsSync = require('fs');

const { normalizeBaseUrl, enc, joinUrl } = require('../lib/url');
const { fetchJsonSafe } = require('../lib/http');

/**
 * @typedef {string} AuthToken
 */

class TokenController {
  /** @type {AuthToken|null} */
  #token = null;
  /** @type {string} */
  #tokenFile;
  /** @type {string} */
  #username;
  /** @type {string} */
  #password;
  /** @type {string} */
  #email;

  /** @protected */
  _serverUrl;

  /**
   * @param {{ username: string, password: string, email: string, tokenFile: string, serverUrl: string }} cfg
   */
  constructor(cfg) {
    this.#username = String(cfg.username || '');
    this.#password = String(cfg.password || '');
    this.#email = String(cfg.email || '');
    this.#tokenFile = String(cfg.tokenFile || 'token.txt');
    this._serverUrl = normalizeBaseUrl(cfg.serverUrl || '', { defaultProtocol: 'http:' });
  }

  /**
   * Clears any cached token and removes the persisted token file.
   * Useful when the backend rotated tokens and the cached one became invalid.
   * @protected
   */
  async _invalidateToken() {
    this.#token = null;
    try {
      await fs.unlink(this.#tokenFile);
    } catch {
      // ignore
    }
  }

  /**
   * @param {AuthToken} token
   */
  async #saveToken(token) {
    await fs.mkdir(path.dirname(this.#tokenFile), { recursive: true });
    await fs.writeFile(this.#tokenFile, token, 'utf8');
  }

  /**
   * @returns {Promise<AuthToken|null>}
   */
  async #getTokenFromFile() {
    try {
      if (!fsSync.existsSync(this.#tokenFile)) return null;
      const token = String(await fs.readFile(this.#tokenFile, 'utf8') || '').trim();
      if (!token) return null;
      return token.replace(/^"(.*)"$/, '$1');
    } catch {
      return null;
    }
  }

  /**
   * POST /api/login/:username/:password
   * @returns {Promise<AuthToken|null>}
   */
  async login() {
    const url = joinUrl(this._serverUrl, 'api', 'login', enc(this.#username), enc(this.#password));
    const { ok, status, json, text } = await fetchJsonSafe(url, { method: 'POST' });
    if (!ok) throw new Error(`Login failed: HTTP ${status}${text ? ` - ${String(text).slice(0, 200)}` : ''}`);

    if (typeof json === 'string' && json.trim()) return /** @type {AuthToken} */ (json.trim());
    if (typeof text === 'string') {
      const t = text.trim().replace(/^"(.*)"$/, '$1');
      if (t) return /** @type {AuthToken} */ (t);
    }
    return null;
  }

  /**
   * Registers a new user and returns the token.
   * @param {string} username 
   * @param {string} password 
   * @param {string} email
   * @returns token on success, null on failure (e.g. username taken)
    * @throws on HTTP errors or unexpected responses
   */
  async register(username, password, email) {
    const url = joinUrl(this._serverUrl, 'api', 'signup');
    const { ok, status, json, text } = await fetchJsonSafe(url, { 
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        username,
        password,
        email
      })
    });
    if (!ok) throw new Error(`Registration failed: HTTP ${status}${text ? ` - ${String(text).slice(0, 200)}` : ''}`);
    if (typeof json === 'string' && json.trim()) return /** @type {AuthToken} */ (json.trim());
    if (typeof text === 'string') {
      this.#username = username;
      this.#password = password;
      this.#email = email;
      const t = text.trim().replace(/^"(.*)"$/, '$1');
      if (t) return /** @type {AuthToken} */ (t);
    }
    return null;
  }
  /**
   * @returns {Promise<AuthToken|null>}
   */
  async getToken() {
    if (this.#token) return this.#token;

    const fromFile = await this.#getTokenFromFile();
    if (fromFile) {
      this.#token = fromFile;
      return fromFile;
    }

    const token = await this.login();
    if (!token) return null;
    await this.#saveToken(token);
    this.#token = token;
    return token;
  }
}

module.exports = TokenController;
