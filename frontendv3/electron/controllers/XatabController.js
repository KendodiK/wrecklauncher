// @ts-check
'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const cloudscraper = require('cloudscraper');
const CloudscraperController = require('./CloudscraperController');

class XatabController {
  /** @type {CloudscraperController} */
  #scraper;

  /** @type {number} */
  #timeoutMs;

  /** @type {string} */
  #cookieHeader;

  /**
   * @param {{ timeoutMs?: number, cookieHeader?: string }} [cfg]
   */
  constructor(cfg) {
    this.#scraper = new CloudscraperController(cfg);

    const timeoutMs = Number(cfg?.timeoutMs);
    this.#timeoutMs = timeoutMs > 0 ? timeoutMs : 20_000;

    this.#cookieHeader = String(
      cfg?.cookieHeader
      || process.env.WRECK_XATAB_COOKIE
      || 'dle_user_id=346916; dle_password=c02c0d85a9f103c4aa74c8591407a48b; dle_newpm=0'
    ).trim();
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
   * @param {string} value
   * @returns {string}
   */
  #stripHtml(value) {
    return this.#decodeHtmlAmpersands(String(value || '').replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * @param {string} value
   * @returns {string}
   */
  #normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/<[^>]+>/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * @param {string} value
   * @returns {boolean}
   */
  #isValidMagnetUri(value) {
    return /^magnet:\?xt=urn:btih:[a-z0-9]{16,}/i.test(String(value || '').trim());
  }

  /**
   * @param {Record<string, string>} [extra]
   * @returns {Record<string, string>}
   */
  #buildHeaders(extra = {}) {
    const headers = {
      ...extra,
    };

    if (this.#cookieHeader) {
      headers.Cookie = this.#cookieHeader;
    }

    return headers;
  }

  /**
   * @param {string} url
   * @returns {boolean}
   */
  #isByxatabGamePageUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return false;

    try {
      const parsed = new URL(raw);
      return /(^|\.)byxatab\.com$/i.test(parsed.hostname) && /\/games\//i.test(parsed.pathname || '');
    } catch {
      return false;
    }
  }

  /**
   * @param {string} query
   * @returns {string}
   */
  #buildSearchUrl(query) {
    const q = String(query || '').trim();
    return `https://byxatab.com/search/${encodeURIComponent(q)}/`;
  }

  /**
   * @param {string} title
   * @param {string} href
   * @param {string} query
   * @returns {number}
   */
  #scoreCandidate(title, href, query) {
    const titleNorm = this.#normalizeText(title);
    const hrefNorm = this.#normalizeText(href);
    const queryNorm = this.#normalizeText(query);

    if (!queryNorm) return 0;

    let score = 0;
    if (titleNorm === queryNorm) score += 500;
    if (titleNorm.includes(queryNorm)) score += 300;
    if (hrefNorm.includes(queryNorm)) score += 200;

    const queryTokens = queryNorm.split(' ').filter(Boolean);
    for (const token of queryTokens) {
      if (token.length < 2) continue;
      if (titleNorm.includes(token)) score += 40;
      if (hrefNorm.includes(token)) score += 25;
    }

    return score;
  }

  /**
   * @param {string} body
   * @param {string} searchQuery
   * @returns {Array<{ url: string, title: string, score: number }>}
   */
  #extractSearchCandidates(body, searchQuery) {
    const html = String(body || '');

    /** @type {Array<{ url: string, title: string, score: number }>} */
    const candidates = [];
    const seen = new Set();

    const anchorRegex = /<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*\brelease2\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(anchorRegex)) {
      const hrefRaw = this.#decodeHtmlAmpersands(match[1]);
      const block = String(match[2] || '');

      let resolved;
      try {
        resolved = new URL(hrefRaw, 'https://byxatab.com/').toString();
      } catch {
        continue;
      }

      if (!this.#isByxatabGamePageUrl(resolved)) continue;

      const urlKey = resolved.toLowerCase();
      if (seen.has(urlKey)) continue;
      seen.add(urlKey);

      const titleMatch = block.match(/<div\b[^>]*class=["'][^"']*\brelease__title\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
      const title = this.#stripHtml(titleMatch?.[1] || block);
      const score = this.#scoreCandidate(title, resolved, searchQuery);
      candidates.push({ url: resolved, title, score });
    }

    candidates.sort((left, right) => right.score - left.score);
    return candidates;
  }

  /**
   * @param {string} searchQueryOrUrl
   * @returns {Promise<string|null>}
   */
  async #resolveGamePageUrl(searchQueryOrUrl) {
    const raw = String(searchQueryOrUrl || '').trim();
    if (!raw) throw new Error('Game name is required');

    if (this.#isByxatabGamePageUrl(raw)) {
      return raw;
    }

    const searchUrl = this.#buildSearchUrl(raw);
    const searchResponse = await this.#scraper.fetch(searchUrl, {
      method: 'GET',
      headers: this.#buildHeaders(),
    });

    if (!searchResponse.ok) {
      throw new Error(`Failed to fetch Xatab search page for "${raw}": HTTP ${searchResponse.statusCode}`);
    }

    const candidates = this.#extractSearchCandidates(searchResponse.body, raw);
    if (candidates.length < 1) {
      return null;
    }

    return candidates[0].url;
  }

  /**
   * @param {string} body
   * @param {string} baseUrl
   * @returns {string|null}
   */
  #extractDownloadButtonUrl(body, baseUrl) {
    const html = String(body || '');
    const primaryMatch = html.match(/<a\b[^>]*href=["']([^"']*index\.php\?do=download[^"']*)["'][^>]*class=["'][^"']*\bdownload-torrent\b[^"']*["'][^>]*>/i);
    const fallbackMatch = html.match(/<a\b[^>]*href=["']([^"']*index\.php\?do=download[^"']*)["'][^>]*>/i);
    const match = primaryMatch || fallbackMatch;
    if (!match || !match[1]) return null;

    const decodedHref = this.#decodeHtmlAmpersands(match[1]);

    try {
      return new URL(decodedHref, baseUrl).toString();
    } catch {
      return null;
    }
  }

  /**
   * @param {string} downloadUrl
   * @returns {Promise<{ tempPath: string, tempDir: string, buffer: Buffer }>}
   */
  async #downloadTorrentToTemp(downloadUrl) {
    /** @type {any} */
    const requestOptions = {
      method: 'GET',
      uri: downloadUrl,
      headers: this.#buildHeaders({
        'Accept': 'application/x-bittorrent,application/octet-stream;q=0.9,*/*;q=0.8',
        'Referer': 'https://byxatab.com/',
      }),
      timeout: this.#timeoutMs,
      gzip: true,
      resolveWithFullResponse: true,
      encoding: null,
    };

    const response = await cloudscraper(requestOptions);

    const statusCode = Number(response?.statusCode) || 0;
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`Failed to download Xatab torrent file: HTTP ${statusCode}`);
    }

    const body = response?.body;
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
    if (buffer.length < 32) {
      throw new Error('Downloaded Xatab torrent file is empty or invalid');
    }

    const hasBencodeHeader = buffer[0] === 0x64; // "d" (bencoded dictionary)
    const hasInfoSection = buffer.includes(Buffer.from('4:info'));
    if (!hasBencodeHeader || !hasInfoSection) {
      throw new Error('Downloaded Xatab payload is not a valid torrent file');
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wreck-xatab-'));
    const tempPath = path.join(tempDir, `${Date.now()}-${randomUUID()}.torrent`);
    await fs.writeFile(tempPath, buffer);

    return {
      tempPath,
      tempDir,
      buffer,
    };
  }

  /**
   * @param {Buffer} torrentBuffer
   * @returns {Promise<string|null>}
   */
  async #extractMagnetFromTorrentBuffer(torrentBuffer) {
    if (!Buffer.isBuffer(torrentBuffer) || torrentBuffer.length < 32) {
      return null;
    }

    const parseTorrentModule = await import('parse-torrent');
    const parseTorrent = parseTorrentModule.default;
    const parsedMaybePromise = /** @type {any} */ (parseTorrent(torrentBuffer));
    const parsed = (parsedMaybePromise && typeof parsedMaybePromise.then === 'function')
      ? await parsedMaybePromise
      : parsedMaybePromise;

    if (typeof parseTorrentModule.toMagnetURI === 'function') {
      const magnet = String(parseTorrentModule.toMagnetURI(parsed) || '').trim();
      if (this.#isValidMagnetUri(magnet)) return magnet;
    }

    const infoHash = String(parsed?.infoHash || '').trim();
    if (/^[a-f0-9]{40}$/i.test(infoHash) || /^[a-z2-7]{32}$/i.test(infoHash)) {
      return `magnet:?xt=urn:btih:${infoHash}`;
    }
    return null;
  }

  /**
   * Fetches the magnet link for a game from byxatab.com.
   * Flow: search -> game page -> download-torrent button -> .torrent download -> magnet conversion -> temp cleanup.
   * @param {string} gameName
   * @returns {Promise<string|null>}
   */
  async xatabMagnetLink(gameName) {
    const queryOrUrl = String(gameName || '').trim();
    if (!queryOrUrl) throw new Error('Game name is required');

    const gamePageUrl = await this.#resolveGamePageUrl(queryOrUrl);
    if (!gamePageUrl) {
      console.warn('[Xatab] no search result found for:', queryOrUrl);
      return null;
    }

    const gamePageResponse = await this.#scraper.fetch(gamePageUrl, {
      method: 'GET',
      headers: this.#buildHeaders({ 'Referer': 'https://byxatab.com/' }),
    });

    if (!gamePageResponse.ok) {
      throw new Error(`Failed to fetch Xatab game page for "${queryOrUrl}": HTTP ${gamePageResponse.statusCode}`);
    }

    const downloadUrl = this.#extractDownloadButtonUrl(gamePageResponse.body, gamePageUrl);
    if (!downloadUrl) {
      console.warn('[Xatab] no download-torrent button found in game page:', gamePageUrl);
      return null;
    }

    /** @type {string} */
    let tempPath = '';
    /** @type {string} */
    let tempDir = '';

    try {
      const downloaded = await this.#downloadTorrentToTemp(downloadUrl);
      tempPath = downloaded.tempPath;
      tempDir = downloaded.tempDir;

      const magnet = await this.#extractMagnetFromTorrentBuffer(downloaded.buffer);
      if (!magnet) {
        console.warn('[Xatab] could not extract magnet URI from downloaded torrent:', downloadUrl);
        return null;
      }

      const decodedMagnet = this.#decodeHtmlAmpersands(magnet);
      if (!this.#isValidMagnetUri(decodedMagnet)) {
        console.warn('[Xatab] extracted magnet URI is invalid:', decodedMagnet.slice(0, 80));
        return null;
      }

      return decodedMagnet;
    } finally {
      if (tempPath) {
        await fs.unlink(tempPath).catch(() => {});
      }
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  /**
   * Backward-compatible alias for legacy PascalCase method name.
   * @param {string} gameName
   * @returns {Promise<string|null>}
   */
  async XatabMagnetLink(gameName) {
    return this.xatabMagnetLink(gameName);
  }
}

module.exports = XatabController;
