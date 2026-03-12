// @ts-check

const fs = require('fs');
const path = require('path');
const { shell } = require('electron');
const GamesController = require('./GamesController');
const { joinUrl, normalizeBaseUrl } = require('../lib/url');
const { fetchJsonSafe } = require('../lib/http');

class ItchioController extends GamesController {
  /** @type {string} */
  #serverUrl;

  /**
   * @param {{ serverUrl: string }|undefined} [cfg]
   */
  constructor(cfg) {
    const serverUrl = cfg?.serverUrl || process.env.WRECK_BACKEND_URL || 'http://127.0.0.1:3000';
    super({ serverUrl });
    this.#serverUrl = normalizeBaseUrl(serverUrl, { defaultProtocol: 'http:' });
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

    const url = joinUrl(this.#serverUrl, 'api', 'itch', 'game', String(id));
    const { ok, status, json } = await fetchJsonSafe(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`,
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
      gameId: typeof json.gameId === 'number' ? json.gameId : id,
      title: typeof json.title === 'string' ? json.title : `itch:${id}`,
      coverUrl: json.coverUrl ?? null,
      shortText: json.shortText ?? null,
      minPrice: typeof json.minPrice === 'number' ? json.minPrice : 0,
      url: json.url ?? null,
      raw: json,
    };
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
