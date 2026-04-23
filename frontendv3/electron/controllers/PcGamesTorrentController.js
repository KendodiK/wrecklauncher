// @ts-check
'use strict';

class PcGamesTorrentController {
  /** @type {number} */
  #redirectTimeoutMs;

  /**
   * @param {{ timeoutMs?: number, redirectTimeoutMs?: number }} [cfg]
   */
  constructor(cfg) {
    const rto = Number(cfg?.redirectTimeoutMs);
    this.#redirectTimeoutMs = rto > 0 ? rto : 25_000;
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  #decodeHtmlAmpersands(value) {
    return String(value || '')
      .replace(/&#0*38;/g, '&')
      .replace(/&amp;/gi, '&')
      .trim();
  }

  /**
   * @param {string} href
   * @returns {boolean}
   */
  #isLikelyDownloadUrl(href) {
    const clean = String(href || '').trim();
    if (!clean) return false;
    if (/^magnet:\?/i.test(clean)) return true;
    if (/^https?:\/\//i.test(clean) && /\.torrent(?:[?#]|$)/i.test(clean)) return true;
    return false;
  }

  /**
   * @param {string} body
   * @returns {string[]}
   */
  #extractPcGamesArticleLinks(body) {
    const html = String(body || '');
    const seen = new Set();
    const out = [];
    const re = /href=["'](https?:\/\/(?:www\.)?pcgamestorrents?\.com\/[^"'<>\s]*)["']/gi;

    for (const match of html.matchAll(re)) {
      const raw = this.#decodeHtmlAmpersands(match[1]);
      if (!raw) continue;

      let parsed;
      try {
        parsed = new URL(raw);
      } catch {
        continue;
      }

      const path = String(parsed.pathname || '').trim();
      if (!path || path === '/') continue;

      const key = parsed.toString().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(parsed.toString());
    }

    return out;
  }

  /**
   * @param {string} body
   * @param {string} baseUrl
   * @returns {string[]}
   */
  #extractUrlGeneratorLinks(body, baseUrl) {
    const html = String(body || '');
    const seen = new Set();
    /** @type {string[]} */
    const out = [];

    /** @type {(candidate: string) => void} */
    const add = (candidate) => {
      const decoded = this.#decodeHtmlAmpersands(candidate);
      if (!decoded) return;

      let resolved;
      try {
        resolved = new URL(decoded, baseUrl).toString();
      } catch {
        return;
      }

      if (!/\/url-generator\.php\?url=/i.test(resolved)) return;

      const key = resolved.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(resolved);
    };

