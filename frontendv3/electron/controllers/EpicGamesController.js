// @ts-check

const fs = require('fs');
const path = require('path');

class EpicGamesController {
  /**
   * @returns {string}
   */
  static getManifestsDir() {
    const programData = process.env.ProgramData || path.join(process.env.SystemDrive || 'C:', 'ProgramData');
    return path.join(programData, 'Epic', 'EpicGamesLauncher', 'Data', 'Manifests');
  }

  /**
   * @param {string} filePath
   * @param {any} root
   * @returns {import('../models').EpicInstalledGame|null}
   */
  static #tryParseItem(filePath, root) {
    if (!root || typeof root !== 'object') return null;

    const appName = typeof root.AppName === 'string' ? root.AppName : null;
    const displayName = typeof root.DisplayName === 'string' ? root.DisplayName : null;
    const installLocation = typeof root.InstallLocation === 'string' ? root.InstallLocation : null;
    const namespaceId = typeof root.Namespace === 'string' ? root.Namespace : null;
    const catalogItemId = typeof root.CatalogItemId === 'string' ? root.CatalogItemId : null;
    const artifactId = typeof root.ArtifactId === 'string' ? root.ArtifactId : null;
    const itemId = typeof root.ItemId === 'string' ? root.ItemId : null;
    const appVersionString = typeof root.AppVersionString === 'string' ? root.AppVersionString : null;
    const installSize = typeof root.InstallSize === 'number' && Number.isFinite(root.InstallSize) ? root.InstallSize : null;

    if (!appName && !displayName) return null;

    return {
      manifestPath: filePath,
      appName,
      displayName,
      installLocation,
      namespace: namespaceId,
      catalogItemId,
      artifactId,
      itemId,
      appVersionString,
      installSize,
      raw: root,
    };
  }

  /**
   * Returns installed Epic games (from local manifest files).
   * @returns {import('../models').EpicInstalledGame[]}
   */
  getInstalledGames() {
    const dir = EpicGamesController.getManifestsDir();
    if (!fs.existsSync(dir)) return [];

    /** @type {import('../models').EpicInstalledGame[]} */
    const results = [];

    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return [];
    }

    for (const name of names) {
      if (!String(name).toLowerCase().endsWith('.item')) continue;
      const file = path.join(dir, name);
      try {
        const text = fs.readFileSync(file, 'utf8');
        if (!text || !text.trim()) continue;
        const json = JSON.parse(text);
        const game = EpicGamesController.#tryParseItem(file, json);
        if (game) results.push(game);
      } catch {
        // ignore
      }
    }

    results.sort((a, b) => {
      const an = (a.displayName || a.appName || '').toLowerCase();
      const bn = (b.displayName || b.appName || '').toLowerCase();
      return an.localeCompare(bn);
    });

    return results;
  }
}

module.exports = EpicGamesController;
