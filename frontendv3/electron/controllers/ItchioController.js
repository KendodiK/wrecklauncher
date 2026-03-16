// @ts-check

const fs = require('fs');
const path = require('path');
const { shell, BrowserWindow } = require('electron');
const GamesController = require('./GamesController');
const { joinUrl, normalizeBaseUrl } = require('../lib/url');
const { fetchJsonSafe } = require('../lib/http');

/**
 * @typedef {Object} ItchOAuthToken
 * @property {string} access_token
 * @property {number} [expires_at] - Unix timestamp
 */

class ItchioController extends GamesController {
  /** @type {string} */
  #serverUrl;

  /** @type {ItchOAuthToken|null} */
  #oauthToken = null;

  /** @type {string|null} */
  static #tokenFilePath = null;

  /**
   * @param {{ serverUrl: string }} cfg
   */
  constructor(cfg) {
    const serverUrl = cfg?.serverUrl;
    super({ serverUrl });
    this.#serverUrl = normalizeBaseUrl(serverUrl, { defaultProtocol: 'http:' });
    this.#loadTokenFromDisk();
  }

  /**
   * Get the token storage path.
   * @returns {string}
   */
  static getTokenFilePath() {
    if (!ItchioController.#tokenFilePath) {
      const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
      ItchioController.#tokenFilePath = path.join(appData, 'wrecklauncher', 'itch-oauth-token.json');
    }
    return ItchioController.#tokenFilePath;
  }

