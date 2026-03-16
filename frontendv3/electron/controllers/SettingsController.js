// @ts-check

const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

class SettingsController {
  /** @type {string} */
  #userDataDir;

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
  }

  /**
   * Get default settings
   * @returns {any}
   */
  #getDefaultSettings() {
    const username = os.userInfo().username || 'user';
    const defaultDownloadPath = path.join(os.homedir(), 'Downloads', 'WreckLauncher');

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
        concurrent: 3,
      },
      account: {
        platforms: {
          steam: { connected: false, username: '', profileLink: '' },
          gog: { connected: false, username: '' },
          epic: { connected: false, username: '' },
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
   * Load settings from file or return defaults
   * @returns {Promise<any>}
   */
  async getSettings() {
    const settingsPath = this.#getSettingsPath();

    try {
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf-8');
        const parsed = JSON.parse(data);
        
        // Merge with defaults to ensure all fields exist
        const defaults = this.#getDefaultSettings();
        return this.#mergeSettings(defaults, parsed);
      }
    } catch (err) {
      console.error('[SettingsController] Failed to load settings:', err);
    }

    // Return defaults if file doesn't exist or parsing fails
    return this.#getDefaultSettings();
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
    
    for (const key in loaded) {
      if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
        result[key] = this.#mergeSettings(defaults[key], loaded[key]);
      } else {
        result[key] = loaded[key];
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
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
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

    settings[category][key] = value;
    await this.#saveSettings(settings);

    return settings;
  }

  /**
   * Update multiple settings at once
   * @param {any} newSettings - Partial settings object to merge
   * @returns {Promise<any>}
   */
  async updateSettings(newSettings) {
    const current = await this.getSettings();
    const merged = this.#mergeSettings(current, newSettings);
    
    await this.#saveSettings(merged);
    return merged;
  }

  /**
   * Reset settings to defaults
   * @returns {Promise<any>}
   */
  async resetToDefaults() {
    const defaults = this.#getDefaultSettings();
    await this.#saveSettings(defaults);
    return defaults;
  }

  /**
   * Clear cache (placeholder for future cache management)
   * @returns {Promise<void>}
   */
  async clearCache() {
    // TODO: Implement cache clearing logic
    // For now, just log the action
    console.log('[SettingsController] Cache clear requested (not yet implemented)');
  }

  /**
   * Update platform connection status
   * @param {string} platform - 'steam', 'gog', 'epic', 'itch'
   * @param {boolean} connected
   * @param {string} username
   * @returns {Promise<any>}
   */
  async updatePlatformConnection(platform, connected, username = '') {
    const settings = await this.getSettings();

    if (!settings.account.platforms[platform]) {
      throw new Error(`Invalid platform: ${platform}`);
    }

    settings.account.platforms[platform] = { connected, username };
    await this.#saveSettings(settings);

    return settings;
  }
}

module.exports = SettingsController;
