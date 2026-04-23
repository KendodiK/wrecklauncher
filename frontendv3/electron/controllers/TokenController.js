// @ts-check

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
    this._serverUrl = serverurl || '';
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
   * Clears all in-memory auth state used by this controller.
   * Use this for explicit user-initiated logout.
   */
  async clearSession() {
    this.#token = null;
    this.#username = '';
    this.#password = '';
    this.#email = '';
  }


  /**
    * Tries known PUT login variants and returns an auth token when available.
   * @returns {Promise<AuthToken|null>}
   */
  async login(username = this.#username, password = this.#password) {
    const user = String(username || '').trim();
    const pass = String(password || '').trim();
    let headers = {
        'content-type': 'application/json',
        'accept': 'application/json',
    };
    let body = JSON.stringify({ username: user, password: pass });
    if (this.#token) {
        headers = {
            ...headers,
            Authorization: `Bearer ${this.#token}`,
        };
        body = null;
    }
    if ((!user || !pass) && !this.#token) return null;
      const response = await fetch(`${this._serverUrl}/api/login`, {
        method: "PUT",
        headers: headers,
        body: body,
      });
      if (response.ok) {
          const data = await response.json();
        /**
         * @type {AuthToken|null}
         */
        const token = data.token || data;
        if (token) {
          this.#username = user;
          this.#password = pass;
          this.#email = '';
          this.#token = token;
          return token || null;
        }else{
            return null;
        }
      }    
  }

  /**
   * Registers a new user and returns the token.
   * @param {string} username 
   * @param {string} password 
   * @param {string} email
   * @param {string|null|undefined} pfp - Optional profile picture URL.
   * @param {string|null|undefined} bio - Optional user bio.
   * @returns token on success, null on failure (e.g. username taken)
    * @throws on HTTP errors or unexpected responses
   */
  async register(username, password, email, pfp, bio) {


    /** @type {{ username: string, password: string, email: string }} */
    const payload = {
      username,
      password,
      email
    };
    const url = `${this._serverUrl}/api/native-users`;
    const response = await fetch(url, { 
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload)
    });    
    if (!response.ok) throw new Error(`Registration failed: HTTP ${response.status}${response.text ? ` - ${String(response.text).slice(0, 200)}` : ''}`);
    const data = await response.json();
    if (data && typeof data === 'object') {
      const token = data.token;
      if (typeof token === 'string' && token.trim()) {
        const t = token.trim();
        this.#username = username;
        this.#password = password;
        this.#email = email;
        this.#token = /** @type {AuthToken} */ (t);
        const avatarUrl = String(pfp || '').trim();
        const bioText = String(bio || '').trim();
        if (avatarUrl || bioText) {
            const updatePayload = {};
            if (avatarUrl) updatePayload.pfp = avatarUrl;
            if (bioText) updatePayload.bio = bioText;
            await fetch(`${this._serverUrl}/api/native-users/me`, {
                method: 'PUT',
                headers: {
                    'content-type': 'application/json',
                    accept: 'application/json',
                    Authorization: `Bearer ${t}`,
                },
                body: JSON.stringify(updatePayload),
            });
        }
        return /** @type {AuthToken} */ (t);
      }
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