  /**
   * Load OAuth token from disk if it exists.
   */
  #loadTokenFromDisk() {
    try {
      const tokenPath = ItchioController.getTokenFilePath();
      if (fs.existsSync(tokenPath)) {
        const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
        if (data?.access_token) {
          this.#oauthToken = data;
        }
      }
    } catch {
      // Ignore errors, token will be null
    }
  }

  /**
   * Save OAuth token to disk.
   * @param {ItchOAuthToken|null} token
   */
  #saveTokenToDisk(token) {
    try {
      const tokenPath = ItchioController.getTokenFilePath();
      const dir = path.dirname(tokenPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      if (token) {
        fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2), 'utf8');
      } else {
        if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
      }
    } catch (err) {
      console.warn('Failed to save itch OAuth token:', err?.message);
    }
  }

  /**
   * Check if user is logged in to itch.io via OAuth.
   * @returns {boolean}
   */
  isLoggedIn() {
    return !!this.#oauthToken?.access_token;
  }

  /**
   * Get current OAuth token (if logged in).
   * @returns {string|null}
   */
  getAccessToken() {
    return this.#oauthToken?.access_token ?? null;
  }

  /**
   * Returns the itch.io app installation directory.
   * @returns {string}
   */
  static getAppsDir() {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
    return path.join(appData, 'itch', 'apps');
  }

  /**
   * Returns the itch.io butler caves directory (alternate install tracking).
   * @returns {string}
   */
  static getCavesDir() {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
    return path.join(appData, 'itch', 'db', 'caves');
  }

  /**
   * Scan itch.io installed games from the apps directory.
   * Each installed game has a `.itch/receipt.json` file inside its install folder.
   *
   * @returns {import('../models').ItchInstalledGame[]}
   */
  getInstalledGames() {
    const appsDir = ItchioController.getAppsDir();
    if (!fs.existsSync(appsDir)) return [];

    /** @type {import('../models').ItchInstalledGame[]} */
    const results = [];

    let entries = [];
    try {
      entries = fs.readdirSync(appsDir, { withFileTypes: true });
    } catch {
      return [];
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const gameDir = path.join(appsDir, entry.name);
      const receiptPath = path.join(gameDir, '.itch', 'receipt.json');

      if (!fs.existsSync(receiptPath)) continue;

      try {
        const raw = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
        const game = raw?.game ?? raw;
        const upload = raw?.upload ?? null;

        const gameId = game?.id ?? null;
        const title = typeof game?.title === 'string' ? game.title : (typeof game?.name === 'string' ? game.name : entry.name);
        const coverUrl = typeof game?.cover_url === 'string' ? game.cover_url : (typeof game?.still_cover_url === 'string' ? game.still_cover_url : null);
        const url = typeof game?.url === 'string' ? game.url : null;
        const uploadId = upload?.id ?? null;
        const buildId = raw?.build?.id ?? null;

        results.push({
          gameId: gameId !== null ? String(gameId) : entry.name,
          title,
          coverUrl,
          url,
          installLocation: gameDir,
          uploadId: uploadId !== null ? String(uploadId) : null,
          buildId: buildId !== null ? String(buildId) : null,
          raw,
        });
      } catch {
        // skip unreadable entries
      }
    }

    results.sort((a, b) => {
      const an = (a.title || '').toLowerCase();
      const bn = (b.title || '').toLowerCase();
      return an.localeCompare(bn);
    });

    return results;
  }

  /**
   * Fetch itch.io game details via the wreck backend.
   * The backend proxies the request to itch.io using its ITCH_API_KEY env var
   * and also saves the game to the local DB — the API key never reaches this process.
   *
   * @param {string} token  Wreck auth token.
   * @param {number|string} gameId  itch.io numeric game ID.
   * @returns {Promise<import('../models').ItchGameDetails|null>}
   */
  async getGameDetails(token, gameId) {
    if (!token || !String(token).trim()) throw new Error('Auth token is required');
    const id = Number(gameId);
    if (!Number.isFinite(id) || id <= 0) throw new Error(`Invalid itch.io game ID: ${String(gameId)}`);

    // 1) Prefer DB data first.
    const dbUrl = joinUrl(this.#serverUrl, 'api', 'games', String(id), 'all');
    const dbRes = await fetchJsonSafe(dbUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (dbRes.ok && dbRes.json && typeof dbRes.json === 'object') {
      const platformName = String(dbRes.json.platform_name ?? dbRes.json.platform ?? '').trim().toLowerCase();
      if (platformName === 'itch' || platformName === 'itch.io') {
        const genres = Array.isArray(dbRes.json.genres)
          ? dbRes.json.genres
              .map((/** @type {any} */ g) => (typeof g === 'string' ? g : g?.genre ?? g?.name))
              .filter((/** @type {any} */ v) => typeof v === 'string' && v.trim())
          : [];

        return {
          gameId: id,
          title: dbRes.json.name ?? `itch:${id}`,
          coverUrl: dbRes.json.banner_img ?? null,
          shortText: dbRes.json.description ?? null,
          minPrice: typeof dbRes.json.cost === 'number' ? dbRes.json.cost : 0,
          url: null,
          raw: {
            ...dbRes.json,
            genres,
            source: 'database',
          },
        };
      }
    }

    // 2) Fallback to scrape endpoint, which also uploads to DB when missing.
    const url = `${joinUrl(this.#serverUrl, 'api', 'itch', 'game', String(id))}?ensureUpload=true`;
    const { ok, status, json } = await fetchJsonSafe(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!ok) {
      if (status === 401) {
        const msg = (json && typeof json === 'object' ? json.error : null) || 'Unauthorized';
        const e = new Error(`Unauthorized (token invalid/expired): ${String(msg).slice(0, 300)}`);
        // @ts-ignore
        e.code = 'WRECK_INVALID_TOKEN';
        throw e;
      }
      const msg = (json && typeof json === 'object' ? json.error : null) || `HTTP ${status}`;
      throw new Error(`itch.io game fetch failed: ${String(msg).slice(0, 300)}`);
    }

    if (!json || typeof json !== 'object') return null;

    return {
      gameId: typeof json.gameId === 'number' ? json.gameId : (typeof json.app_id === 'number' ? json.app_id : id),
      title: typeof json.title === 'string' ? json.title : `itch:${id}`,
      coverUrl: json.coverUrl ?? json.cover_url ?? json.banner_img ?? null,
      shortText: json.shortText ?? json.short_text ?? json.description ?? null,
      minPrice: typeof json.minPrice === 'number' ? json.minPrice : (typeof json.min_price === 'number' ? json.min_price : 0),
      url: json.url ?? null,
      raw: {
        ...json,
        source: 'scrape-endpoint',
      },
    };
  }

  /**
   * Fetch the user's itch.io library (all owned games) using their OAuth token.
   * This calls itch.io API directly with the user's personal token.
   *
   * @returns {Promise<{ owned_keys: Array<any>, total: number }|null>}
   */
  async getLibraryWithUserToken() {
    const token = this.#oauthToken?.access_token;
    if (!token) {
      throw new Error('Not logged in to itch.io. Please login first.');
    }

    const pageSize = 50;
    const allKeys = [];
    let page = 1;
    let hasMore = true;

    try {
      while (hasMore) {
        const endpoint = `https://itch.io/api/1/${token}/my-owned-keys?page=${page}&page_size=${pageSize}`;
        const response = await fetch(endpoint);
        
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            // Token is invalid, clear it
            this.#oauthToken = null;
            this.#saveTokenToDisk(null);
            throw new Error('itch.io OAuth token expired or invalid. Please login again.');
          }
          if (page === 1) throw new Error(`Failed to fetch library: HTTP ${response.status}`);
          break;
        }

        const payload = await response.json();
        if (!payload || typeof payload !== 'object') break;

        const ownedKeys = Array.isArray(payload.owned_keys) ? payload.owned_keys : [];
        if (ownedKeys.length === 0) {
          hasMore = false;
        } else {
          for (const key of ownedKeys) {
            allKeys.push({
              game_id: key.game_id ?? key.game?.id ?? null,
              download_key_id: key.download_key_id ?? key.id ?? null,
              created_at: key.created_at ?? null,
              game: key.game ? {
                id: key.game.id ?? null,
                title: key.game.title ?? null,
                url: key.game.url ?? null,
                cover_url: key.game.cover_url ?? key.game.still_cover_url ?? null,
                short_text: key.game.short_text ?? null,
                classification: key.game.classification ?? null,
                min_price: key.game.min_price ?? null,
                user: key.game.user ? {
                  id: key.game.user.id ?? null,
                  username: key.game.user.username ?? null,
                  url: key.game.user.url ?? null,
                } : null,
              } : null,
            });
          }
          hasMore = ownedKeys.length >= pageSize;
          page++;
        }
      }

      return { owned_keys: allKeys, total: allKeys.length };
    } catch (err) {
      if (err instanceof Error && err.message.includes('expired')) throw err;
      console.warn('Failed to fetch itch library with user token:', err?.message);
      return allKeys.length > 0 ? { owned_keys: allKeys, total: allKeys.length } : null;
    }
  }

  /**
   * Get the user's itch.io profile using their OAuth token.
   * @returns {Promise<{ id: number, username: string, url: string, cover_url: string|null, display_name: string|null }|null>}
   */
  async getProfile() {
    const token = this.#oauthToken?.access_token;
    if (!token) {
      throw new Error('Not logged in to itch.io. Please login first.');
    }

    try {
      const response = await fetch(`https://itch.io/api/1/${token}/me`);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          this.#oauthToken = null;
          this.#saveTokenToDisk(null);
          throw new Error('itch.io OAuth token expired or invalid. Please login again.');
        }
        throw new Error(`Failed to fetch profile: HTTP ${response.status}`);
      }

      const payload = await response.json();
      const user = payload?.user ?? payload;
      if (!user || typeof user !== 'object') return null;

      return {
        id: user.id ?? null,
        username: user.username ?? null,
        display_name: user.display_name ?? user.username ?? null,
        url: user.url ?? null,
        cover_url: user.cover_url ?? null,
      };
    } catch (err) {
      if (err instanceof Error && err.message.includes('expired')) throw err;
      console.warn('Failed to fetch itch profile:', err?.message);
      return null;
    }
  }

  /**
   * Start itch.io OAuth login flow using a BrowserWindow.
   * The user will be prompted to authorize the app.
   * 
   * Note: You need an itch.io OAuth client ID. Get one at:
   * https://itch.io/user/settings/oauth-apps
   *
   * @param {string} clientId - Your itch.io OAuth client ID
   * @returns {Promise<{ success: boolean, user?: { id: number, username: string } }>}
   */
  async login(clientId) {
    if (!clientId || !String(clientId).trim()) {
      throw new Error('itch.io OAuth client ID is required');
    }

    return new Promise((resolve, reject) => {
      // Create a hidden window for OAuth
      const authWindow = new BrowserWindow({
        width: 600,
        height: 700,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      // itch.io OAuth URL - using implicit grant (token in URL fragment)
      const redirectUri = 'urn:ietf:wg:oauth:2.0:oob';
      const scope = 'profile:me';
      const authUrl = `https://itch.io/user/oauth?client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scope)}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}`;

      authWindow.loadURL(authUrl);

      // Listen for page title changes - itch.io shows token in the title after auth
      authWindow.webContents.on('page-title-updated', async (event, title) => {
        // When using oob redirect, itch.io shows "Authorization - itch.io" then displays token
        // We need to check the page content for the token
      });

      // Listen for navigation to detect the token in the URL or page
      authWindow.webContents.on('did-navigate', async (event, url) => {
        // Check if we're on the authorization success page
        if (url.includes('itch.io/user/oauth') || url.includes('oauth/authorize')) {
          // Try to extract token from the page
          try {
            const token = await authWindow.webContents.executeJavaScript(`
              (function() {
                // Look for token in various places
                const codeEl = document.querySelector('code');
                if (codeEl) return codeEl.textContent.trim();
                
                const preEl = document.querySelector('pre');
                if (preEl) return preEl.textContent.trim();
                
                // Check for token in URL hash
                if (window.location.hash) {
                  const params = new URLSearchParams(window.location.hash.substring(1));
                  const accessToken = params.get('access_token');
                  if (accessToken) return accessToken;
                }
                
                return null;
              })()
            `);

            if (token && typeof token === 'string' && token.length > 10) {
              // Save the token
              this.#oauthToken = { access_token: token };
              this.#saveTokenToDisk(this.#oauthToken);

              // Get user profile to confirm login
              try {
                const profile = await this.getProfile();
                authWindow.close();
                resolve({
                  success: true,
                  user: profile ? { id: profile.id, username: profile.username } : undefined,
                });
              } catch {
                authWindow.close();
                resolve({ success: true });
              }
            }
          } catch (err) {
            // Ignore - might not be on the right page yet
          }
        }
      });

      // Also check when page finishes loading
      authWindow.webContents.on('did-finish-load', async () => {
        try {
          const token = await authWindow.webContents.executeJavaScript(`
            (function() {
              const codeEl = document.querySelector('code');
              if (codeEl) return codeEl.textContent.trim();
              
              const preEl = document.querySelector('pre');
              if (preEl) return preEl.textContent.trim();
              
              // Check URL hash
              if (window.location.hash) {
                const params = new URLSearchParams(window.location.hash.substring(1));
                const accessToken = params.get('access_token');
                if (accessToken) return accessToken;
              }
              
              return null;
            })()
          `);

          if (token && typeof token === 'string' && token.length > 10) {
            this.#oauthToken = { access_token: token };
            this.#saveTokenToDisk(this.#oauthToken);

            try {
              const profile = await this.getProfile();
              authWindow.close();
              resolve({
                success: true,
                user: profile ? { id: profile.id, username: profile.username } : undefined,
              });
            } catch {
              authWindow.close();
              resolve({ success: true });
            }
          }
        } catch {
          // Ignore
        }
      });

      // Handle window close (user cancelled)
      authWindow.on('closed', () => {
        if (!this.#oauthToken) {
          resolve({ success: false });
        }
      });
    });
  }

  /**
   * Logout from itch.io OAuth (clear stored token).
   */
  logout() {
    this.#oauthToken = null;
    this.#saveTokenToDisk(null);
  }

  /**
   * Open the itch.io client for a game action via URL scheme.
   *
   * @param {string|number} gameId  itch.io game ID
   * @param {'open'|'install'} action
   * @returns {Promise<{ ok: boolean, url: string }>}
   */
  async clientGameControlUtil(gameId, action) {
    // itch:// scheme: itch://games/{gameId} opens the game page in the client.
    // There is no documented itch://install/... scheme, so we fall back to https for install.
    const id = Number(gameId);
    if (!Number.isFinite(id) || id <= 0) throw new Error(`Invalid itch.io game ID: ${String(gameId)}`);

    const url = action === 'install'
      ? `https://itch.io/games/${encodeURIComponent(String(id))}`
      : `itch://games/${encodeURIComponent(String(id))}`;

    try {
      await shell.openExternal(url);
      return { ok: true, url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to open itch.io URL (${url}): ${msg}`);
    }
  }
}

module.exports = ItchioController;
