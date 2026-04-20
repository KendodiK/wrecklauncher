// @ts-check

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { app } = require('electron');

class SettingsController {
  /** @type {string} */
  #userDataDir;

  /** @type {string[]} */
  #settingsCandidatePaths;

  /** @type {string} */
  #cachedSettingsHash;

  /** @type {string} */
  #cachedSettingsOrigin;

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
      throw new Error('Unable to initialize writable settings directory');
    }

    this.#userDataDir = selected;
    this.#settingsCandidatePaths = Array.from(
      new Set(candidates.map((dir) => path.join(dir, 'settings.json')))
    );
    this.#cachedSettingsHash = '';
    this.#cachedSettingsOrigin = '';

    const primarySettingsPath = this.#getSettingsPath();
    const backupSettingsPaths = this.#getBackupSettingsPaths(primarySettingsPath);
    console.info('[SettingsController] Primary settings file:', primarySettingsPath);
    if (backupSettingsPaths.length > 0) {
      console.info('[SettingsController] Backup settings files:', backupSettingsPaths);
    }
  }

  /**
   * @param {any} value
   * @returns {string|null}
   */
  #normalizeCountryCode(value) {
    const raw = String(value || '').trim().toUpperCase();
    return /^[A-Z]{2}$/.test(raw) ? raw : null;
  }

  /**
   * @returns {string}
   */
  #inferCountryCodeFromLocale() {
    const localeCandidates = [];

    try {
      const resolved = Intl?.DateTimeFormat?.().resolvedOptions?.().locale;
      if (resolved) localeCandidates.push(resolved);
    } catch {
      // ignore
    }

    if (typeof process?.env?.LC_ALL === 'string' && process.env.LC_ALL.trim()) {
      localeCandidates.push(process.env.LC_ALL);
    }
    if (typeof process?.env?.LANG === 'string' && process.env.LANG.trim()) {
      localeCandidates.push(process.env.LANG);
    }

    for (const locale of localeCandidates) {
      const match = String(locale).match(/[-_](?<cc>[A-Za-z]{2})\b/);
      const code = this.#normalizeCountryCode(match?.groups?.cc || match?.[1]);
      if (code) return code;
    }

    return 'DE';
  }

  /**
   * Get default settings
   * @returns {any}
   */
  #getDefaultSettings() {
    const defaultDownloadPath = path.join(os.homedir(), 'Downloads', 'WreckLauncher');
    const defaultPirateTorrentPath = path.join(defaultDownloadPath, 'Pirate Torrents');
    const defaultCountryCode = this.#inferCountryCodeFromLocale();

    return {
      display: {
        theme: 'dark',
        language: 'en',
        uiScale: 100,
        animations: true,
      },
      library: {
        autoRefreshHours: 24,
        viewMode: 'carousel',
        gamesPerPage: 20,
      },
      downloads: {
        path: defaultDownloadPath,
        pirateTorrentsPath: defaultPirateTorrentPath,
        concurrent: 3,
      },
      store: {
        countryCode: defaultCountryCode,
      },
      account: {
        profile: {
          bio: '',
          avatarUrl: '',
        },
        platforms: {
          steam: { connected: false, username: '', profileLink: '' },
          gog: { connected: false, username: '' },
          itch: { connected: false, username: '' },
        },
        syncFrequencyHours: 6,
      },
    };
  }

  /**
   * Get settings file path (global settings for now)
   * @returns {string}
   */
  #getSettingsPath() {
    return path.join(this.#userDataDir, 'settings.json');
  }

  /**
   * @param {string} [primaryPath]
   * @returns {string[]}
   */
  #getBackupSettingsPaths(primaryPath = this.#getSettingsPath()) {
    const normalizedPrimaryPath = path.resolve(String(primaryPath || this.#getSettingsPath()));
    return (Array.isArray(this.#settingsCandidatePaths) ? this.#settingsCandidatePaths : [])
      .map((candidate) => path.resolve(candidate))
      .filter((candidate) => candidate && candidate !== normalizedPrimaryPath);
  }

  /**
   * @param {any} settings
   * @returns {string}
   */
  #settingsHash(settings) {
    try {
      const payload = JSON.stringify(settings ?? null);
      return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 12);
    } catch {
      return '';
    }
  }

  /**
   * @param {any} settings
   * @param {string} origin
   * @returns {void}
   */
  #trackSettingsCache(settings, origin) {
    const nextHash = this.#settingsHash(settings);
    const nextOrigin = String(origin || 'unknown');
    if (!nextHash) return;

    if (!this.#cachedSettingsHash) {
      this.#cachedSettingsHash = nextHash;
      this.#cachedSettingsOrigin = nextOrigin;
      console.info('[SettingsController] Settings cache initialized', {
        origin: nextOrigin,
        hash: nextHash,
      });
      return;
    }

    if (this.#cachedSettingsHash !== nextHash) {
      const previousHash = this.#cachedSettingsHash;
      const previousOrigin = this.#cachedSettingsOrigin;
      this.#cachedSettingsHash = nextHash;
      this.#cachedSettingsOrigin = nextOrigin;
      console.info('[SettingsController] Settings cache changed', {
        from: previousOrigin,
        to: nextOrigin,
        previousHash,
        nextHash,
      });
    }
  }

  /**
   * @param {any} parsed
   * @param {any} defaults
   * @returns {any}
   */
  #normalizeLoadedSettings(parsed, defaults) {
    const sanitizedLoaded = this.#stripVolatilePlatformSettings(parsed);

    // Merge with defaults to ensure all fields exist.
    const merged = this.#mergeSettings(defaults, sanitizedLoaded);

    // Migrate older settings files where country code lived outside `store.countryCode`.
    const hasStoreCountry = this.#normalizeCountryCode(parsed?.store?.countryCode);
    if (!hasStoreCountry) {
      const legacyCountry =
        this.#normalizeCountryCode(parsed?.display?.countryCode)
        || this.#normalizeCountryCode(parsed?.account?.countryCode);
      if (legacyCountry) {
        merged.store = {
          ...(merged.store || {}),
          countryCode: legacyCountry,
        };
      }
    }

    const normalizedStoreCountryCode =
      this.#normalizeCountryCode(merged?.store?.countryCode)
      || this.#inferCountryCodeFromLocale();
    merged.store = {
      ...(merged.store || {}),
      countryCode: normalizedStoreCountryCode,
    };

    return merged;
  }

  /**
   * @param {string} settingsPath
   * @param {any} defaults
   * @returns {any|null}
   */
  #loadSettingsFromPath(settingsPath, defaults) {
    if (!fs.existsSync(settingsPath)) return null;
    const data = fs.readFileSync(settingsPath, 'utf-8');
    const parsed = JSON.parse(data);
    return this.#normalizeLoadedSettings(parsed, defaults);
  }

  /**
   * Platform link records are backend-owned and should not be persisted in local settings.
   * @param {any} settings
   * @returns {any}
   */
  #stripVolatilePlatformSettings(settings) {
    if (typeof settings !== 'object' || settings === null) return settings;

    const next = { ...settings };
    if (typeof next.account === 'object' && next.account !== null) {
      next.account = { ...next.account };
      delete next.account.platforms;
    }

    return next;
  }

  /**
   * Load settings from file or return defaults
   * @returns {Promise<any>}
   */
  async getSettings() {
    const settingsPath = this.#getSettingsPath();
    const defaults = this.#getDefaultSettings();

    try {
      const primary = this.#loadSettingsFromPath(settingsPath, defaults);
      if (primary) {
        this.#trackSettingsCache(primary, `primary:${settingsPath}`);
        return primary;
      }
    } catch (err) {
      console.error(`[SettingsController] Failed to load primary settings (${settingsPath}):`, err);
    }

    const backupPaths = this.#getBackupSettingsPaths(settingsPath);
    for (const backupPath of backupPaths) {
      try {
        const backup = this.#loadSettingsFromPath(backupPath, defaults);
        if (!backup) continue;
        console.warn(`[SettingsController] Loaded settings from backup file: ${backupPath}`);
        this.#trackSettingsCache(backup, `backup:${backupPath}`);
        return backup;
      } catch (err) {
        console.warn(`[SettingsController] Failed to load backup settings (${backupPath}):`, err);
      }
    }

    // Return defaults if file doesn't exist or parsing fails
    console.warn(`[SettingsController] Falling back to defaults; no readable settings file found. Primary path: ${settingsPath}`);
    this.#trackSettingsCache(defaults, `defaults:${settingsPath}`);
    return defaults;
  }

  /**
   * Deep merge settings objects
   * @param {any} defaults
   * @param {any} loaded
   * @returns {any}
   */
  #mergeSettings(defaults, loaded) {
    if (typeof defaults !== 'object' || defaults === null) return defaults;
    if (typeof loaded !== 'object' || loaded === null) return defaults;

    const result = { ...defaults };
    const loadedKeys = Object.keys(loaded);
    for (const key of loadedKeys) {
      if (!(key in defaults)) {
        result[key] = loaded[key];
      }
    }

    for (const key of Object.keys(defaults)) {
      const defaultValue = defaults[key];
      const incomingValue = loaded[key];

      if (incomingValue === undefined) {
        result[key] = defaultValue;
        continue;
      }

      if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
        result[key] = this.#mergeSettings(defaultValue, incomingValue);
      } else {
        result[key] = incomingValue;
      }
    }

    return result;
  }

  /**
   * Save settings to file
   * @param {any} settings
   * @returns {Promise<void>}
   */
  async #saveSettings(settings) {
    const settingsPath = this.#getSettingsPath();
    
    try {
      const sanitized = this.#stripVolatilePlatformSettings(settings);
      fs.writeFileSync(settingsPath, JSON.stringify(sanitized, null, 2), 'utf-8');
    } catch (err) {
      console.error('[SettingsController] Failed to save settings:', err);
      throw new Error('Failed to save settings');
    }
  }

  /**
   * Update a single setting value
   * @param {string} category - e.g., 'display', 'library', 'downloads', 'account'
   * @param {string} key - e.g., 'theme', 'language'
   * @param {any} value - The new value
   * @returns {Promise<any>}
   */
  async updateSetting(category, key, value) {
    const settings = await this.getSettings();

    if (!settings[category]) {
      throw new Error(`Invalid settings category: ${category}`);
    }

    if (category === 'store' && key === 'countryCode') {
      settings[category][key] = this.#normalizeCountryCode(value) || this.#inferCountryCodeFromLocale();
    } else {
      settings[category][key] = value;
    }
    await this.#saveSettings(settings);
    this.#trackSettingsCache(settings, `updateSetting:${String(category)}.${String(key)}`);

    return settings;
  }

  /**
   * Update multiple settings at once
   * @param {any} newSettings - Partial settings object to merge
   * @returns {Promise<any>}
   */
  async updateSettings(newSettings) {
    const current = await this.getSettings();
    /** @type {any} */
    let normalizedIncoming =
      (newSettings && typeof newSettings === 'object')
        ? { ...newSettings }
        : newSettings;

    if (
      normalizedIncoming
      && typeof normalizedIncoming === 'object'
      && normalizedIncoming.store
      && typeof normalizedIncoming.store === 'object'
      && Object.prototype.hasOwnProperty.call(normalizedIncoming.store, 'countryCode')
    ) {
      normalizedIncoming = {
        ...normalizedIncoming,
        store: {
          ...normalizedIncoming.store,
          countryCode:
            this.#normalizeCountryCode(normalizedIncoming.store.countryCode)
            || this.#inferCountryCodeFromLocale(),
        },
      };
    }

    const merged = this.#mergeSettings(current, normalizedIncoming);

    const normalizedStoreCountryCode =
      this.#normalizeCountryCode(merged?.store?.countryCode)
      || this.#inferCountryCodeFromLocale();
    merged.store = {
      ...(merged.store || {}),
      countryCode: normalizedStoreCountryCode,
    };
    
    await this.#saveSettings(merged);
    this.#trackSettingsCache(merged, 'updateSettings');
    return merged;
  }

  /**
   * Reset settings to defaults
   * @returns {Promise<any>}
   */
  async resetToDefaults() {
    const defaults = this.#getDefaultSettings();
    await this.#saveSettings(defaults);
    this.#trackSettingsCache(defaults, 'resetToDefaults');
    return defaults;
  }

  /**
   * Clear cache (placeholder for future cache management)
   * @returns {Promise<void>}
   */
  async clearCache() {
    this.#cachedSettingsHash = '';
    this.#cachedSettingsOrigin = '';
    console.log('[SettingsController] Settings cache cleared');
  }

  /**
    * Update platform connection status
    * @param {string} platform - 'steam', 'gog', 'itch'
   * @param {boolean} connected
   * @param {string} username
   * @returns {Promise<any>}
   */
  async updatePlatformConnection(platform, connected, username = '') {
    // Backward-compatible IPC no-op: platform link data is fetched from backend per request.
    const settings = await this.getSettings();
    return settings;
  }
}

module.exports = SettingsController;
