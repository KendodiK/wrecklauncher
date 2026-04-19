// @ts-check

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { app } = require('electron');

class TorrentStateCacheController {
  /** @type {string} */
  #cachePath;

  constructor() {
    const candidates = [];

    try {
      if (app && typeof app.getPath === 'function') {
        candidates.push(path.join(app.getPath('userData')));
      }
    } catch {
      // ignore and fall back
    }

    candidates.push(path.join(__dirname, '..', '..', 'user-data'));
    candidates.push(path.join(os.homedir(), '.wrecklauncher'));

    let selected = null;
    for (const dir of candidates) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.accessSync(dir, fs.constants.W_OK);
        selected = dir;
        break;
      } catch {
        // try next candidate
      }
    }

    if (!selected) {
      throw new Error('Unable to initialize writable torrent cache directory');
    }

    this.#cachePath = path.join(selected, 'torrent-state-cache.json');
  }

  /**
   * @param {any} key
   * @returns {string}
   */
  #normalizeKey(key) {
    return String(key || '').trim().toLowerCase();
  }

  /**
   * @returns {{ entries: Record<string, { value?: any, updatedAt?: number }>, updatedAt?: string }}
   */
  #readFile() {
    try {
      if (!fs.existsSync(this.#cachePath)) {
        return { entries: {} };
      }

      const raw = String(fs.readFileSync(this.#cachePath, 'utf8') || '').trim();
      if (!raw) {
        return { entries: {} };
      }

      const parsed = JSON.parse(raw);
      const entries = (parsed && typeof parsed.entries === 'object' && parsed.entries !== null)
        ? parsed.entries
        : {};

      return {
        entries,
        updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : undefined,
      };
    } catch (err) {
      console.warn('[torrent-cache] Failed to read cache file:', err);
      return { entries: {} };
    }
  }

  /**
   * @param {{ entries: Record<string, { value?: any, updatedAt?: number }>, updatedAt?: string }} payload
   * @returns {boolean}
   */
  #writeFile(payload) {
    try {
      fs.mkdirSync(path.dirname(this.#cachePath), { recursive: true });
      fs.writeFileSync(
        this.#cachePath,
        JSON.stringify({
          entries: payload?.entries && typeof payload.entries === 'object' ? payload.entries : {},
          updatedAt: typeof payload?.updatedAt === 'string' ? payload.updatedAt : new Date().toISOString(),
        }, null, 2),
        'utf8',
      );
      return true;
    } catch (err) {
      console.warn('[torrent-cache] Failed to write cache file:', err);
      return false;
    }
  }

  /**
   * @param {any} keyRaw
   * @returns {{ value: any, updatedAt: number }|null}
   */
  get(keyRaw) {
    const key = this.#normalizeKey(keyRaw);
    if (!key) return null;

    const cacheFile = this.#readFile();
    const entry = cacheFile.entries?.[key];
    if (!entry || typeof entry !== 'object') return null;

    return {
      value: Object.prototype.hasOwnProperty.call(entry, 'value') ? entry.value : null,
      updatedAt: Number(entry.updatedAt) || 0,
    };
  }

  /**
   * @param {any} keyRaw
   * @param {any} value
   * @returns {boolean}
   */
  set(keyRaw, value) {
    const key = this.#normalizeKey(keyRaw);
    if (!key) return false;

    const cacheFile = this.#readFile();
    const entries = cacheFile.entries && typeof cacheFile.entries === 'object'
      ? cacheFile.entries
      : {};

    entries[key] = {
      value: (typeof value === 'undefined') ? null : value,
      updatedAt: Date.now(),
    };

    return this.#writeFile({
      entries,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * @param {any} keyRaw
   * @returns {boolean}
   */
  invalidate(keyRaw) {
    const key = this.#normalizeKey(keyRaw);
    const cacheFile = this.#readFile();
    const entries = cacheFile.entries && typeof cacheFile.entries === 'object'
      ? cacheFile.entries
      : {};

    if (!key) {
      return this.#writeFile({ entries: {}, updatedAt: new Date().toISOString() });
    }

    if (!(key in entries)) return true;

    delete entries[key];
    return this.#writeFile({ entries, updatedAt: new Date().toISOString() });
  }
}

module.exports = TorrentStateCacheController;
