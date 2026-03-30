// @ts-check
'use strict';

const CloudscraperController = require('./CloudscraperController');

class PcGamesTorrentController {
  /** @type {CloudscraperController} */
  #scraper;

  /** @type {number} */
  #redirectTimeoutMs;

  /**
   * @param {{ timeoutMs?: number, redirectTimeoutMs?: number }} [cfg]
   */
  constructor(cfg) {
    this.#scraper = new CloudscraperController(cfg);
    const rto = Number(cfg?.redirectTimeoutMs);
    this.#redirectTimeoutMs = rto > 0 ? rto : 15_000;
  }

  /**
   * Loads a URL in a hidden BrowserWindow, waits for JS to execute, and
   * extracts the magnet link either from a will-navigate event (window.location.replace)
   * or by reading #btnDownload.href after page load.
   * @param {string} url
   * @returns {Promise<string | null>}
   */
  #extractMagnetFromPage(url) {
    return new Promise((resolve, reject) => {
      const { BrowserWindow } = require('electron');
      const win = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      let settled = false;
      // @ts-ignore
      const settle = (val) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { win.destroy(); } catch { /* already destroyed */ }
        resolve(val);
      };

      const timer = setTimeout(async () => {
        // Timeout fallback: try reading the magnet from the DOM via JS.
        try {
          const href = await win.webContents.executeJavaScript(
            'document.getElementById("btnDownload") ? document.getElementById("btnDownload").href : null'
          );
          if (typeof href === 'string' && href.startsWith('magnet:')) {
            settle(href);
            return;
          }
        } catch { /* ignore */ }
        try { win.destroy(); } catch { /* already destroyed */ }
        reject(new Error(`Could not extract magnet from "${url}" within ${this.#redirectTimeoutMs}ms`));
      }, this.#redirectTimeoutMs);

      // window.location.replace('magnet:...') fires will-navigate before navigating.
      win.webContents.on('will-navigate', (_event, newUrl) => {
        if (typeof newUrl === 'string' && newUrl.startsWith('magnet:')) {
          settle(newUrl);
        }
      });

      // Also catch via did-finish-load: JS has run, read btnDownload directly.
      win.webContents.on('did-finish-load', async () => {
        try {
          const href = await win.webContents.executeJavaScript(
            'document.getElementById("btnDownload") ? document.getElementById("btnDownload").href : null'
          );
          if (typeof href === 'string' && href.startsWith('magnet:')) {
            settle(href);
          }
        } catch { /* ignore, will-navigate or timeout will handle it */ }
      });

      win.loadURL(url).catch((err) => {
        clearTimeout(timer);
        try { win.destroy(); } catch { /* already destroyed */ }
        reject(err);
      });
    });
  }

  /**
   * INTENTIONALLY SLOW! This is not meant to be a general-purpose fetch. It loads the full page with JS execution, waits for redirects, and extracts the magnet link from the final page. Use fetch() for simple HTML fetching without JS.
   * Fetches the magnet link for a FitGirl repack by game name (slug).
   * @param {string} gameName
   * @returns {Promise<string | null>}
   */
  async PcGamesTorrentMagnetLink(gameName) {
    if (!gameName || !String(gameName).trim()) throw new Error('Game name is required');
    const slug = String(gameName).trim();
    const url = `https://igg-games.com/${encodeURIComponent(slug)}.html`;
    const response = await this.#scraper.fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch IggGames game page for "${gameName}": HTTP ${response.statusCode}`);
    }
    const body = response.body;
    // Log a snippet around any magnet link found so we can see the raw encoding.
    const rawpcgamestorrentlink = body.indexOf('pcgamestorrents.com');
    // Match a pcgamestorrents.com link that has a path beyond just the root slash (not homepage nav links).
    const allPcMatches = [...body.matchAll(/href=["'](https?:\/\/pcgamestorrents\.com\/[^"'/][^"']*)["']/gi)];
    const match = allPcMatches[0];
    if (!match) {
      console.warn('[PcGamesTorrent] no pcgamestorrents.com href found in page body');
      return null;
    }
    const pcgamestorrentBody = await this.#scraper.fetch(match[1]);
    if (!pcgamestorrentBody.ok) {
      throw new Error(`Failed to fetch PcGamesTorrent page for "${gameName}": HTTP ${pcgamestorrentBody.statusCode}`);
    }
    const magnetMatch = pcgamestorrentBody.body.match(/href=["'](https?:\/\/[^"']*gamedownloadurl\.autos\/url-generator\.php\?url=[^"']+)["']/i);
    if (!magnetMatch) {
      console.warn('[PcGamesTorrent] no gamedownloadurl.autos href found in PcGamesTorrent page body');
      return null;
    }

    const magnetLinkWebSite = magnetMatch[1]
      .replace(/&#0*38;/g, '&')
      .replace(/&amp;/gi, '&');

    // The gamedownloadurl.autos page requires JS execution to set the magnet link.
    // Use a hidden BrowserWindow so JS runs, then intercept will-navigate or read btnDownload.href.
    try {
      const magnet = await this.#extractMagnetFromPage(magnetLinkWebSite);
      if (!magnet) {
        console.warn('[PcGamesTorrent] no magnet extracted from download page');
        return null;
      }
  
      return magnet
        .replace(/&#0*38;/g, '&')
        .replace(/&amp;/gi, '&');
    } catch (e) {
      console.warn('[PcGamesTorrent] failed to extract magnet from download page:', e);
      return null;
    }
  }
}

module.exports = PcGamesTorrentController;
