// @ts-check

const fs = require('fs/promises');
const path = require('path');
const fetch = require('node-fetch');
const https = require('https');
const fsSync = require('fs');

/**
 * User auth token string.
 * Format is `nativeUserId.token` (example: `123.abcd...`).
 * @typedef {string} AuthToken
 */

/**
 * Token class for generating, saving- and re-reading token from file.
 * For easy access to token simply just call the getToken() function.
 */
class Token{
  /** @type {AuthToken|null} */
  #token;
  /** @type {string} */
  #tokenFile;
  /** @type {string} */
  #password;
  /** @type {https.Agent|null|undefined} */
  #localhostHttpsAgent;

  /**
   * @param {string} username
   * @param {string} password
   * @param {string} tokenfile Absolute path to the token file.
   * @param {string} serverurl Base URL for the backend (example: `https://localhost:3000`).
   */
    constructor(username, password, tokenfile, serverurl){
        this.username = username;
        this.#password = password;
        this.#tokenFile = tokenfile;

    /** @protected */
    this._serverurl = Token.#toHttpsBaseUrl(serverurl);
        this.#token = null;
    }

    /**
     * Forces a base URL to use HTTPS.
     * Accepts:
     * - `http://host:port` -> `https://host:port`
     * - `https://host:port` -> unchanged
     * - `host:port` -> `https://host:port`
     *
     * @param {string} serverurl
     * @returns {string}
     */
    static #toHttpsBaseUrl(serverurl) {
      const trimmed = String(serverurl || '').trim();
      if (!trimmed) return 'https://localhost:3000';

      // If no scheme, assume it's a host[:port]
      const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
        ? trimmed
        : `https://${trimmed}`;

      let url;
      try {
        url = new URL(withScheme);
      } catch {
        // Last-resort fallback: replace leading http:// with https://
        return trimmed.replace(/^http:\/\//i, 'https://');
      }

      url.protocol = 'https:';
      // normalize trailing slash so template strings don't produce double slashes
      return url.toString().replace(/\/$/, '');
    }
    /**
     * Saves token to `tokenFile`.
     *
     * @param {AuthToken} token the users `userid + "." + token` from database
     * @returns {Promise<void>}
     */
     async #saveToken(token) {
        try {
          await fs.mkdir(path.dirname(this.#tokenFile), { recursive: true });
          await fs.writeFile(this.#tokenFile, token, 'utf-8');
          console.log('Token saved to file');
        } catch (err) {
          const error = /** @type {any} */ (err);
          console.error('Failed to save token:', error?.message ?? String(error));
        }
      }
  /**
   * Reads token from local file (`tokenFile`).
   *
   * @returns {Promise<AuthToken|null>} token or if not found null
   */
   async #getTokenFromFile() {
    try {
      const token = await fs.readFile(this.#tokenFile, 'utf-8');
      // Remove quotes if present
      return token.trim().replace(/^"(.*)"$/, '$1');
    } catch (err) {
      const error = /** @type {any} */ (err);
      if (error?.code === 'ENOENT') return null;
      console.error('Failed to read token:', error?.message ?? String(error));
      return null;
    }
  }
  /**
   * Logs in to the backend server and returns a new token.
   *
   * @returns {Promise<AuthToken|null>} token of the user (`uuid + "." + token`), or null if failed
   */
  async login(){
    try {
      const url = `${this._serverurl}/api/login/${this.username}/${this.#password}`;
      const agent = this.#getLocalhostHttpsAgent(url);
      const response = await fetch(url, {
        method: 'POST',
        ...(agent ? { agent } : {}),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      /** @type {AuthToken} */
      const token = await response.json();
      return token;
    } catch (err) {
      const error = /** @type {any} */ (err);
      console.error('Failed to login:', error?.message ?? String(error));
      return null;
    }
  }

  /**
   * Creates (and caches) an HTTPS agent that trusts mkcert's root CA for localhost.
   * This is needed because Node's TLS trust store does not automatically include
   * mkcert's Windows trust store.
   *
   * @param {string} url
   * @returns {https.Agent|null}
   */
  #getLocalhostHttpsAgent(url) {
    try {
      const u = new URL(url);
      const isLocalhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
      if (!isLocalhost || u.protocol !== 'https:') return null;
    } catch {
      return null;
    }

    if (this.#localhostHttpsAgent !== undefined) return this.#localhostHttpsAgent;
    this.#localhostHttpsAgent = null;

    const candidates = [
      process.env.MKCERT_ROOT_CA,
      process.env.NODE_EXTRA_CA_CERTS,
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'mkcert', 'rootCA.pem') : null,
    ].filter(Boolean);

    const rootCaPath = candidates.find(p => {
      try { return typeof p === 'string' && fsSync.existsSync(p); } catch { return false; }
    });
    if (!rootCaPath) return this.#localhostHttpsAgent;

    try {
      const ca = fsSync.readFileSync(rootCaPath);
      this.#localhostHttpsAgent = new https.Agent({ ca });
    } catch {
      this.#localhostHttpsAgent = null;
    }

    return this.#localhostHttpsAgent;
  }

  /**
   * Generates a token only if it can't be read from file.
   *
   * @returns {Promise<AuthToken|null>} token (userid.token)
   */
   async #generateToken() {
    try {
      let token = await this.#getTokenFromFile();
      if (token) return token.trim();
      token = await this.login();

      if (!token) return null;

      await this.#saveToken(token);
      console.log('Generated and saved new token:', token);
      return token;
    } catch (err) {
      const error = /** @type {any} */ (err);
      console.error('Failed to fetch token:', error?.message ?? String(error));
      return null;
    }
  }
  /**
   * Returns token.
   *
   * If not cached, tries to read from file; if missing, logs in and saves a new one.
   *
   * @returns {Promise<AuthToken|null>}
   */
   async getToken(){
    if(!this.#token) {this.#token = await this.#generateToken()};
    return this.#token;
  }

}
module.exports = Token;