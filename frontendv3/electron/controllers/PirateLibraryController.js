'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { app, dialog, shell } = require('electron');

class PirateLibraryController {
  /** @type {string} */
  #userDataDir;

  constructor() {
    const candidates = [];

    try {
      if (app && typeof app.getPath === 'function') {
        candidates.push(path.join(app.getPath('userData')));
      }
    } catch {
      // Ignore and continue with fallback candidates.
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
        // Try next candidate.
      }
    }

    if (!selected) {
      throw new Error('Unable to initialize writable pirate library directory');
    }

    this.#userDataDir = selected;
  }

  /**
   * @returns {string}
   */
  #getLibraryPath() {
    return path.join(this.#userDataDir, 'pirate-library.json');
  }

  /**
   * @param {any} value
   * @returns {string}
   */
  #normalizePathKey(value) {
    return path.resolve(String(value || '').trim()).toLowerCase();
  }

  /**
   * @param {string} executablePath
   * @returns {Promise<string|null>}
   */
  async #resolveExecutableIconDataUrl(executablePath) {
    const rawPath = String(executablePath || '').trim();
    if (!rawPath) return null;

    const resolvedPath = path.resolve(rawPath);
    if (!fs.existsSync(resolvedPath)) return null;

    if (!app || typeof app.getFileIcon !== 'function') return null;

    try {
      const icon = await app.getFileIcon(resolvedPath, { size: 'large' });
      if (!icon || typeof icon.isEmpty !== 'function' || icon.isEmpty()) return null;
      const dataUrl = typeof icon.toDataURL === 'function' ? icon.toDataURL() : '';
      return typeof dataUrl === 'string' && dataUrl.startsWith('data:image/') ? dataUrl : null;
    } catch {
      return null;
    }
  }

  /**
   * @param {any} entry
   * @returns {any|null}
   */
  #normalizeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;

    const id = String(entry.id || '').trim();
    const executablePath = String(entry.executablePath || entry.path || '').trim();
    const title = String(entry.title || '').trim();
    if (!id || !executablePath || !title) return null;

    const installLocation = String(entry.installLocation || path.dirname(executablePath) || '').trim();

    return {
      id,
      title,
      executablePath,
      installLocation,
      coverUrl: typeof entry.coverUrl === 'string' && entry.coverUrl.trim() ? entry.coverUrl.trim() : null,
      createdAt: String(entry.createdAt || '').trim() || null,
      updatedAt: String(entry.updatedAt || '').trim() || null,
    };
  }

  /**
   * @returns {any[]}
   */
  #readEntries() {
    const libraryPath = this.#getLibraryPath();
    if (!fs.existsSync(libraryPath)) return [];

    try {
      const raw = fs.readFileSync(libraryPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed
        .map((entry) => this.#normalizeEntry(entry))
        .filter((entry) => !!entry);
    } catch (error) {
      console.warn('Failed to parse pirate library file:', error);
      return [];
    }
  }

  /**
   * @param {any[]} entries
   */
  #writeEntries(entries) {
    const libraryPath = this.#getLibraryPath();
    fs.writeFileSync(libraryPath, JSON.stringify(entries, null, 2), 'utf8');
  }

  /**
   * @returns {Promise<any[]>}
   */
  async getGames() {
    const entries = this.#readEntries();

    let changed = false;
    const nowIso = new Date().toISOString();
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const hasCover = typeof entry.coverUrl === 'string' && entry.coverUrl.trim();
      if (hasCover) continue;

      const executablePath = String(entry.executablePath || '').trim();
      if (!executablePath) continue;

      const iconDataUrl = await this.#resolveExecutableIconDataUrl(executablePath);
      if (!iconDataUrl) continue;

      entry.coverUrl = iconDataUrl;
      entry.updatedAt = nowIso;
      changed = true;
    }

    if (changed) {
      this.#writeEntries(entries);
    }

    entries.sort((left, right) => String(left?.title || '').localeCompare(String(right?.title || '')));
    return entries;
  }

  /**
   * @param {string} executablePath
   * @returns {Promise<any>}
   */
  async addGameFromExecutablePath(executablePath) {
    const rawPath = String(executablePath || '').trim();
    if (!rawPath) throw new Error('Executable path is required');

    const resolvedExecutablePath = path.resolve(rawPath);
    if (!/\.exe$/i.test(resolvedExecutablePath)) {
      throw new Error('Please select an .exe file');
    }

    if (!fs.existsSync(resolvedExecutablePath)) {
      throw new Error('Selected executable does not exist');
    }

    const stat = fs.statSync(resolvedExecutablePath);
    if (!stat.isFile()) {
      throw new Error('Selected executable path is not a file');
    }

    const title = path.basename(resolvedExecutablePath, path.extname(resolvedExecutablePath)).trim() || path.basename(resolvedExecutablePath);
    const installLocation = path.dirname(resolvedExecutablePath);
    const iconDataUrl = await this.#resolveExecutableIconDataUrl(resolvedExecutablePath);
    const nowIso = new Date().toISOString();

    const entries = this.#readEntries();
    const executablePathKey = this.#normalizePathKey(resolvedExecutablePath);
    const existingIndex = entries.findIndex((entry) => this.#normalizePathKey(entry?.executablePath) === executablePathKey);

    if (existingIndex >= 0) {
      const existing = entries[existingIndex];
      const updated = {
        ...existing,
        title,
        executablePath: resolvedExecutablePath,
        installLocation,
        coverUrl: iconDataUrl || existing?.coverUrl || null,
        updatedAt: nowIso,
      };
      entries[existingIndex] = updated;
      this.#writeEntries(entries);
      return updated;
    }

    const idHash = crypto.createHash('sha1').update(executablePathKey).digest('hex').slice(0, 16);
    const entry = {
      id: `pirate-${idHash}`,
      title,
      executablePath: resolvedExecutablePath,
      installLocation,
      coverUrl: iconDataUrl || null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    entries.push(entry);
    this.#writeEntries(entries);
    return entry;
  }

  /**
   * @param {import('electron').BaseWindow|null|undefined} ownerWindow
   * @returns {Promise<any|null>}
   */
  async addGameFromDialog(ownerWindow = null) {
    const result = await dialog.showOpenDialog(ownerWindow || undefined, {
      title: 'Select pirate game executable',
      properties: ['openFile'],
      filters: [
        { name: 'Executable Files', extensions: ['exe'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !Array.isArray(result.filePaths) || result.filePaths.length < 1) {
      return null;
    }

    return await this.addGameFromExecutablePath(result.filePaths[0]);
  }

  /**
   * @param {string} id
   * @returns {Promise<{ removed: boolean }>}
   */
  async removeGame(id) {
    const normalizedId = String(id || '').trim();
    if (!normalizedId) throw new Error('Pirate game id is required');

    const entries = this.#readEntries();
    const nextEntries = entries.filter((entry) => String(entry?.id || '').trim() !== normalizedId);

    if (nextEntries.length === entries.length) {
      return { removed: false };
    }

    this.#writeEntries(nextEntries);
    return { removed: true };
  }

  /**
   * @param {string} executablePath
   * @returns {Promise<{ ok: boolean, path: string }>}
   */
  async runGame(executablePath) {
    const rawPath = String(executablePath || '').trim();
    if (!rawPath) throw new Error('Executable path is required');

    const resolvedExecutablePath = path.resolve(rawPath);
    if (!fs.existsSync(resolvedExecutablePath)) {
      throw new Error('Executable file was not found on disk');
    }

    const stat = fs.statSync(resolvedExecutablePath);
    if (!stat.isFile()) {
      throw new Error('Executable path is not a file');
    }

    const openError = await shell.openPath(resolvedExecutablePath);
    if (openError) {
      throw new Error(`Failed to run executable: ${openError}`);
    }

    return { ok: true, path: resolvedExecutablePath };
  }
}

module.exports = PirateLibraryController;
