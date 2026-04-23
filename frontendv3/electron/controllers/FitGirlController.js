// @ts-check
'use strict';


class FitGirlController {
  /**
   * Fetches the magnet link for a FitGirl repack by game name ( NOT slug).
   * @param {string} gameName
   * @returns {Promise<string | null>}
   */
  async fitGirlMagnetLink(gameName) {
    if (!gameName || !String(gameName).trim()) throw new Error('Game name is required');
    const slug = String(gameName).trim().replace(/\s+/g, '-').toLowerCase();
    const url = `https://fitgirl-repacks.site/${encodeURIComponent(slug)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch FitGirl game page for "${gameName}": HTTP ${response.status}`);
    }
    const body = await response.text().catch(() => '');
    const match = body.match(/href=["'](magnet:\?xt=urn:btih:[^"']+)["']/i);
    if (!match) {
      console.warn('[FitGirl] no magnet href found in page body');
      return null;
    }

    const magnetLink = match[1]
      .replace(/&#0*38;/g, '&')   // &#038; / &#38;
      .replace(/&amp;/gi, '&');   // &amp;

    console.log('[FitGirl] decoded magnet found');  //delete this line later, still needed for debugging the magnet decoding
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
