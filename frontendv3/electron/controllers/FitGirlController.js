// @ts-check
'use strict';

const CloudscraperController = require('./CloudscraperController');

class FitGirlController {
  /** @type {CloudscraperController} */
  #scraper;

  /**
   * @param {{ timeoutMs?: number }} [cfg]
   */
  constructor(cfg) {
    this.#scraper = new CloudscraperController(cfg);
  }

  /**
   * Fetches the magnet link for a FitGirl repack by game name (slug).
   * @param {string} gameName
   * @returns {Promise<string | null>}
   */
  async fitGirlMagnetLink(gameName) {
    if (!gameName || !String(gameName).trim()) throw new Error('Game name is required');
    const slug = String(gameName).trim();
    const url = `https://fitgirl-repacks.site/${encodeURIComponent(slug)}`;
    const response = await this.#scraper.fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch FitGirl game page for "${gameName}": HTTP ${response.statusCode}`);
    }
    const body = response.body;

    // Log a snippet around any magnet link found so we can see the raw encoding.
    const rawMagnetIdx = body.indexOf('magnet:');

    const match = body.match(/href=["'](magnet:\?xt=urn:btih:[^"']+)["']/i);
    if (!match) {
      console.warn('[FitGirl] no magnet href found in page body');
      return null;
    }

    const magnetLink = match[1]
      .replace(/&#0*38;/g, '&')   // &#038; / &#38;
      .replace(/&amp;/gi, '&');   // &amp;

    console.log('[FitGirl] decoded magnet found');
    return magnetLink;
  }

  /**
   * Backward-compatible alias for legacy PascalCase method name.
   * @param {string} gameName
   * @returns {Promise<string | null>}
   */
  async FitGirlMagnetLink(gameName) {
    return this.fitGirlMagnetLink(gameName);
  }
}

module.exports = FitGirlController;
