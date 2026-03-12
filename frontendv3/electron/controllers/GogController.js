// @ts-check

const { execFile } = require('child_process');
const https = require('https');
const { shell } = require('electron');
const GamesController = require('./GamesController');

class GogController extends GamesController {
  /**
   * @param {{ serverUrl: string }} cfg
   */
  constructor(cfg) {
    if (!cfg?.serverUrl) {
      throw new Error('GogController requires serverUrl from main.js');
    }

    super({
      serverUrl: cfg.serverUrl,
    });
  }

  static #agent = new https.Agent({
    keepAlive: true,
    maxSockets: 2,
    timeout: 20_000,
  });

  /** @param {number} ms */
  static #sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * @param {string} url
   * @param {{ timeoutMs?: number, maxBodyBytes?: number }} [opts]
   * @returns {Promise<{ statusCode: number, body: string }>}
   */
  static #httpsGetText(url, opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 10_000;
    const maxBodyBytes = opts.maxBodyBytes ?? 8 * 1024 * 1024;

    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const req = https.request(
        {
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port || 443,
          path: u.pathname + u.search,
          method: 'GET',
          agent: GogController.#agent,
          headers: {
            'Accept': 'application/json',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive',
            'User-Agent': 'WreckLauncher/1.0',
          },
        },
        (res) => {
          /** @type {Buffer[]} */
          const chunks = [];
          let totalBytes = 0;
          res.on('data', (chunk) => {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            totalBytes += buf.length;
            if (totalBytes > maxBodyBytes) {
              req.destroy();
              reject(new Error(`GOG API response too large (> ${maxBodyBytes} bytes)`));
              return;
            }
            chunks.push(buf);
          });
          res.on('end', () => resolve({ statusCode: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
        }
      );
      req.on('error', (e) => reject(e instanceof Error ? e : new Error(String(e))));
      req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('GOG API request timed out')); });
      req.end();
    });
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

    /** @type {import('../models').GogInstalledGame[]} */
    const results = [];

    for (const key of [baseKey, baseKey64]) {
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

        const gameName = vals.get('GAMENAME') || vals.get('GameName') || null;
        if (!gameName && !vals.get('EXEFILE')) continue; // skip non-game entries

        const productId = vals.get('PRODUCTID') || vals.get('productID') || subKey.split('\\').pop() || null;
        const installPath = vals.get('INSTALLPATH') || vals.get('Path') || null;
        const launchCommand = vals.get('LAUNCHCOMMAND') || vals.get('LaunchCommand') || vals.get('EXEFILE') || null;
        const version = vals.get('VERSIONGAMESCANNER') || vals.get('ver') || null;
        const buildId = vals.get('BUILDID') || null;

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
   * Fetch game details from the GOG public API (no auth required).
   * Endpoint: https://api.gog.com/products/{productId}?expand=description,screenshots,videos,related_products,changelog
   *
   * @param {string} token  Wreck auth token for backend upload.
   * @param {string|number} productId  GOG product ID.
   * @returns {Promise<import('../models').GogGameDetails|null>}
   */
  async getGameDetails(token, productId) {
    const id = String(productId).trim();
    if (!id || !/^\d+$/.test(id)) throw new Error(`Invalid GOG product ID: ${String(productId)}`);

    const retries = 3;
    const retryDelay = 700;

    const attempt = async (/** @type {number} */ tryNum) => {
      const url = `https://api.gog.com/products/${encodeURIComponent(id)}?expand=description,screenshots`;
      const { statusCode, body } = await GogController.#httpsGetText(url);

      if (statusCode === 429) {
        if (tryNum < retries) {
          await GogController.#sleep(retryDelay * tryNum);
          return attempt(tryNum + 1);
        }
        throw new Error(`GOG API rate limited (HTTP 429)`);
      }

      // 404 = product not found (may be a DLC or regional restriction)
      if (statusCode === 404) return null;

      if (statusCode < 200 || statusCode >= 300) {
        throw new Error(`GOG API error: HTTP ${statusCode}`);
      }

      let data;
      try {
        data = JSON.parse(body);
      } catch {
        throw new Error('GOG API returned non-JSON body');
      }

      if (!data || typeof data !== 'object') return null;

      const title = typeof data.title === 'string' ? data.title.trim() : `gog:${id}`;
      const backgroundImg = data.images?.background ? String(data.images.background).replace(/^\/\//, 'https://') : null;
      const logoImg = data.images?.logo ? String(data.images.logo).replace(/^\/\//, 'https://') : null;
      const bannerImg = backgroundImg || logoImg;
      const leadDesc = data.description?.lead ? String(data.description.lead) : null;
      const fullDesc = data.description?.full ? String(data.description.full) : null;
      const description = leadDesc || fullDesc;

      // Price: data.price.final is a string like "9.99" in USD
      let cost = null;
      if (data.price?.final !== undefined && data.price.final !== null) {
        const parsed = parseFloat(String(data.price.final));
        if (Number.isFinite(parsed)) cost = parsed;
      }

      // Genres
      const genreNames = Array.isArray(data.genres)
        ? data.genres.map((/** @type {any} */ g) => typeof g === 'string' ? g : (typeof g?.name === 'string' ? g.name : null)).filter(Boolean)
        : [];

      /** @type {import('../models').GogGameDetails} */
      const details = {
        productId: id,
        title,
        bannerImg,
        description,
        cost,
        genreNames,
        raw: data,
      };

      // Upload to backend
      try {
        const uploadResult = await super.uploadGame(token, {
          app_id: id,
          platform_name: 'gog',
          name: title,
          banner_img: bannerImg || '',
          description,
          cost,
          genre_names: genreNames,
        });

        if (!uploadResult.ok) {
          if (uploadResult.statusCode === 401) {
            const msg = uploadResult.rawText || uploadResult.response?.error || 'Unauthorized';
            const e = new Error(`Unauthorized (token invalid/expired): ${String(msg).slice(0, 300)}`);
            // @ts-ignore
            e.code = 'WRECK_INVALID_TOKEN';
            throw e;
          }
          if (uploadResult.statusCode !== 400) {
            const msg = uploadResult.rawText || uploadResult.response?.error || 'Unknown error';
            throw new Error(`Game upload failed (HTTP ${uploadResult.statusCode}): ${String(msg).slice(0, 300)}`);
          }
        }
      } catch (err) {
        if (err && typeof err === 'object' && /** @type {any} */ (err).code === 'WRECK_INVALID_TOKEN') throw err;
        console.error(`[GogController] Failed to upload GOG game ${id}: ${err instanceof Error ? err.message : String(err)}`);
      }

      return details;
    };

    return attempt(1);
  }

  /**
   * Open GOG Galaxy for a game action via URL scheme.
   * Known GOG Galaxy protocol handlers:
   *   goggalaxy://openGameView/{productId}
   *   goggalaxy://runGame/{productId}
   *   goggalaxy://installGame/{productId}
   *   goggalaxy://openStoreUrl/{url}
   *
   * @param {string|number} productId  GOG numeric product ID
   * @param {'open'|'run'|'install'} action
   * @returns {Promise<{ ok: boolean, url: string }>}
   */
  async clientGameControlUtil(productId, action) {
    const id = String(productId).trim();
    if (!id || !/^\d+$/.test(id)) throw new Error(`Invalid GOG product ID: ${String(productId)}`);

    const schemeMap = {
      open: `goggalaxy://openGameView/${encodeURIComponent(id)}`,
      run: `goggalaxy://runGame/${encodeURIComponent(id)}`,
      install: `goggalaxy://installGame/${encodeURIComponent(id)}`,
    };

    const url = schemeMap[action] || schemeMap.open;

    try {
      await shell.openExternal(url);
      return { ok: true, url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to open GOG Galaxy URL (${url}): ${msg}`);
    }
  }
}

module.exports = GogController;