    const hrefRe = /href=["']([^"']*url-generator\.php\?url=[^"']+)["']/gi;
    for (const match of html.matchAll(hrefRe)) {
      add(match[1]);
    }

    if (out.length === 0) {
      // Fallback only when no href-based candidates were found.
      const jsRe = /["'](https?:\/\/[^"']*url-generator\.php\?url=[^"']+)["']/gi;
      for (const match of html.matchAll(jsRe)) {
        add(match[1]);
      }
    }

    return out;
  }

  /**
   * @param {string} body
   * @param {string} baseUrl
   * @returns {string[]}
   */
  #extractDirectDownloadLinks(body, baseUrl) {
    const html = String(body || '');
    const seen = new Set();
    /** @type {string[]} */
    const out = [];

    /** @type {(candidate: string) => void} */
    const add = (candidate) => {
      const decoded = this.#decodeHtmlAmpersands(candidate);
      if (!decoded) return;

      let resolved = decoded;
      if (!/^magnet:\?/i.test(resolved)) {
        try {
          resolved = new URL(decoded, baseUrl).toString();
        } catch {
          return;
        }
      }

      if (!this.#isLikelyDownloadUrl(resolved)) return;

      const key = resolved.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(resolved);
    };

    const hrefRe = /href=["']([^"']+)["']/gi;
    for (const match of html.matchAll(hrefRe)) {
      add(match[1]);
    }

    const jsMagnetRe = /["'](magnet:\?[^"']+)["']/gi;
    for (const match of html.matchAll(jsMagnetRe)) {
      add(match[1]);
    }

    return out;
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
        clearInterval(pollTimer);
        try { win.destroy(); } catch { /* already destroyed */ }
        resolve(val);
      };

      // @ts-ignore
      const settleIfDownloadLike = (candidate) => {
        const cleaned = this.#decodeHtmlAmpersands(candidate);
        if (!this.#isLikelyDownloadUrl(cleaned)) return false;
        settle(cleaned);
        return true;
      };

      // @ts-ignore
      const extractFromDom = async () => {
        try {
          const candidate = await win.webContents.executeJavaScript(`(() => {
            const readHref = (el) => {
              if (!el) return '';
              const attrHref = typeof el.getAttribute === 'function' ? String(el.getAttribute('href') || '').trim() : '';
              const propHref = typeof el.href === 'string' ? String(el.href).trim() : '';
              return propHref || attrHref || '';
            };

            const selectors = [
              '#btnDownload',
              '#btn-download',
              '.btn-download',
              'a[href^="magnet:"]',
              'a[href*=".torrent"]',
            ];

            for (const selector of selectors) {
              const node = document.querySelector(selector);
              const href = readHref(node);
              if (/^magnet:\?/i.test(href) || /\.torrent(?:[?#]|$)/i.test(href)) {
                return href;
              }
            }

            const downloadButton = document.querySelector('#btnDownload, #btn-download, .btn-download');
            if (downloadButton) {
              const cls = String(downloadButton.className || '').toLowerCase();
              const disabled = downloadButton.hasAttribute('disabled') || cls.includes('disabled');
              if (!disabled) {
                if (!window.__wreckLauncherDownloadClicked) {
                  window.__wreckLauncherDownloadClicked = true;
                  try { downloadButton.click(); } catch { /* ignore click errors */ }
                }
              }

              const href = readHref(downloadButton);
              if (/^magnet:\?/i.test(href) || /\.torrent(?:[?#]|$)/i.test(href)) {
                return href;
              }

              const onclick = typeof downloadButton.getAttribute === 'function'
                ? String(downloadButton.getAttribute('onclick') || '').trim()
                : '';
              const magnetFromOnclick = onclick.match(/(magnet:\?[^"'\s]+)/i);
              if (magnetFromOnclick && magnetFromOnclick[1]) {
                return magnetFromOnclick[1];
              }
            }

            return '';
          })()`, true);

          if (typeof candidate === 'string' && candidate.trim()) {
            settleIfDownloadLike(candidate);
          }
        } catch {
          // Ignore transient DOM-read errors while scripts are still loading.
        }
      };

      const timer = setTimeout(async () => {
        try {
          await extractFromDom();
          if (settled) {
            return;
          }
        } catch { /* ignore */ }
        clearInterval(pollTimer);
        try { win.destroy(); } catch { /* already destroyed */ }
        reject(new Error(`Could not extract magnet from "${url}" within ${this.#redirectTimeoutMs}ms`));
      }, this.#redirectTimeoutMs);

      const pollTimer = setInterval(() => {
        if (settled) return;
        void extractFromDom();
      }, 500);

      win.webContents.on('will-navigate', (_event, newUrl) => {
        if (settled) return;
        if (settleIfDownloadLike(newUrl)) {
          try { _event.preventDefault(); } catch { /* ignore */ }
          return;
        }

        try {
          const parsed = new URL(String(newUrl || ''));
          if (parsed.hostname === 'undefined') {
            _event.preventDefault();
          }
        } catch {
          // ignore malformed URLs
        }
      });

      win.webContents.on('will-redirect', (_event, newUrl) => {
        if (settled) return;
        if (settleIfDownloadLike(newUrl)) {
          try { _event.preventDefault(); } catch { /* ignore */ }
          return;
        }

        try {
          const parsed = new URL(String(newUrl || ''));
          if (parsed.hostname === 'undefined') {
            _event.preventDefault();
          }
        } catch {
          // ignore malformed URLs
        }
      });

      win.webContents.on('did-start-navigation', (_event, navigationUrl, _isInPlace, isMainFrame) => {
        if (!isMainFrame || settled) return;
        settleIfDownloadLike(navigationUrl);
      });

      // Some templates open the final magnet in a new window/tab.
      if (typeof win.webContents.setWindowOpenHandler === 'function') {
        win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
          if (!settled) {
            settleIfDownloadLike(targetUrl);
          }
          return { action: 'deny' };
        });
      }

      win.webContents.on('did-create-window', (childWindow) => {
        try {
          const targetUrl = typeof childWindow?.webContents?.getURL === 'function'
            ? childWindow.webContents.getURL()
            : '';
          if (!settled) {
            settleIfDownloadLike(targetUrl);
          }
        } catch {
          // Ignore and continue polling.
        }
      });

      win.webContents.on('did-finish-load', async () => {
        await extractFromDom();
      });

      win.loadURL(url).catch((err) => {
        clearTimeout(timer);
        clearInterval(pollTimer);
        try { win.destroy(); } catch { /* already destroyed */ }
        reject(err);
      });
    });
  }

  /**
   * INTENTIONALLY SLOW! This is not meant to be a general-purpose fetch. It loads the full page with JS execution, waits for redirects, and extracts the magnet link from the final page. Use fetch() for simple HTML fetching without JS.
   * Fetches the magnet link for a FitGirl repack by game name ( NOT slug).
   * @param {string} gameName
   * @returns {Promise<string | null>}
   */
  async pcGamesTorrentMagnetLink(gameName) {
    if (!gameName || !String(gameName).trim()) throw new Error('Game name is required');
    const slug = String(gameName).trim().replace(/\s+/g, '-');
    const url = `https://pcgamestorrent.com/${encodeURIComponent(slug)}.html`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PcGamesTorrent game page for "${gameName}": HTTP ${response.status}`);
    }
    const body = await response.text().catch(() => '');
    const titlePattern = /<p>\s*<img[^>]*>\s*<span[^>]*>\s*Title:\s*<\/span>\s*(?<title>[\s\S]*?)<\/p>/i;
    const fetchedTitle = (body.match(titlePattern)?.groups?.title || '').trim();
    if(!fetchedTitle || (!gameName.toLocaleLowerCase().includes(fetchedTitle.toLocaleLowerCase()) && !fetchedTitle.toLocaleLowerCase().includes(gameName.toLocaleLowerCase()))) {
      throw new Error(`Game title "${gameName}" does not match the fetched title "${fetchedTitle}"`);
    }
    const linkPatternForMagnet = /<p[^>]*class="[^"]*\buk-card\b[^"]*\buk-card-body\b[^"]*\buk-card-default\b[^"]*\buk-card-hover\b[^"]*"[^>]*>\s*<a[^>]*href="(?<href>[^"]+)"[^>]*>(?<text>[^<]+)<\/a>/i;
    const match = linkPatternForMagnet.exec(body);
    const magnetLinkGeneratorUrl = match?.groups?.href ? this.#decodeHtmlAmpersands(match.groups.href) : null;
    if (!magnetLinkGeneratorUrl) {
      throw new Error('Could not find magnet link generator URL on the page');
    }
    const magnet = await this.#extractMagnetFromPage(magnetLinkGeneratorUrl);
    if (magnet) {
      return magnet;
    }
    console.warn('[PcGamesTorrent] no magnet extracted from any candidate download page');
    return null;
  }

  /**
   * Backward-compatible alias for legacy PascalCase method name.
   * @param {string} gameName - NOT slug
   * @returns {Promise<string | null>}
   */
  async PcGamesTorrentMagnetLink(gameName) {
    return this.pcGamesTorrentMagnetLink(gameName);
  }
}

module.exports = PcGamesTorrentController;
