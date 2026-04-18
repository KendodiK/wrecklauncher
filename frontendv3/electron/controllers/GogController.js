// @ts-check

const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const https = require('https');
const { shell, BrowserWindow } = require('electron');
const GamesController = require('./GamesController');
const { enc, joinUrl, normalizeBaseUrl } = require('../lib/url');
const { fetchJsonSafe } = require('../lib/http');

/**
 * @typedef {Object} GogOAuthToken
 * @property {string} access_token
 * @property {string} [refresh_token]
 * @property {number} [expires_in]
 * @property {number} [expires_at] - Unix timestamp
 * @property {string|number} [user_id]
 */

class GogController extends GamesController {
  /** @type {string} */
  #serverUrl;

  /** @type {GogOAuthToken|null} */
  #oauthToken = null;

  /** @type {string|null} */
  static #tokenFilePath = null;

  /**
   * @param {{ serverUrl: string }} cfg
   */
  constructor(cfg) {
    const serverUrl = cfg?.serverUrl;
    super({ serverUrl });
    this.#serverUrl = normalizeBaseUrl(serverUrl, { defaultProtocol: 'https:' });
    this.#loadTokenFromDisk();
  }

  static getOAuthClientId() {
    return '46899977096215655';
  }

  static #getOAuthClientSecret() {
    return '9d85c43b1482497dbbce61f6e4aa173a433796eeae2ca8c5f6129f2dc4de46d9';
  }

  static getOAuthRedirectUri() {
    return 'https://embed.gog.com/on_login_success?origin=client';
  }

  static getTokenFilePath() {
    if (!GogController.#tokenFilePath) {
      const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || 'C:\\Users\\Default', 'AppData', 'Roaming');
      GogController.#tokenFilePath = path.join(appData, 'wrecklauncher', 'gog-oauth-token.json');
    }
    return GogController.#tokenFilePath;
  }

  #loadTokenFromDisk() {
    try {
      const tokenPath = GogController.getTokenFilePath();
      if (!fs.existsSync(tokenPath)) return;
      const data = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      const normalized = this.#normalizeOAuthToken(data);
      if (normalized) {
        this.#oauthToken = normalized;
      }
    } catch {
      // Ignore disk errors and keep token in memory only.
    }
  }

  /**
   * @param {GogOAuthToken|null} token
   */
  #saveTokenToDisk(token) {
    try {
      const tokenPath = GogController.getTokenFilePath();
      const dir = path.dirname(tokenPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (token) {
        fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2), 'utf8');
      } else if (fs.existsSync(tokenPath)) {
        fs.unlinkSync(tokenPath);
      }
    } catch (err) {
      console.warn('Failed to save GOG OAuth token:', err?.message);
    }
  }

  /**
   * @param {any} raw
   * @returns {GogOAuthToken|null}
   */
  #normalizeOAuthToken(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const accessToken = String(raw.access_token || '').trim();
    if (!accessToken) return null;

    const refreshToken = String(raw.refresh_token || '').trim();
    const now = Math.floor(Date.now() / 1000);
    const rawExpiresAt = Number(raw.expires_at);
    const rawExpiresIn = Number(raw.expires_in);

    const expiresAt = Number.isFinite(rawExpiresAt) && rawExpiresAt > 0
      ? Math.trunc(rawExpiresAt)
      : (Number.isFinite(rawExpiresIn) && rawExpiresIn > 0
          ? now + Math.max(1, Math.trunc(rawExpiresIn) - 30)
          : undefined);

    const userId = raw.user_id ?? raw.userId ?? null;

    return {
      access_token: accessToken,
      refresh_token: refreshToken || undefined,
      expires_in: Number.isFinite(rawExpiresIn) && rawExpiresIn > 0 ? Math.trunc(rawExpiresIn) : undefined,
      expires_at: Number.isFinite(expiresAt) && expiresAt > 0 ? Math.trunc(expiresAt) : undefined,
      user_id: userId == null ? undefined : String(userId).trim() || undefined,
    };
  }

  /**
   * @param {GogOAuthToken|null|undefined} token
   * @returns {boolean}
   */
  #isTokenExpired(token) {
    const expiresAt = Number(token?.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return false;
    const now = Math.floor(Date.now() / 1000);
    return now >= expiresAt;
  }

  /**
   * @param {number} status
   * @param {any} json
   * @param {string} text
   * @returns {string}
   */
  #httpMessage(status, json, text) {
    const msg = json?.error ?? json?.message;
    if (typeof msg === 'string' && msg.trim()) return msg.trim();
    const snippet = String(text || '').trim().slice(0, 240);
    return snippet || `HTTP ${status}`;
  }

  /**
   * @param {string} message
   */
  #makeInvalidTokenError(message) {
    const err = new Error(message);
    // @ts-ignore
    err.code = 'WRECK_INVALID_TOKEN';
    return err;
  }

  /**
   * @param {Record<string, string>} query
   * @returns {Promise<GogOAuthToken>}
   */
  async #requestToken(query) {
    const tokenUrl = new URL('https://auth.gog.com/token');
    Object.entries(query).forEach(([key, value]) => {
      tokenUrl.searchParams.set(key, value);
    });

    const { ok, status, json, text } = await fetchJsonSafe(tokenUrl.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!ok || !json || typeof json !== 'object') {
      throw new Error(`GOG OAuth token request failed: ${this.#httpMessage(status, json, text)}`);
    }

    const normalized = this.#normalizeOAuthToken(json);
    if (!normalized) {
      throw new Error('GOG OAuth token response missing access_token');
    }

    this.#oauthToken = normalized;
    this.#saveTokenToDisk(normalized);
    return normalized;
  }

  /**
   * @param {string} clientId
   * @param {string} code
   * @returns {Promise<GogOAuthToken>}
   */
  async #exchangeAuthCode(clientId, code) {
    return await this.#requestToken({
      client_id: clientId,
      client_secret: GogController.#getOAuthClientSecret(),
      grant_type: 'authorization_code',
      code,
      redirect_uri: GogController.getOAuthRedirectUri(),
    });
  }

  /**
   * @returns {Promise<GogOAuthToken>}
   */
  async #refreshAccessToken() {
    const refreshToken = String(this.#oauthToken?.refresh_token || '').trim();
    if (!refreshToken) {
      throw this.#makeInvalidTokenError('Missing GOG refresh token. Please login again.');
    }

    return await this.#requestToken({
      client_id: GogController.getOAuthClientId(),
      client_secret: GogController.#getOAuthClientSecret(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }

  /**
   * @returns {Promise<string>}
   */
  async #ensureAccessToken() {
    const token = this.#oauthToken;
    if (!token?.access_token) {
      throw this.#makeInvalidTokenError('Not logged in to GOG. Please login first.');
    }

    if (!this.#isTokenExpired(token)) {
      return token.access_token;
    }

    try {
      const refreshed = await this.#refreshAccessToken();
      return refreshed.access_token;
    } catch {
      this.logout();
      throw this.#makeInvalidTokenError('GOG OAuth token expired or invalid. Please login again.');
    }
  }

  /**
   * @param {string} url
   * @returns {Promise<any>}
   */
  async #authedGetJson(url) {
    const doRequest = async (accessToken) => {
      return await fetchJsonSafe(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });
    };

    let accessToken = await this.#ensureAccessToken();
    let response = await doRequest(accessToken);

    if ((response.status === 401 || response.status === 403) && this.#oauthToken?.refresh_token) {
      try {
        accessToken = (await this.#refreshAccessToken()).access_token;
        response = await doRequest(accessToken);
      } catch {
        // Let the auth failure branch below convert it to a stable app error.
      }
    }

    if (response.status === 401 || response.status === 403) {
      this.logout();
      throw this.#makeInvalidTokenError('GOG OAuth token expired or invalid. Please login again.');
    }

    if (!response.ok) {
      throw new Error(`GOG API request failed: ${this.#httpMessage(response.status, response.json, response.text)}`);
    }

    return response.json;
  }

  /**
   * @param {string|null|undefined} value
   * @returns {string|null}
   */
  #normalizeStoreUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith('//')) return `https:${raw}`;
    if (raw.startsWith('/')) return `https://www.gog.com${raw}`;
    return `https://www.gog.com/${raw.replace(/^\/+/, '')}`;
  }

  /**
   * @param {string|null|undefined} value
   * @returns {string|null}
   */
  #normalizeImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    let normalized = raw
      .replace(/%7Bformatter%7D/gi, '{formatter}')
      .replace(/%7Bext%7D/gi, '{ext}');

    if (normalized.startsWith('//')) {
      normalized = `https:${normalized}`;
    } else if (/^https?:\/\//i.test(normalized)) {
      // already absolute
    } else if (normalized.startsWith('/')) {
      normalized = `https://images.gog-statics.com${normalized}`;
    } else if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(normalized)) {
      normalized = `https://${normalized.replace(/^\/+/, '')}`;
    } else {
      normalized = `https://images.gog-statics.com/${normalized.replace(/^\/+/, '')}`;
    }

    normalized = normalized
      .replace(/\{formatter\}/gi, 'glx_vertical_cover')
      .replace(/\{ext\}/gi, 'webp');

    return normalized;
  }

  /**
   * @param {string|null|undefined} value
   * @returns {boolean}
   */
  #hasImageFileExtension(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    return /\.(png|jpe?g|webp|gif|bmp|avif)(\?|#|$)/i.test(raw);
  }

  /**
   * Build a map of product_id -> banner image from scraped DB entries.
   *
   * @param {Array<string|number>} productIds
   * @param {string} [countryCode]
   * @returns {Promise<Map<string, string>>}
   */
  async #getDbBannerImagesByProductIds(productIds, countryCode = 'DE') {
    const normalizedIds = Array.from(
      new Set(
        (Array.isArray(productIds) ? productIds : [])
          .map((id) => String(id || '').trim())
          .filter((id) => !!id),
      ),
    );

    const out = new Map();
    if (normalizedIds.length < 1) return out;

    let platformId = null;
    try {
      const platformIds = await this._resolvePlatformIds('gog');
      const candidate = Number(Array.isArray(platformIds) ? platformIds[0] : null);
      platformId = Number.isFinite(candidate) && candidate > 0 ? candidate : null;
    } catch {
      platformId = null;
    }

    if (!platformId) return out;

    const wanted = new Set(normalizedIds);
    const normalizedCountryCode = String(countryCode || 'DE').trim() || 'DE';
    let from = 0;
    let guard = 0;

    while (guard < 500 && out.size < wanted.size) {
      const url = `${joinUrl(this.#serverUrl, 'api', 'games', 'platform', enc(String(platformId)), 'list', enc(String(from)), 'details')}?country_code=${enc(normalizedCountryCode)}`;
      const { ok, json } = await fetchJsonSafe(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!ok) break;

      const rows = Array.isArray(json) ? json : [];
      if (rows.length < 1) break;

      for (const row of rows) {
        const appId = String(row?.app_id ?? row?.appId ?? '').trim();
        if (!appId || !wanted.has(appId) || out.has(appId)) continue;

        const bannerRaw = String(row?.banner_img ?? row?.bannerImg ?? '').trim();
        if (!bannerRaw) continue;

        out.set(appId, this.#normalizeImageUrl(bannerRaw) || bannerRaw);
      }

      if (rows.length < 20) break;

      from += rows.length;
      guard += 1;
    }

    return out;
  }

  isLoggedIn() {
    return !!this.#oauthToken?.access_token;
  }

  getAccessToken() {
    return this.#oauthToken?.access_token ?? null;
  }

  async getProfile() {
    const payload = await this.#authedGetJson('https://embed.gog.com/userData.json');
    if (!payload || typeof payload !== 'object') return null;

    const username = String(payload.username ?? payload.userName ?? '').trim();
    const id = String(payload.userId ?? payload.user_id ?? payload.id ?? '').trim();

    if (!id && !username) return null;

    return {
      id: id || null,
      username: username || null,
      display_name: username || null,
      url: username ? `https://www.gog.com/u/${encodeURIComponent(username)}` : null,
      cover_url: null,
    };
  }

  async getLibraryWithUserToken() {
    /** @type {Array<any>} */
    const collected = [];
    const seen = new Set();

    try {
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages && page <= 100) {
        const payload = await this.#authedGetJson(
          `https://embed.gog.com/account/getFilteredProducts?mediaType=1&page=${page}`,
        );

        const products = Array.isArray(payload?.products) ? payload.products : [];
        for (const product of products) {
          const productId = String(product?.id ?? '').trim();
          if (!productId || seen.has(productId)) continue;
          seen.add(productId);

          const rawImage = String(product?.image ?? '').trim();
          let normalizedImage = this.#normalizeImageUrl(rawImage || null);
          const needsTemplateExpansion = /\{formatter\}|\{ext\}|%7Bformatter%7D|%7Bext%7D/i.test(rawImage);
          const missingImageExtension = normalizedImage ? !this.#hasImageFileExtension(normalizedImage) : true;
          if (!normalizedImage || needsTemplateExpansion || missingImageExtension) {
            try {
              const fallbackCover = await this.#fetchGogCoverUrl(productId);
              if (fallbackCover) normalizedImage = fallbackCover;
            } catch {
              // ignore cover fallback errors; keep normalized value or null
            }
          }

          collected.push({
            id: productId,
            product_id: productId,
            title: String(product?.title || `gog:${productId}`).trim() || `gog:${productId}`,
            image: normalizedImage,
            url: this.#normalizeStoreUrl(product?.url ?? null),
            slug: typeof product?.slug === 'string' ? product.slug : null,
            raw: product,
          });
        }

        const nextTotalPages = Number(payload?.totalPages ?? payload?.total_pages ?? totalPages);
        totalPages = Number.isFinite(nextTotalPages) && nextTotalPages > 0 ? Math.trunc(nextTotalPages) : page;
        page += 1;
      }

      if (collected.length > 0) {
        let products = collected;

        try {
          const dbBannerByProductId = await this.#getDbBannerImagesByProductIds(
            collected.map((product) => product?.product_id ?? product?.id ?? ''),
          );

          if (dbBannerByProductId.size > 0) {
            products = collected.map((product) => {
              const productId = String(product?.product_id ?? product?.id ?? '').trim();
              const dbBanner = productId ? dbBannerByProductId.get(productId) : null;
              if (!dbBanner) return product;

              return {
                ...product,
                image: dbBanner,
                raw: {
                  ...(product?.raw && typeof product.raw === 'object' ? product.raw : {}),
                  db_banner_img: dbBanner,
                },
              };
            });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn('Failed to map GOG library covers from DB:', message);
        }

        return {
          products,
          total: products.length,
        };
      }
    } catch (err) {
      if (err && typeof err === 'object' && /** @type {any} */ (err).code === 'WRECK_INVALID_TOKEN') {
        throw err;
      }
      console.warn('Failed to fetch detailed GOG library, falling back to owned IDs:', err?.message);
    }

    const fallbackPayload = await this.#authedGetJson('https://embed.gog.com/user/data/games');
    const owned = Array.isArray(fallbackPayload?.owned) ? fallbackPayload.owned : [];

    return {
      products: owned
        .map((id) => String(id || '').trim())
        .filter((id) => id)
        .map((id) => ({
          id,
          product_id: id,
          title: `gog:${id}`,
          image: null,
          url: null,
          slug: null,
          raw: null,
        })),
      total: owned.length,
    };
  }

  /**
   * @param {string} [clientId]
   * @returns {Promise<{ success: boolean, user?: { id: number, username: string }, error?: string }>}
   */
  async login(clientId = GogController.getOAuthClientId()) {
    const resolvedClientId = String(clientId || '').trim() || GogController.getOAuthClientId();
    if (!resolvedClientId) {
      throw new Error('GOG OAuth client ID is required');
    }

    return new Promise((resolve) => {
      const authWindow = new BrowserWindow({
        width: 720,
        height: 840,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const authUrl = `https://auth.gog.com/auth?client_id=${encodeURIComponent(resolvedClientId)}&redirect_uri=${encodeURIComponent(GogController.getOAuthRedirectUri())}&response_type=code&layout=client2`;
      let settled = false;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const extractCodeFromUrl = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return null;

        try {
          const parsed = new URL(raw);
          const queryCode = String(parsed.searchParams.get('code') || '').trim();
          if (queryCode) return queryCode;

          const hashRaw = String(parsed.hash || '').replace(/^#/, '').trim();
          if (!hashRaw) return null;

          const hashParams = new URLSearchParams(hashRaw);
          const hashCode = String(hashParams.get('code') || '').trim();
          return hashCode || null;
        } catch {
          return null;
        }
      };

      const tryCompleteWithCode = async (url) => {
        if (settled) return;
        const code = extractCodeFromUrl(url);
        if (!code) return;

        try {
          await this.#exchangeAuthCode(resolvedClientId, code);
          const profile = await this.getProfile().catch(() => null);
          const profileId = Number(profile?.id);
          const profileUsername = String(profile?.username || '').trim();

          finish({
            success: true,
            user:
              Number.isFinite(profileId) && profileId > 0 && profileUsername
                ? { id: profileId, username: profileUsername }
                : undefined,
          });
          if (!authWindow.isDestroyed()) authWindow.close();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          finish({ success: false, error: message });
          if (!authWindow.isDestroyed()) authWindow.close();
        }
      };

      authWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (url && !authWindow.isDestroyed()) {
          authWindow.loadURL(url).catch(() => {});
        }
        return { action: 'deny' };
      });

      authWindow.webContents.on('will-redirect', (_event, url) => {
        tryCompleteWithCode(url).catch(() => {});
      });
      authWindow.webContents.on('did-navigate', (_event, url) => {
        tryCompleteWithCode(url).catch(() => {});
      });
      authWindow.webContents.on('did-navigate-in-page', (_event, url) => {
        tryCompleteWithCode(url).catch(() => {});
      });
      authWindow.webContents.on('did-finish-load', () => {
        if (authWindow.isDestroyed()) return;
        const currentUrl = authWindow.webContents.getURL();
        tryCompleteWithCode(currentUrl).catch(() => {});
      });

      authWindow.on('closed', () => {
        finish({ success: false });
      });

      authWindow.loadURL(authUrl).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        finish({ success: false, error: message });
        if (!authWindow.isDestroyed()) authWindow.close();
      });
    });
  }

  logout() {
    this.#oauthToken = null;
    this.#saveTokenToDisk(null);
  }

  static #agent = new https.Agent({
    keepAlive: true,
    maxSockets: 2,
    timeout: 20_000,
  });

  /**
   * @param {string} token
   * @param {any} details
   * @param {string|number} appIdHint
   * @returns {Promise<void>}
   */
  async #syncGogDetailsToServer(token, details, appIdHint) {
    const tokenStr = typeof token === 'string' ? token.trim() : '';
    if (!tokenStr || !details || typeof details !== 'object') return;

    const numericAppId = Number(details.app_id ?? details.id ?? appIdHint);
    if (!Number.isFinite(numericAppId) || numericAppId <= 0) return;

    const genreNames = Array.isArray(details.genres)
      ? details.genres
          .map((entry) => {
            if (typeof entry === 'string') return entry;
            if (entry && typeof entry === 'object') return entry.name ?? entry.genre ?? entry.description ?? null;
            return null;
          })
          .filter((value) => typeof value === 'string' && value.trim())
      : [];

    try {
      await super.syncScrapedGameWithServer(tokenStr, {
        app_id: String(numericAppId),
        platform_name: 'gog',
        name: details.title ?? `gog:${numericAppId}`,
        banner_img: details.banner_img ?? details.cover_url ?? '',
        description: details.description ?? '',
        minimum_requirements: details.minimum_requirements ?? '',
        cost: typeof details.min_price === 'number' ? details.min_price : null,
        genre_names: genreNames,
        country_code: 'DE',
      });
    } catch (err) {
      if (err && typeof err === 'object' && /** @type {any} */ (err).code === 'WRECK_INVALID_TOKEN') {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Failed to sync GOG game details for appID ${numericAppId}: ${msg}`);
    }
  }


  /**
   * Run a Windows REG QUERY and return stdout as a string.
   * @param {string[]} args
   * @returns {Promise<string>}
   */
  static #regQuery(args) {
    return new Promise((resolve, reject) => {
      execFile('REG', args, { shell: false, windowsHide: true, timeout: 10_000 }, (err, stdout, stderr) => {
        if (err) {
          // exit code 1 means "key not found" — treat as empty result, not an error
          if (err.code === 1 || (typeof stderr === 'string' && stderr.toLowerCase().includes('the system was unable to find'))) {
            resolve('');
          } else {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
          return;
        }
        resolve(typeof stdout === 'string' ? stdout : '');
      });
    });
  }

  /**
   * Parse the output of `REG QUERY` into a flat map of value name → value data.
   * Handles multi-level output (sub-keys and their values).
   *
   * @param {string} regOutput
   * @returns {Map<string, string>}  key is "HKLM\...\GameId:ValueName", value is the data string
   */
  static #parseRegOutput(regOutput) {
    const map = new Map();
    let currentKey = '';

    for (const rawLine of regOutput.split('\n')) {
      const line = rawLine.trimEnd();
      if (!line.trim()) continue;

      // A registry key line looks like "HKEY_LOCAL_MACHINE\SOFTWARE\..."
      if (/^HKEY/i.test(line.trim())) {
        currentKey = line.trim();
        continue;
      }

      // A value line looks like "    ValueName    REG_SZ    SomeData"
      const match = line.match(/^\s{4}(.+?)\s{4}(REG_SZ|REG_DWORD|REG_EXPAND_SZ)\s{4}(.*)$/);
      if (match && currentKey) {
        const valueName = match[1].trim();
        const valueData = match[3].trim();
        map.set(`${currentKey}:${valueName}`, valueData);
      }
    }
    return map;
  }

  /**
   * Detect installed GOG games from the Windows registry.
   * GOG Galaxy writes entries under:
   *   HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\{productId}
   * Each sub-key has values: GAMENAME, EXEFILE, LAUNCHCOMMAND, INSTALLPATH, PRODUCTID, etc.
   *
   * @returns {Promise<import('../models').GogInstalledGame[]>}
   */
  async getInstalledGames() {
    const baseKey = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\GOG.com\\Games';
    const baseKey64 = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\GOG.com\\Games';
    const baseKeyCurrentUser = 'HKEY_CURRENT_USER\\SOFTWARE\\GOG.com\\Games';
    const baseKeyCurrentUserWow = 'HKEY_CURRENT_USER\\SOFTWARE\\WOW6432Node\\GOG.com\\Games';

    /** @type {import('../models').GogInstalledGame[]} */
    const results = [];

    for (const key of [baseKey, baseKey64, baseKeyCurrentUser, baseKeyCurrentUserWow]) {
      let output = '';
      try {
        output = await GogController.#regQuery(['QUERY', key, '/s']);
      } catch {
        continue;
      }

      if (!output.trim()) continue;

      // Group lines into sub-keys
      const lines = output.split('\n');
      /** @type {Map<string, Map<string, string>>} */
      const subKeys = new Map();
      let currentSubKey = '';

      for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line.trim()) continue;

        if (/^HKEY/i.test(line.trim())) {
          currentSubKey = line.trim();
          if (!subKeys.has(currentSubKey)) subKeys.set(currentSubKey, new Map());
          continue;
        }

        const match = line.match(/^\s{4}(.+?)\s{4}(REG_SZ|REG_DWORD|REG_EXPAND_SZ)\s{4}(.*)$/);
        if (match && currentSubKey) {
          const vals = subKeys.get(currentSubKey);
          if (vals) vals.set(match[1].trim(), match[3].trim());
        }
      }

      for (const [subKey, vals] of subKeys) {
        // Skip the root key itself (it has no game values)
        if (subKey.toLowerCase() === key.toLowerCase()) continue;

        const caseInsensitiveValues = new Map();
        for (const [name, value] of vals.entries()) {
          const lowered = String(name || '').trim().toLowerCase();
          if (!lowered || caseInsensitiveValues.has(lowered)) continue;
          caseInsensitiveValues.set(lowered, value);
        }

        const gameName = caseInsensitiveValues.get('gamename') || caseInsensitiveValues.get('game_name') || null;
        const executable = caseInsensitiveValues.get('exefile') || caseInsensitiveValues.get('exe') || null;
        const launchCommand = caseInsensitiveValues.get('launchcommand') || executable || null;

        if (!gameName && !launchCommand) continue;

        const productId =
          caseInsensitiveValues.get('productid')
          || caseInsensitiveValues.get('gameid')
          || subKey.split('\\').pop()
          || null;
        const installPath =
          caseInsensitiveValues.get('installpath')
          || caseInsensitiveValues.get('path')
          || caseInsensitiveValues.get('workingdir')
          || null;
        const version =
          caseInsensitiveValues.get('versiongamescanner')
          || caseInsensitiveValues.get('version')
          || caseInsensitiveValues.get('ver')
          || null;
        const buildId = caseInsensitiveValues.get('buildid') || caseInsensitiveValues.get('build') || null;

        if (!productId) continue;

        results.push({
          productId,
          gameName: gameName || `GOG ${productId}`,
          installPath,
          launchCommand,
          version,
          buildId,
          raw: Object.fromEntries(vals),
        });
      }
    }

    results.sort((a, b) => (a.gameName || '').toLowerCase().localeCompare((b.gameName || '').toLowerCase()));
    return results;
  }
/**
 * Parse various possible price value representations returned by GOG APIs.
 * Returns numeric value (float) in currency units or null if not parseable.
 * @param {any} val
 * @return {number|null}
 */
  #parseGogPrice(val) {
  if (val == null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'string') {
    const cleaned = String(val).replace(/[^0-9,.-]/g, '').replace(/,/g, '.').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof val === 'object') {
    // Try common numeric keys first
    for (const k of ['amount', 'price', 'final', 'base', 'value', 'gross']) {
      if (val[k] != null) {
        //@ts-ignore
        const p = this.#parseGogPrice(val[k]);
        if (p != null) return p;
      }
    }
    // Try all properties as a last resort
    for (const k of Object.keys(val)) {
        //@ts-ignore
      const p = this.#parseGogPrice(val[k]);
      if (p != null) return p;
    }
  }
  return null;
}
/**
 * Compute discount percent given initial and final numeric prices.
 * Returns a number representing percent (e.g. 75 for 75%), rounded to two decimals, or null.
 * @param {number} initial
 * @param {number} final
 * @return {number|null}
 */
  #computeDiscountPercent(initial, final) {
  if (typeof initial !== 'number' || typeof final !== 'number' || initial <= 0) return null;
  const pct = ((initial - final) / initial) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 100) / 100;
}
/**
 * Fetches the URL of the cover image for a GOG game.
 * @param {string|number} appId The GOG application ID.
 * @returns {Promise<string|null>} The URL of the cover image or null if not found.
 */
async #fetchGogCoverUrl(appId) {
  try {
    const productsResponse = await fetch(`https://api.gog.com/products/${appId}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WreckLauncher/1.0 (+gog scraper)',
      },
    });

    if (productsResponse.ok) {
      const productPayload = await productsResponse.json();
      const fromProductsEndpoint = this._getFirstStringByPaths(productPayload, [
        ['images', 'background'],
        ['images', 'logo'],
        ['image'],
      ]);

      const normalizedProductImage = this.#normalizeImageUrl(fromProductsEndpoint);
      if (normalizedProductImage) {
        try {
          const productHead = await fetch(normalizedProductImage, { method: 'HEAD' });
          if (productHead.ok) return normalizedProductImage;
        } catch {
          // continue to v2 fallback
        }
      }
    }
  } catch {
    // continue to v2 fallback
  }

  const response = await fetch(`https://api.gog.com/v2/games/${appId}?locale=en-US`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'WreckLauncher/1.0 (+gog scraper)',
    },
  });
  if (!response.ok) {
    console.warn('Failed to fetch GOG cover URL:', { appId: appId, status: response.status });
    return null;
  }

  const data = await response.json();
  const rawTemplate = String(data?._embedded?.product?._links?.image?.href ?? '').trim();
  if (!rawTemplate) return null;

  let template = rawTemplate
    .replace(/%7Bformatter%7D/gi, '{formatter}')
    .replace(/%7Bext%7D/gi, '{ext}');

  if (template.startsWith('//')) {
    template = `https:${template}`;
  } else if (!/^https?:\/\//i.test(template)) {
    if (template.startsWith('/')) {
      template = `https://images.gog-statics.com${template}`;
    } else {
      template = `https://images.gog-statics.com/${template.replace(/^\/+/, '')}`;
    }
  }

  const hasFormatter = /\{formatter\}/i.test(template);
  const hasExt = /\{ext\}/i.test(template);
  /**
   * @param {string} formatter
   * @param {string} ext
   * @returns {string}
   */
  const expand = (formatter, ext) => {
    return template
      .replace(/\{formatter\}/gi, formatter)
      .replace(/\{ext\}/gi, ext);
  };

  /** @type {string[]} */
  const candidates = [];
  if (hasFormatter || hasExt) {
    candidates.push(expand('glx_vertical_cover', 'webp'));
    candidates.push(expand('product_card_v2_mobile_slider_639', 'webp'));
    candidates.push(expand('product_card_v2_mobile_slider_639', 'jpg'));
    candidates.push(expand('1600', 'png'));
  } else {
    candidates.push(template);
  }

  const uniqueCandidates = Array.from(new Set(candidates.filter((url) => {
    const candidate = String(url || '').trim();
    return !!candidate && !/\{formatter\}|\{ext\}/i.test(candidate);
  })));

  for (const candidate of uniqueCandidates) {
    try {
      const headResponse = await fetch(candidate, { method: 'HEAD' });
      if (headResponse.ok) return candidate;
    } catch {
      // ignore and continue trying other candidates
    }
  }

  return this.#normalizeImageUrl(template);
}

  /**
   * @param {string|number} productId
   * @returns {Promise<boolean>}
   */
  async #launchInstalledGameExecutable(productId) {
    const id = String(productId || '').trim();
    if (!id || !/^\d+$/.test(id)) return false;

    const installedGames = await this.getInstalledGames().catch(() => []);
    const installed = Array.isArray(installedGames)
      ? installedGames.find((entry) => String(entry?.productId ?? '').trim() === id)
      : null;
    if (!installed || typeof installed !== 'object') return false;

    const launchCommandRaw = String(
      installed?.launchCommand
      ?? installed?.raw?.launchCommand
      ?? installed?.raw?.exe
      ?? installed?.raw?.exeFile
      ?? '',
    ).trim();
    if (!launchCommandRaw) return false;

    const quotedMatch = launchCommandRaw.match(/^"([^"]+\.exe)"(?:\s|$)/i);
    const unquotedMatch = launchCommandRaw.match(/^([a-zA-Z]:\\.*?\.exe)(?:\s|$)/i);
    const executablePath = String(quotedMatch?.[1] ?? unquotedMatch?.[1] ?? launchCommandRaw).trim();
    if (!/\.exe$/i.test(executablePath)) return false;

    try {
      const openPathResult = await shell.openPath(executablePath);
      if (openPathResult === '') return true;
    } catch {
      // continue to spawn fallback
    }

    try {
      const child = spawn(executablePath, [], {
        cwd: typeof installed?.installPath === 'string' && installed.installPath.trim()
          ? installed.installPath.trim()
          : undefined,
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @param {string} rawCommand
   * @returns {{ executablePath: string|null, hasArguments: boolean }}
   */
  #extractExecutableFromCommand(rawCommand) {
    const text = String(rawCommand || '').trim();
    if (!text) return { executablePath: null, hasArguments: false };

    const quotedMatch = text.match(/^"([^"]+\.exe)"(.*)$/i);
    if (quotedMatch) {
      const executablePath = String(quotedMatch[1] || '').trim();
      const rest = String(quotedMatch[2] || '').trim();
      return {
        executablePath: /\.exe$/i.test(executablePath) ? executablePath : null,
        hasArguments: rest.length > 0,
      };
    }

    const unquotedMatch = text.match(/^([a-zA-Z]:\\.*?\.exe)(?:\s+(.*))?$/i);
    if (unquotedMatch) {
      const executablePath = String(unquotedMatch[1] || '').trim();
      const rest = String(unquotedMatch[2] || '').trim();
      return {
        executablePath: /\.exe$/i.test(executablePath) ? executablePath : null,
        hasArguments: rest.length > 0,
      };
    }

    return {
      executablePath: /\.exe$/i.test(text) ? text : null,
      hasArguments: false,
    };
  }

  /**
   * @param {string} command
   * @param {string|undefined} cwd
   * @returns {Promise<boolean>}
   */
  async #runDetachedCommand(command, cwd) {
    const normalizedCommand = String(command || '').trim();
    if (!normalizedCommand) return false;

    return await new Promise((resolve) => {
      try {
        const child = spawn(normalizedCommand, {
          cwd,
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          shell: true,
        });
        child.once('error', () => resolve(false));
        child.unref();
        resolve(true);
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * @param {string|number} productId
   * @returns {Promise<boolean>}
   */
  async #launchInstalledGameUninstaller(productId) {
    const id = String(productId || '').trim();
    if (!id || !/^\d+$/.test(id)) return false;

    const installedGames = await this.getInstalledGames().catch(() => []);
    const installed = Array.isArray(installedGames)
      ? installedGames.find((entry) => String(entry?.productId ?? '').trim() === id)
      : null;
    if (!installed || typeof installed !== 'object') return false;

    const rawMap = new Map();
    const raw = installed?.raw && typeof installed.raw === 'object' ? installed.raw : null;
    if (raw) {
      for (const [name, value] of Object.entries(raw)) {
        const key = String(name || '').trim().toLowerCase();
        const normalizedValue = String(value || '').trim();
        if (!key || !normalizedValue || rawMap.has(key)) continue;
        rawMap.set(key, normalizedValue);
      }
    }

    const uninstallCommandCandidates = [
      rawMap.get('uninstallcommand'),
      rawMap.get('uninstallstring'),
      rawMap.get('uninstaller'),
      rawMap.get('uninstallexe'),
      rawMap.get('uninstallpath'),
      rawMap.get('uninstall'),
    ].filter((value) => typeof value === 'string' && value.trim());

    const cwd =
      typeof installed?.installPath === 'string' && installed.installPath.trim()
        ? installed.installPath.trim()
        : undefined;

    for (const candidate of uninstallCommandCandidates) {
      const command = String(candidate || '').trim();
      if (!command) continue;

      const parsed = this.#extractExecutableFromCommand(command);
      if (parsed.executablePath && !parsed.hasArguments) {
        try {
          const openError = await shell.openPath(parsed.executablePath);
          if (!openError) return true;
        } catch {
          // continue to shell command fallback
        }
      }

      const launched = await this.#runDetachedCommand(command, cwd);
      if (launched) return true;
    }

    const installPath =
      typeof installed?.installPath === 'string' && installed.installPath.trim()
        ? installed.installPath.trim()
        : '';
    if (!installPath || !fs.existsSync(installPath)) return false;

    /** @type {string[]} */
    const uninstallExecutables = [];
    /** @type {string[]} */
    const queue = [installPath];
    const visited = new Set();

    while (queue.length > 0 && uninstallExecutables.length < 40) {
      const currentDir = queue.shift();
      if (!currentDir) continue;
      const dirKey = String(currentDir || '').toLowerCase();
      if (!dirKey || visited.has(dirKey)) continue;
      visited.add(dirKey);

      /** @type {import('fs').Dirent[]} */
      let entries = [];
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
          continue;
        }

        if (!entry.isFile()) continue;
        if (!/\.exe$/i.test(entry.name)) continue;
        if (!/(unins|uninstall)/i.test(entry.name)) continue;
        uninstallExecutables.push(fullPath);
      }
    }

    uninstallExecutables.sort((left, right) => left.length - right.length);

    for (const executablePath of uninstallExecutables) {
      try {
        const openError = await shell.openPath(executablePath);
        if (!openError) return true;
      } catch {
        // continue to next candidate
      }

      const launched = await this.#runDetachedCommand(`"${executablePath}"`, installPath || undefined);
      if (launched) return true;
    }

    return false;
  }

  /**
   * @param {string} title
   * @returns {string[]}
   */
  #buildSlugCandidatesFromTitle(title) {
    const normalized = this._normalizeTitleForCompare(title);
    if (!normalized) return [];

    const words = normalized.split(' ').filter(Boolean);
    if (words.length < 1) return [];

    const dropTail = new Set([
      'edition',
      'definitive',
      'remastered',
      'enhanced',
      'ultimate',
      'complete',
      'game',
      'year',
      'deluxe',
      'gold',
      'goty',
      'director',
      'directors',
      'cut',
    ]);
    const trimmedWords = [...words];
    while (trimmedWords.length > 2 && dropTail.has(trimmedWords[trimmedWords.length - 1])) {
      trimmedWords.pop();
    }

    const noLeadingThe = words[0] === 'the' && words.length > 1 ? words.slice(1) : words;
    const progressive = [];
    for (let length = words.length; length >= 2; length -= 1) {
      progressive.push(words.slice(0, length).join(' '));
    }

    const variants = new Set([
      words.join('_'),
      words.join('-'),
      trimmedWords.join('_'),
      trimmedWords.join('-'),
      noLeadingThe.join('_'),
      noLeadingThe.join('-'),
      ...progressive.map((value) => value.replace(/\s+/g, '_')),
      ...progressive.map((value) => value.replace(/\s+/g, '-')),
    ]);

    return Array.from(variants).filter((slug) => typeof slug === 'string' && slug.trim()).slice(0, 16);
  }

  /**
   * Search GOG game candidates by title (slug probing).
   *
   * @param {string} title
   * @returns {Promise<Array<{ slug: string, appId: string|number|null, title: string, score: number, url: string|null }>>}
   */
  async searchGameByTitle(title) {
    const needle = String(title || '').trim();
    if (!needle) return [];

    const slugs = this.#buildSlugCandidatesFromTitle(needle);
    const matches = [];
    const seen = new Set();

    for (const slug of slugs) {
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);

      const details = await this.getGameDetails(slug, { includeRaw: false });
      if (!details || typeof details !== 'object') continue;

      const matchedTitle = String(details.title || '').trim();
      const score = this._titleMatchScore(needle, matchedTitle);

      matches.push({
        slug,
        appId: details.app_id ?? details.id ?? null,
        title: matchedTitle || slug,
        score,
        url: typeof details.url === 'string' ? details.url : null,
      });
    }

    matches.sort((a, b) => b.score - a.score);
    return matches;
  }

  /**
   * Resolve GOG details by game title instead of cross-platform appid.
   *
   * @param {string} title
   * @param {string} [token]
   * @returns {Promise<import('../models').GogGameDetails|null>}
   */
  async getGameDetailsByTitle(title, token = '') {
    const matches = await this.searchGameByTitle(title);
    if (matches.length < 1) return null;

    let bestDetails = null;
    let bestScore = 0;

    for (const match of matches.slice(0, 8)) {
      const details = token
        ? await this.getGameDetails(match.slug, token, { includeRaw: true })
        : await this.getGameDetails(match.slug, { includeRaw: true });
      if (!details || typeof details !== 'object') continue;

      const candidateTitle = String(details.title || match.title || '').trim();
      const detailScore = this._titleMatchScore(title, candidateTitle);
      const mergedScore = Math.max(match.score, detailScore);

      const enrichedDetails = {
        ...details,
        raw: {
          ...(details.raw || {}),
          search_match: {
            ...match,
            score: mergedScore,
          },
        },
      };

      if (!bestDetails || mergedScore > bestScore) {
        bestDetails = enrichedDetails;
        bestScore = mergedScore;
      }

      if (mergedScore >= 0.98) {
        return enrichedDetails;
      }
    }

    return bestDetails;
  }

  /**
   * Fetch game details from the GOG public API (no auth required).
   * Endpoint: https://api.gog.com/products/{productId}?expand=description,screenshots,videos,related_products,changelog
   *
   * @param {string|number} appId  GOG product ID.
   * @param {string|{includeRaw?: boolean}} [tokenOrOptions]
   * @param {{includeRaw?: boolean}} [maybeOptions]
   * @returns {Promise<import('../models').GogGameDetails|null>}
   */
  async getGameDetails(appId, tokenOrOptions = '', maybeOptions = {}) {
    let token = '';
    /** @type {{ includeRaw?: boolean }} */
    let options = {};

    if (tokenOrOptions && typeof tokenOrOptions === 'object' && !Array.isArray(tokenOrOptions)) {
      options = tokenOrOptions;
    } else {
      token = typeof tokenOrOptions === 'string' ? tokenOrOptions.trim() : '';
      options = maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {};
    }

    const includeRaw = options.includeRaw !== false;
    const numericAppId = Number(appId);
    // If caller passed a numeric GOG product id, prefer the products endpoint which
    // returns richer data for numeric ids. Otherwise fall back to slug-based v2/games.
    if (Number.isFinite(numericAppId) && numericAppId > 0) {
      const endpoint = `https://api.gog.com/products/${numericAppId}?expand=description,screenshots`;
      try {
        const response = await fetch(endpoint, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'WreckLauncher/1.0 (+gog scraper)',
          },
        });
        if (!response.ok) return null;
        const payload = await response.json();
        if (!payload || typeof payload !== 'object') return null;
  
        const title = typeof payload.title === 'string' ? payload.title.trim() : null;
        const bannerCandidate = this._getFirstStringByPaths(payload, [
          ['images', 'background'],
          ['images', 'logo'],
          ['image'],
        ]);
        const bannerImg = typeof bannerCandidate === 'string' && bannerCandidate.startsWith('//')
          ? `https:${bannerCandidate}`
          : (bannerCandidate ?? null);
  
        const leadDesc = typeof payload?.description?.lead === 'string' ? payload.description.lead : null;
        const fullDesc = typeof payload?.description?.full === 'string' ? payload.description.full : null;
        const description = leadDesc || fullDesc || null;
        const priceUrl = `https://api.gog.com/products/${numericAppId}/prices?countryCode=DE`;    
        try {
          const priceRes = await fetch(priceUrl, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'WreckLauncher/1.0 (+gog price checker)',
            },
          });
          if (priceRes.ok) {
            const priceData = await priceRes.json();
            let priceArray = [];
            if (Array.isArray(priceData)) {
              priceArray = priceData;
            } else if (priceData && typeof priceData === 'object') {
              if (Array.isArray(priceData._embedded?.prices)) priceArray = priceData._embedded.prices;
              else if (Array.isArray(priceData.prices)) priceArray = priceData.prices;
              else priceArray = Object.values(priceData);
            }
            for (const priceEntry of priceArray) {
              const currencyCode = String(priceEntry?.currency?.code ?? priceEntry?.currencyCode ?? '').trim().toUpperCase();
              if (currencyCode !== 'EUR') continue;
              const priceInitialNumeric = this.#parseGogPrice(priceEntry.basePrice ?? priceEntry.base_price ?? priceEntry.initial ?? priceEntry.price ?? priceEntry.amount ?? priceEntry);
              const priceFinalNumeric = this.#parseGogPrice(priceEntry.finalPrice ?? priceEntry.final_price ?? priceEntry.final ?? priceEntry.price ?? priceEntry.amount ?? priceEntry);
              payload.price = {
                initial: priceInitialNumeric ?? null,
                final: priceFinalNumeric ?? null,
                //@ts-ignore
                discount: this.#computeDiscountPercent(priceInitialNumeric, priceFinalNumeric),
              };
              break;
            }
          }
        } catch (err) {
          //@ts-ignore
          console.warn('Failed to parse GOG price entry:', { appId: numericAppId, err: err?.message });
        }
        let cost = null;
        const finalPrice = payload?.price?.final ?? payload?.price?.initial ?? null;
        if (finalPrice != null) {
          const parsed = Number.parseFloat(String(finalPrice));
          if (Number.isFinite(parsed)) cost = parsed;
        }
  
        const genres = this._normalizeGenreNames(
          Array.isArray(payload?.genres)
          //@ts-ignore
            ? payload.genres.map((g) => (typeof g === 'string' ? g : g?.name))
            : []
        );
        let minimumRequirements = "";
        const minReqUrl = `https://api.gog.com/v2/games/${numericAppId}?locale=en-US`;
        try {
          const minReqRes = await fetch(minReqUrl, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'WreckLauncher/1.0 (+gog scraper)',
            },
          });
          if (minReqRes.ok) {
            const minReqData = await minReqRes.json();
            if (minReqData) {
              // Try several possible shapes where requirements may live
              let supported = [];
              if (Array.isArray(minReqData.supportedOperatingSystems)) supported = minReqData.supportedOperatingSystems;
              else if (Array.isArray(minReqData.supported_operating_systems)) supported = minReqData.supported_operating_systems;
              else if (Array.isArray(minReqData.systemRequirements)) supported = minReqData.systemRequirements;
              else if (Array.isArray(minReqData.system_requirements)) supported = minReqData.system_requirements;
              else if (Array.isArray(minReqData._embedded?.product?.supportedOperatingSystems)) supported = minReqData._embedded.product.supportedOperatingSystems;
              else if (Array.isArray(minReqData._embedded?.product?.systemRequirements)) supported = minReqData._embedded.product.systemRequirements;
              else if (Array.isArray(minReqData._embedded?.supportedOperatingSystems)) supported = minReqData._embedded.supportedOperatingSystems;
              else if (Array.isArray(minReqData._embedded?.systemRequirements)) supported = minReqData._embedded.systemRequirements;
              else if (Array.isArray(minReqData)) supported = minReqData;
  
              const blocks = [];
              for (const entry of supported) {
                if (!entry || typeof entry !== 'object') continue;
  
                // Case A: entry is a requirement block itself: { type: 'minimum', requirements: [...] }
                if (typeof entry.type === 'string' && Array.isArray(entry.requirements)) {
                  blocks.push({ osName: String(entry?.operatingSystem?.name ?? '').trim(), block: entry });
                  continue;
                }
  
                // Case B: entry groups systemRequirements under an operatingSystem
                const sysReqs = Array.isArray(entry.systemRequirements) ? entry.systemRequirements : (Array.isArray(entry.system_requirements) ? entry.system_requirements : null);
                if (Array.isArray(sysReqs)) {
                  const osName = String(entry?.operatingSystem?.name ?? entry?.operatingSystem ?? entry?.name ?? '').trim();
                  for (const b of sysReqs) {
                    if (!b || typeof b !== 'object') continue;
                    blocks.push({ osName, block: b });
                  }
                  continue;
                }
  
                // Case C: fallback: entry may contain nested requirement arrays under other keys
                if (Array.isArray(entry.requirements)) {
                  blocks.push({ osName: String(entry?.operatingSystem?.name ?? '').trim(), block: entry });
                }
              }
  
              const outBlocks = [];
              for (const item of blocks) {
                const osName = item.osName || '';
                const block = item.block;
                const type = String(block?.type ?? '').toLowerCase();
                if (!type.includes('minimum')) continue;
  
                const lines = [];
                if (osName) lines.push(`OS: ${osName}`);
  
                const reqItems = Array.isArray(block.requirements) ? block.requirements : [];
                for (const r of reqItems) {
                  if (typeof r === 'string') {
                    const t = r.trim(); if (t) lines.push(t);
                    continue;
                  }
                  if (!r || typeof r !== 'object') continue;
                  const name = String(r?.name ?? r?.id ?? '').trim();
                  const desc = String(r?.description ?? r?.value ?? '').trim();
                  if (name && desc) lines.push(`${name} ${desc}`);
                  else if (name) lines.push(name);
                  else if (desc) lines.push(desc);
                }
  
                if (lines.length > 0) outBlocks.push(lines.join('\n'));
              }
  
              if (outBlocks.length > 0) minimumRequirements = outBlocks.join('\n\n');
            }
          }
        } catch (err) {
          //@ts-ignore
          console.warn('Failed to fetch GOG minimum requirements:', { appId: numericAppId, err: err?.message });
        }
  
        const details = {
          id: numericAppId,
          app_id: numericAppId,
          title,
          cover_url: bannerImg,
          banner_img: bannerImg,
          description,
          minimum_requirements: minimumRequirements || "",
          min_price: cost,
          price: payload?.price?.initial ?? null,
          discount: payload?.price?.discount ?? null,
          //@ts-ignore
          is_free: Number.isFinite(cost) ? cost <= 0 : false,
          genres,
          url: `https://www.gog.com/en/game/${numericAppId}`,
        };
        //@ts-ignore
        if (includeRaw) details.raw = payload;
        await this.#syncGogDetailsToServer(token, details, numericAppId);
        //@ts-ignore
        return details;
      } catch (err) {
        //@ts-ignore
        console.warn('Failed to fetch GOG game details (products endpoint):', { appId: numericAppId, err: err?.message });
        // fall through to slug-based attempt below
      }
    }
  
    // Fallback: treat appId as slug and query v2/games (existing behavior)
    const endpoint = `https://api.gog.com/v2/games/${appId}?locale=en-US`;
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WreckLauncher/1.0 (+gog scraper)',
        },
      });
  
      if (!response.ok) return null;
      const payload = await response.json();
      if (!payload || typeof payload !== 'object') return null;
  
      const title = typeof payload.title === 'string' ? payload.title.trim() : null;
  
      const description = typeof payload?.description === 'string' ? payload.description : null;
  
      const priceUrl = `https://api.gog.com/products/${appId}/prices?countryCode=DE`;
      try {
        const priceRes = await fetch(priceUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'WreckLauncher/1.0 (+gog price checker)',
          },
        });
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          let priceArray = [];
          if (Array.isArray(priceData)) {
            priceArray = priceData;
          } else if (priceData && typeof priceData === 'object') {
            if (Array.isArray(priceData._embedded?.prices)) priceArray = priceData._embedded.prices;
            else if (Array.isArray(priceData.prices)) priceArray = priceData.prices;
            else priceArray = Object.values(priceData);
          }
          for (const priceEntry of priceArray) {
            const currencyCode = String(priceEntry?.currency?.code ?? priceEntry?.currencyCode ?? '').trim().toUpperCase();
            if (currencyCode !== 'EUR') continue;
            const priceInitialNumeric = this.#parseGogPrice(priceEntry.basePrice ?? priceEntry.base_price ?? priceEntry.initial ?? priceEntry.price ?? priceEntry.amount ?? priceEntry);
            const priceFinalNumeric = this.#parseGogPrice(priceEntry.finalPrice ?? priceEntry.final_price ?? priceEntry.final ?? priceEntry.price ?? priceEntry.amount ?? priceEntry);
            payload.price = {
              initial: priceInitialNumeric ?? null,
              final: priceFinalNumeric ?? null,
              //@ts-ignore
              discount: this.#computeDiscountPercent(priceInitialNumeric, priceFinalNumeric),
            };
            break;
          }
        }
      } catch (err) {
        //@ts-ignore
        console.warn('Failed to parse GOG price entry:', { appId: appId, err: err?.message });
      }
  
      let cost = null;
      const finalPrice = payload?.price?.initial;
      if (finalPrice != null) {
        const parsed = Number.parseFloat(String(finalPrice));
        if (Number.isFinite(parsed)) cost = parsed;
      }
  
      const genres = this._normalizeGenreNames(
        Array.isArray(payload?.genres)
        //@ts-ignore
          ? payload.genres.map((g) => (typeof g === 'string' ? g : g?.name))
          : []
      );
  
      const cover_url = await this.#fetchGogCoverUrl(appId);
      const bannerImg = cover_url ?? null;
      let minimumRequirements = "";
      try {
        const minReqData = payload;
        let supported = [];
        if (Array.isArray(minReqData.supportedOperatingSystems)) supported = minReqData.supportedOperatingSystems;
        else if (Array.isArray(minReqData.supported_operating_systems)) supported = minReqData.supported_operating_systems;
        else if (Array.isArray(minReqData.systemRequirements)) supported = minReqData.systemRequirements;
        else if (Array.isArray(minReqData.system_requirements)) supported = minReqData.system_requirements;
        else if (Array.isArray(minReqData._embedded?.product?.supportedOperatingSystems)) supported = minReqData._embedded.product.supportedOperatingSystems;
        else if (Array.isArray(minReqData._embedded?.product?.systemRequirements)) supported = minReqData._embedded.product.systemRequirements;
        else if (Array.isArray(minReqData._embedded?.supportedOperatingSystems)) supported = minReqData._embedded.supportedOperatingSystems;
        else if (Array.isArray(minReqData._embedded?.systemRequirements)) supported = minReqData._embedded.systemRequirements;
        else if (Array.isArray(minReqData)) supported = minReqData;
  
        const blocks = [];
        for (const entry of supported) {
          if (!entry || typeof entry !== 'object') continue;
  
          // Case A: entry is a requirement block itself
          if (typeof entry.type === 'string' && Array.isArray(entry.requirements)) {
            blocks.push({ osName: String(entry?.operatingSystem?.name ?? '').trim(), block: entry });
            continue;
          }
  
          // Case B: entry groups systemRequirements under an operatingSystem
          const sysReqs = Array.isArray(entry.systemRequirements) ? entry.systemRequirements : (Array.isArray(entry.system_requirements) ? entry.system_requirements : null);
          if (Array.isArray(sysReqs)) {
            const osName = String(entry?.operatingSystem?.name ?? entry?.operatingSystem ?? entry?.name ?? '').trim();
            for (const b of sysReqs) {
              if (!b || typeof b !== 'object') continue;
              blocks.push({ osName, block: b });
            }
            continue;
          }
  
          // Case C: fallback - entry may contain nested requirement arrays under other keys
          if (Array.isArray(entry.requirements)) {
            blocks.push({ osName: String(entry?.operatingSystem?.name ?? '').trim(), block: entry });
          }
        }
  
        const outBlocks = [];
        for (const item of blocks) {
          const osName = item.osName || '';
          const block = item.block;
          const type = String(block?.type ?? '').toLowerCase();
          if (!type.includes('minimum')) continue;
  
          const lines = [];
          if (osName) lines.push(`OS: ${osName}`);
  
          const reqItems = Array.isArray(block.requirements) ? block.requirements : [];
          for (const r of reqItems) {
            if (typeof r === 'string') {
              const t = r.trim(); if (t) lines.push(t);
              continue;
            }
            if (!r || typeof r !== 'object') continue;
            const name = String(r?.name ?? r?.id ?? '').trim();
            const desc = String(r?.description ?? r?.value ?? '').trim();
            if (name && desc) lines.push(`${name} ${desc}`);
            else if (name) lines.push(name);
            else if (desc) lines.push(desc);
          }
  
          if (lines.length > 0) outBlocks.push(lines.join('\n'));
        }
  
        if (outBlocks.length > 0) minimumRequirements = outBlocks.join('\n\n');
  
      } catch (err) {
        //@ts-ignore
        console.warn('Failed to parse GOG minimum requirements (fallback):', { appId: appId, err: err?.message });
      }
  
      const details = {
        id: appId,
        app_id: appId,
        title,
        cover_url,
        banner_img: bannerImg,
        description,
        minimum_requirements: minimumRequirements || "",
        min_price: cost,
        price: payload?.price?.initial ?? null,
        discount: payload?.price?.discount ?? null,
        //@ts-ignore
        is_free: Number.isFinite(cost) ? cost <= 0 : false,
        genres,
        url: `https://www.gog.com/en/game/${appId}`,
      };
      //@ts-ignore
      if (includeRaw) details.raw = payload;
      await this.#syncGogDetailsToServer(token, details, appId);
      //@ts-ignore
      return details;
    } catch (err) {
      //@ts-ignore
      console.warn('Failed to fetch GOG game details:', { appId: appId, err: err?.message });
      return null;
    }
  }
  // async getGameDetails(token, productId) {
  //   if (!token || !String(token).trim()) throw new Error('Auth token is required');
  //   const id = String(productId).trim();
  //   if (!id || !/^\d+$/.test(id)) throw new Error(`Invalid GOG product ID: ${String(productId)}`);

  //   // 1) Prefer DB data first.
  //   const dbUrl = joinUrl(this.#serverUrl, 'api', 'games', id, 'all');
  //   const dbRes = await fetchJsonSafe(dbUrl, {
  //     method: 'GET',
  //     headers: { 'Accept': 'application/json' },
  //   });

  //   if (dbRes.ok && dbRes.json && typeof dbRes.json === 'object') {
  //     const platformName = String(dbRes.json.platform_name ?? dbRes.json.platform ?? '').trim().toLowerCase();
  //     if (platformName === 'gog') {
  //       const genreNames = Array.isArray(dbRes.json.genres)
  //         ? dbRes.json.genres
  //             .map((/** @type {any} */ g) => (typeof g === 'string' ? g : g?.genre ?? g?.name))
  //             .filter((/** @type {any} */ v) => typeof v === 'string' && v.trim())
  //         : [];

  //       return {
  //         productId: id,
  //         title: dbRes.json.name ?? `gog:${id}`,
  //         bannerImg: dbRes.json.banner_img ?? null,
  //         description: dbRes.json.description ?? null,
  //         cost: typeof dbRes.json.cost === 'number' ? dbRes.json.cost : null,
  //         genreNames,
  //         raw: {
  //           ...dbRes.json,
  //           source: 'database',
  //         },
  //       };
  //     }
  //   }

  //   // 2) Fallback to scrape endpoint, which also uploads to DB when missing.
  //   const url = `${joinUrl(this.#serverUrl, 'api', 'gog', 'game', id)}?ensureUpload=true`;
  //   const { ok, status, json } = await fetchJsonSafe(url, {
  //     method: 'GET',
  //     headers: { 'Accept': 'application/json' },
  //   });

  //   if (!ok) {
  //     if (status === 401) {
  //       const msg = (json && typeof json === 'object' ? json.error : null) || 'Unauthorized';
  //       const e = new Error(`Unauthorized (token invalid/expired): ${String(msg).slice(0, 300)}`);
  //       // @ts-ignore
  //       e.code = 'WRECK_INVALID_TOKEN';
  //       throw e;
  //     }
  //     if (status === 404) return null;
  //     const msg = (json && typeof json === 'object' ? json.error : null) || `HTTP ${status}`;
  //     throw new Error(`GOG game fetch failed: ${String(msg).slice(0, 300)}`);
  //   }

  //   if (!json || typeof json !== 'object') return null;

  //   return {
  //     productId: id,
  //     title: typeof json.title === 'string' ? json.title : `gog:${id}`,
  //     bannerImg: json.bannerImg ?? json.banner_img ?? json.cover_url ?? null,
  //     description: json.description ?? null,
  //     cost: typeof json.cost === 'number' ? json.cost : (typeof json.min_price === 'number' ? json.min_price : null),
  //     genreNames: Array.isArray(json.genreNames) ? json.genreNames : (Array.isArray(json.genres) ? json.genres : []),
  //     raw: {
  //       ...json,
  //       source: 'scrape-endpoint',
  //     },
  //   };
  // }

  /**
   * Open GOG Galaxy for a game action via URL scheme.
   * Known GOG Galaxy protocol handlers:
   *   goggalaxy://openGameView/{productId}
   *   goggalaxy://runGame/{productId}
   *   goggalaxy://installGame/{productId}
   *   goggalaxy://openStoreUrl/{url}
   *
   * @param {string|number} productId  GOG numeric product ID
   * @param {'open'|'run'|'install'|'uninstall'} action
   * @returns {Promise<{ ok: boolean, url: string }>}
   */
  async clientGameControlUtil(productId, action) {
    const id = String(productId).trim();
    if (!id || !/^\d+$/.test(id)) throw new Error(`Invalid GOG product ID: ${String(productId)}`);

    const normalizedAction =
      action === 'run' || action === 'install' || action === 'open' || action === 'uninstall'
        ? action
        : 'open';

    if (normalizedAction === 'run' || normalizedAction === 'open') {
      try {
        const launchedLocally = await this.#launchInstalledGameExecutable(id);
        if (launchedLocally) {
          return { ok: true, url: `local-exe://${encodeURIComponent(id)}` };
        }
      } catch {
        // ignore local launch failures and continue with protocol URLs
      }
    }

    if (normalizedAction === 'uninstall') {
      try {
        const uninstalledLocally = await this.#launchInstalledGameUninstaller(id);
        if (uninstalledLocally) {
          return { ok: true, url: `local-uninstall://${encodeURIComponent(id)}` };
        }
      } catch {
        // continue to protocol URL fallback
      }
    }

    const schemeCandidatesByAction = {
      open: [
        `goggalaxy://openGameView/${encodeURIComponent(id)}`,
        `goggalaxy://runGame/${encodeURIComponent(id)}`,
        `goggalaxy://launchGame/${encodeURIComponent(id)}`,
      ],
      run: [
        `goggalaxy://runGame/${encodeURIComponent(id)}`,
        `goggalaxy://launchGame/${encodeURIComponent(id)}`,
        `goggalaxy://openGameView/${encodeURIComponent(id)}`,
      ],
      install: [
        `goggalaxy://installGame/${encodeURIComponent(id)}`,
      ],
      uninstall: [
        `goggalaxy://uninstallGame/${encodeURIComponent(id)}`,
        `goggalaxy://uninstallGameById/${encodeURIComponent(id)}`,
      ],
    };

    const schemeCandidates = schemeCandidatesByAction[normalizedAction] || schemeCandidatesByAction.open;
    let lastError = null;

    for (const url of schemeCandidates) {
      try {
        await shell.openExternal(url);
        return { ok: true, url };
      } catch (err) {
        lastError = err;
      }
    }

    const lastMessage = lastError instanceof Error ? lastError.message : String(lastError || 'Unknown error');
    throw new Error(`Failed to open GOG game ${id} (${normalizedAction}): ${lastMessage}`);
  }
}

module.exports = GogController;
