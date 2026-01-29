// @ts-check

const Token = require("./TokenController");
const fs = require('fs');
const path = require('path');
/**
 * User class for getting information about the user and handling user related functionality.
 * Inherits Token class for easy access to token.
 */
class User extends Token{

    /** @type {any|null|undefined} */
    #localhostDispatcher;

    /**
     * Creates (and caches) an undici dispatcher that trusts mkcert's local CA.
     * Only used for localhost HTTPS calls in the Electron/Node main process.
     *
     * @returns {any|null}
     */
    #getLocalhostDispatcher() {
        if (this.#localhostDispatcher !== undefined) return this.#localhostDispatcher;

        // Default to no dispatcher (normal TLS behaviour).
        this.#localhostDispatcher = null;

        // Undici is bundled with Node (and Electron), but keep it optional.
        let Agent;
        try {
            ({ Agent } = require('undici'));
        } catch {
            return this.#localhostDispatcher;
        }

        const candidates = [
            process.env.MKCERT_ROOT_CA,
            process.env.NODE_EXTRA_CA_CERTS,
            process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'mkcert', 'rootCA.pem') : null,
        ].filter(Boolean);

        const rootCaPath = candidates.find(p => {
            try { return typeof p === 'string' && fs.existsSync(p); } catch { return false; }
        });
        if (!rootCaPath) return this.#localhostDispatcher;

        let ca;
        try {
            ca = fs.readFileSync(rootCaPath);
        } catch {
            return this.#localhostDispatcher;
        }

        this.#localhostDispatcher = new Agent({
            connect: { ca },
        });
        return this.#localhostDispatcher;
    }

    /**
     * Fetches a URL and tries to parse the response as JSON.
     * This avoids common "Unexpected token '<'" issues by reading text first.
     *
     * @param {string} url
     * @param {RequestInit} [options]
     * @returns {Promise<{ response: Response, json: any|null, text: string }>}
     */
    async #fetchJson(url, options) {
        const doFetch = globalThis.fetch;
        if (typeof doFetch !== 'function') {
            throw new Error(
                'fetch() is not available in this process. Run this in the renderer, or use a Node/Electron version that provides global fetch.'
            );
        }

        /** @type {Response} */
        let response;
        try {
            /** @type {RequestInit & { dispatcher?: any }} */
            const finalOptions = { ...(options || {}) };

            // In Electron's main process, Node's fetch uses undici + Node TLS, which
            // does NOT automatically trust mkcert's Windows trust store. For localhost
            // calls we attach a dispatcher that trusts mkcert's root CA.
            try {
                const u = new URL(url);
                const isLocalhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
                if (isLocalhost && !('dispatcher' in finalOptions)) {
                    const dispatcher = this.#getLocalhostDispatcher();
                    if (dispatcher) finalOptions.dispatcher = dispatcher;
                }
            } catch {
                // ignore URL parse errors
            }

            response = await doFetch(url, finalOptions);
        } catch (e) {
            const err = /** @type {any} */ (e);
            throw new Error(`Network error while fetching ${url}: ${err?.message ?? String(err)}`);
        }

        let text = '';
        try {
            text = await response.text();
        } catch (e) {
            const err = /** @type {any} */ (e);
            throw new Error(`Failed to read response body from ${url}: ${err?.message ?? String(err)}`);
        }

        let json = null;
        if (text) {
            try {
                json = JSON.parse(text);
            } catch {
                json = null;
            }
        }

        return { response, json, text };
    }

    /**
     * Formats a useful message from a non-OK HTTP response.
     *
     * @param {number} status
     * @param {any|null} json
     * @param {string} text
     * @returns {string}
     */
    #httpErrorMessage(status, json, text) {
        const jsonMsg = json?.error || json?.message;
        if (typeof jsonMsg === 'string' && jsonMsg.trim()) return jsonMsg;
        const snippet = String(text || '').trim().slice(0, 300);
        if (snippet) return snippet;
        return `HTTP ${status}`;
    }

    /**
     * Resolves a platform username into that platform's profile/user id.
     *
     * @param {string} platformName Example: `steam`
     * @param {string} platformUsername The user's username on that platform
     * @returns {Promise<string|number>} Platform profile id (as returned by backend)
     */
    async getPlatformUserID(platformName, platformUsername){
        try {
            const token = await super.getToken();
            const url = `${this._serverurl}/api/platform/UserID/${platformName}/${platformUsername}/${token}`;
            try {
                const { response, json, text } = await this.#fetchJson(url, { method: 'GET' });

                if (!response.ok) {
                    throw new Error(this.#httpErrorMessage(response.status, json, text));
                }
                if (!json) {
                    throw new Error(`Invalid JSON response from server (HTTP ${response.status})`);
                }

                return json.platformUserID;
            } catch (innerError) {
                const err = /** @type {any} */ (innerError);
                console.error("Request failed:", err?.message ?? String(err));
                throw new Error(`Failed to fetch platform user ID from ${this._serverurl}: ${err?.message ?? String(err)}`);
            }
        } catch (error) {
            console.error("Error fetching platform user ID:", error);
            throw error;
        }
    }
    /**
     * Fetches owned games from Steam API using the user's steam username.
     *
     * Note: this currently calls Steam Web API directly (client-side). If you want
     * the key to be private, proxy this via your backend instead.
     *
     * @param {string} platformUsername
     * @returns {Promise<any[]>} array of owned games from Steam API
     */
    async getOwnedGamesFromSteam(platformUsername){
    try {
        // const steamID = '76561199194098023';
        const steamID = await this.getPlatformUserID('steam', platformUsername);
        if (!steamID) {
        throw new Error('Steam ID not found for the given username and steamusername');
        }
        const steamApiKey = await this.#getSteamApiKey();
        const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${steamApiKey}&steamid=${steamID}&format=json`;

        const { response, json, text } = await this.#fetchJson(url, { method: 'GET' });
        if (!response.ok) {
            throw new Error(this.#httpErrorMessage(response.status, json, text));
        }
        if (!json) {
            throw new Error(`Invalid JSON response from Steam (HTTP ${response.status})`);
        }

        return json?.response?.games ?? [];
    } catch (error) {
        console.error('Error fetching Steam data:', error);
        throw new Error('Failed to fetch data from Steam API');
    }
    }
    /**
     * Fetches Steam API key from the backend.
     *
     * @returns {Promise<string>} steam api key
     */
    async #getSteamApiKey(){
        try {
            const token = await super.getToken();
            const url = `${this._serverurl}/api/steam/key/${token}`;
            try {
                const { response, json, text } = await this.#fetchJson(url, { method: 'GET' });
                if (!response.ok) {
                    throw new Error(this.#httpErrorMessage(response.status, json, text));
                }
                if (!json) {
                    throw new Error(`Invalid JSON response from server (HTTP ${response.status})`);
                }
                return json.steamApiKey;
            } catch (innerError) {
                const err = /** @type {any} */ (innerError);
                console.error("Request failed:", err?.message ?? String(err));
                throw new Error(`Failed to fetch Steam API key from ${this._serverurl}: ${err?.message ?? String(err)}`);
            }
        } catch (error) {
            console.error("Error fetching Steam API key:", error);
            throw error;
        }
    }
}
module.exports = User;