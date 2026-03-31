// @ts-check

const { normalizeBaseUrl, enc, joinUrl } = require('../lib/url');
const { fetchJsonSafe } = require('../lib/http');

/**
 * @typedef {string} AuthToken
 */

class TokenController {
  /** @type {AuthToken|null} */
  #token = null;
  /** @type {string} */
  #username;
  /** @type {string} */
  #password;
  /** @type {string} */
  #email;

  /** @protected */
  _serverUrl;

  /**
   * @param {string} serverurl
   */
  constructor(serverurl) {
    this._serverUrl = normalizeBaseUrl(serverurl || '', { defaultProtocol: 'http:' });
    this.#username = '';
    this.#password = '';
    this.#email = '';
  }

  /**
   * Sets the current token (typically sourced from renderer localStorage).
   * @param {AuthToken|null|undefined} token
   */
  setToken(token) {
    const t = typeof token === 'string' ? token.trim() : '';
    this.#token = t ? /** @type {AuthToken} */ (t) : null;
  }
  /**
   * Clears any cached token.
   * Useful when the backend rotated tokens and the cached one became invalid.
   * @protected
   */
  async _invalidateToken() {
    this.#token = null;
  }

  /**
   * POST /api/login/:username/:password
   * @returns {Promise<AuthToken|null>}
   */
  async login(username = this.#username, password = this.#password) {
    const url = joinUrl(this._serverUrl, 'api', 'login', enc(username), enc(password));
    const { ok, status, json, text } = await fetchJsonSafe(url, { method: 'PUT' });
    if (!ok) throw new Error(`Login failed: HTTP ${status}${text ? ` - ${String(text).slice(0, 200)}` : ''}`);

    if (typeof json === 'string' && json.trim()) {
      const t = json.trim();
      this.#username = username;
      this.#password = password;
      this.#email = '';
      this.#token = /** @type {AuthToken} */ (t);
      return /** @type {AuthToken} */ (t);
    }
    if (typeof text === 'string') {
      const t = text.trim().replace(/^"(.*)"$/, '$1');      
      if (t) {
        this.#username = username;
        this.#password = password;
        this.#email = '';
        this.#token = t;
        return /** @type {AuthToken} */ (t)};
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
    const url = joinUrl(this._serverUrl, 'api', 'native-users');
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
    if (json && typeof json === 'object') {
      const maybeToken = json.token;
      if (typeof maybeToken === 'string' && maybeToken.trim()) {
        const t = maybeToken.trim();
        this.#username = username;
        this.#password = password;
        this.#email = email;
        this.#token = /** @type {AuthToken} */ (t);
        return /** @type {AuthToken} */ (t);
      }
    }
    if (typeof json === 'string' && json.trim()) {
      const t = json.trim();
      this.#username = username;
      this.#password = password;
      this.#email = email;
      this.#token = /** @type {AuthToken} */ (t);
      return /** @type {AuthToken} */ (t);
    }
    if (typeof text === 'string') {
      this.#username = username;
      this.#password = password;
      this.#email = email;
      const t = text.trim().replace(/^"(.*)"$/, '$1');
      if (t) {
        this.#username = username;
        this.#password = password;
        this.#email = email;
        this.#token = t;
        return /** @type {AuthToken} */ (t)};
    }
    return null;
  }
  /**
   * @returns {Promise<AuthToken|null>}
   */
  async getToken() {
    if (this.#token) return this.#token;

    // Do not attempt implicit login if credentials are unknown.
    // This avoids hitting POST /api/login (without /:username/:password).
    if (!String(this.#username || '').trim() || !String(this.#password || '').trim()) {
      return null;
    }

    const token = await this.login();
    if (!token) return null;
    this.#token = token;
    return token;
  }
}

module.exports = TokenController;
