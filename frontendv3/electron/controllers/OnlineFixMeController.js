// @ts-check
'use strict';

const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const cloudscraper = require('cloudscraper');

// Puppeteer (and puppeteer-extra stealth) are used as a fallback to solve Cloudflare JS challenges
let _puppeteer = null;
try {
  const pptrExtra = require('puppeteer-extra');
  const StealthPlugin = require('puppeteer-extra-plugin-stealth');
  pptrExtra.use(StealthPlugin());
  _puppeteer = pptrExtra;
} catch (err) {
  try {
    _puppeteer = require('puppeteer');
  } catch (err2) {
    _puppeteer = null;
  }
}
class OnlineFixMeController {
  /** @type {number} */
  #timeoutMs;

  /** @type {string} */
  #cookieHeader;

  /**
   * @param {{ timeoutMs?: number, cookieHeader?: string }} [cfg]
   */
  constructor(cfg) {
    const timeoutMs = Number(cfg?.timeoutMs);
    this.#timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 20_000;
    this.#cookieHeader = String(cfg?.cookieHeader || 'online_fix_auth=gAAAAABp54Rj9E7dPKeUx0HJDBklBlB61zPYT_-LbXDfmTl0VKlgWliIY6sqvD7pcA6ZTLBI4ynXWd1Nu044UyGyI362scuwfs8dSR-bX6nnsyNe9tOFMzyMiyGmGEfQXW1FcUA0tycyhKaddLsVKcLA-fjYptnrZPTj40X3lrMu0xFKDm3fo47364ZSmBeUT7gdWcTu_cioHDriPdgEtJXwBh-0dxqj4ikXwsTppyct08aEdT6p9gOHF4y5iDsY2dHexAtRQJPK; cf_clearance=JRbHQol8U2OQIY1HgMJBc4vntdi3Pn7uK7wTaMxvoNM-1776780255-1.2.1.1-2yL0Qkwaqx2QCq4Wbr7usfa1jmJXbzBn8OJRflEZkkbSZ2dQ4bCc91tZGN2xFWqZvl5PdGUfqPPAWL33p91XDoB0cQq7D9EPVO7eMD.C.Vqnxiqrs97r7nOieyLCHlHWwOHzBqAFB9jH1zRHn9DVJyIjOvxY6KgjW9Y7h46pTVFvNTVnfgzlUfYloE5NExhDMdS2v.TGdA_WK0jjHB4hhaAOMlFVeLBsqsSMYzpNpb9Qu71o5ynb1Of899OTg5xbje19HwOZHse9jiyPrEficpUAwHlUkJj8dZhkPKhvzIJbk6wgJyxDiT7ZhIiZObEDF7nuC3OsXAKOtoSh9BdLSg; PHPSESSID=8o7jjsn32n5jpfji7fk12iovf1').trim();
  }

  /**
   * @param {Record<string,string>} [extra]
   * @returns {Record<string,string>}
   */
  #buildHeaders(extra = {}) {
    /** @type {Record<string,string>} */
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Referer': 'https://online-fix.me/',
      'Alt-Used': 'uploads.online-fix.me:2053',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-site',
      'Sec-Fetch-User': '?1',
      'Priority': 'u=0, i',
      'TE': 'trailers',
      ...extra,
    };

    // Prefer an explicitly configured cookie header; fallback to the long static cookie
    if (this.#cookieHeader) {
      headers['Cookie'] = this.#cookieHeader;
    } else if (!headers['Cookie']) {
      headers['Cookie'] = 'online_fix_auth=gAAAAABp54Rj9E7dPKeUx0HJDBklBlB61zPYT_-LbXDfmTl0VKlgWliIY6sqvD7pcA6ZTLBI4ynXWd1Nu044UyGyI362scuwfs8dSR-bX6nnsyNe9tOFMzyMiyGmGEfQXW1FcUA0tycyhKaddLsVKcLA-fjYptnrZPTj40X3lrMu0xFKDm3fo47364ZSmBeUT7gdWcTu_cioHDriPdgEtJXwBh-0dxqj4ikXwsTppyct08aEdT6p9gOHF4y5iDsY2dHexAtRQJPK; cf_clearance=JRbHQol8U2OQIY1HgMJBc4vntdi3Pn7uK7wTaMxvoNM-1776780255-1.2.1.1-2yL0Qkwaqx2QCq4Wbr7usfa1jmJXbzBn8OJRflEZkkbSZ2dQ4bCc91tZGN2xFWqZvl5PdGUfqPPAWL33p91XDoB0cQq7D9EPVO7eMD.C.Vqnxiqrs97r7nOieyLCHlHWwOHzBqAFB9jH1zRHn9DVJyIjOvxY6KgjW9Y7h46pTVFvNTVnfgzlUfYloE5NExhDMdS2v.TGdA_WK0jjHB4hhaAOMlFVeLBsqsSMYzpNpb9Qu71o5ynb1Of899OTg5xbje19HwOZHse9jiyPrEficpUAwHlUkJj8dZhkPKhvzIJbk6wgJyxDiT7ZhIiZObEDF7nuC3OsXAKOtoSh9BdLSg; PHPSESSID=8o7jjsn32n5jpfji7fk12iovf1; online_fix_auth=gAAAAABp55EFv44VzLAjSawa1adJCyKqHU7a00vcp-3TnGMP8xoIHoO-HWGU2h3qMD0MD3ioljMEkaYZX0kCw85Ue7JUApr-sk-AVetkzEWd-a3QYsQiand1f2ldoLVPiydyFXpoCqnbzitHGv320iWM7_ztVRJcHTeBuJwzQ3f3pZXJR3wajSbAHnSxVbJL4U9gSL6TSbZkeJEMX9PFjVhFQwUvWL202A==';
    }

    return headers;
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
   * @param {string} html
   * @returns {Promise<string|null>}
   */
  async #getHrefFromListHtml(html) {
    const clean = String(html || '');
    const m = clean.match(/href=["']([^"']+\.torrent)["']/i);
    const href = m ? this.#decodeHtmlAmpersands(m[1]) : null;
    return href;
  }

  /**
   * Fetch the listing page for a given game name and return the list URL and HTML body.
   * @param {string} name
   * @returns {Promise<{ listUrl: string, html: string }>} 
   */
  async #fetchOnlineFixMeTorrentList(name) {
    const listUrl = `https://uploads.online-fix.me:2053/torrents/${encodeURIComponent(name)}/`;
    const body = await this.#fetchOnlineFixMeUrl(listUrl);
    return { listUrl, html: String(body || '') };
  }

  /**
   * Fetch a URL via the CloudscraperController and return the response body text.
   * @param {string} url
   */
  async #fetchOnlineFixMeUrl(url) {
    // Build headers using the standard builder so cookies/overrides propagate.
    const headers = this.#buildHeaders();

    let response = await fetch(url, { method: 'GET', headers });

    // If Cloudflare JS-challenge or 401 was returned, try a Puppeteer-based fallback once.
    const bodyText = String(response?.body || '');
    const looksLikeCF = /window\.__CF\$cv|challenge-platform\/scripts\/jsd|401 Authorization Required/i.test(bodyText)
      || /cloudflare/i.test(String(response?.headers?.server || ''))
      || Number(response?.statusCode) === 401;

    if (looksLikeCF) {
      if (_puppeteer) {
        try {
          const cookie = await this.#getClearanceCookiesWithPuppeteer(url);
          if (cookie) {
            this.#cookieHeader = cookie;
            const headers2 = this.#buildHeaders();
            response = await fetch(url, { method: 'GET', headers: headers2 });
          }
        } catch (err) {
          // ignore and surface below
          console.warn('[OnlineFixMe] Puppeteer fallback failed:', err?.message || err);
        }
      }
    }

    if (!response || !response.ok) {
      throw new Error(`Failed to fetch OnlineFixMe URL: HTTP ${response?.status || 'unknown'}`);
    }
    return response.body;
  }

  /**
   * @param {string} downloadUrl
   * @returns {Promise<{ tempPath: string, tempDir: string, buffer: Buffer }>}
   */
  async #downloadTorrentToTemp(downloadUrl) {
    const target = String(downloadUrl || '').trim();
    if (!target) throw new Error('downloadUrl is required');

    const referer = (() => {
      try { return new URL(target).origin; } catch { return 'https://online-fix.me/'; }
    })();

    /** @type {any} */
    const requestOptions = {
      method: 'GET',
      uri: target,
      headers: this.#buildHeaders({ 'Accept': 'application/x-bittorrent,application/octet-stream;q=0.9,*/*;q=0.8', 'Referer': referer }),
      timeout: this.#timeoutMs,
      gzip: true,
      resolveWithFullResponse: true,
      encoding: null,
    };

    let response;
    try {
      response = await cloudscraper(requestOptions);
    } catch (err) {
      const respBody = String(err?.response?.body || '');
      const looksLikeCF = /window\.__CF\$cv|challenge-platform\/scripts\/jsd|401 Authorization Required/i.test(respBody)
        || /cloudflare/i.test(String(err?.response?.headers?.server || ''))
        || Number(err?.statusCode) === 401;

      if (looksLikeCF && _puppeteer) {
        try {
          const referer = (() => {
            try { return new URL(downloadUrl).origin; } catch { return 'https://online-fix.me/'; }
          })();
          // Try to obtain cookies for the referer/origin and retry once
          const cookie = await this.#getClearanceCookiesWithPuppeteer(referer);
          if (cookie) {
            this.#cookieHeader = cookie;
            requestOptions.headers = this.#buildHeaders({ 'Accept': 'application/x-bittorrent,application/octet-stream;q=0.9,*/*;q=0.8', 'Referer': referer });
            response = await cloudscraper(requestOptions);
          }
        } catch (err2) {
          // ignore and rethrow original
        }
      }

      if (!response) throw err;
    }

    const statusCode = Number(response?.status) || 0;
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`Failed to download OnlineFixMe torrent file: HTTP ${statusCode}`);
    }
    const body = response?.body;
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
    if (buffer.length < 32) {
      throw new Error('Downloaded OnlineFixMe torrent file is empty or invalid');
    }
    const hasBencodeHeader = buffer[0] === 0x64; // 'd'
    const hasInfoSection = buffer.includes(Buffer.from('4:info'));
    if (!hasBencodeHeader || !hasInfoSection) {
      throw new Error('Downloaded payload is not a valid torrent file');
    }
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wreck-onlinefix-'));
    const tempPath = path.join(tempDir, `${Date.now()}-${randomUUID()}.torrent`);
    await fs.writeFile(tempPath, buffer);
    return { tempPath, tempDir, buffer };
  }

  /**
   * Use Puppeteer (with stealth plugin when available) to visit a URL and capture
   * cookies set by Cloudflare/online-fix so subsequent HTTP requests can reuse them.
   * @param {string} targetUrl
   * @returns {Promise<string|null>} cookie header string or null
   */
  async #getClearanceCookiesWithPuppeteer(targetUrl) {
    if (!_puppeteer) return null;

    let browser = null;
    try {
      const launchArgs = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
      browser = await _puppeteer.launch({ headless: true, args: launchArgs, defaultViewport: null });
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0');
      await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: this.#timeoutMs });
      // give Cloudflare a little extra time to set cookies
      // Some puppeteer versions/platforms may not expose waitForTimeout — use a simple delay.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const cookies = await page.cookies();
      if (!Array.isArray(cookies) || cookies.length === 0) return null;

      const relevant = cookies.filter(c => c && c.name && c.value && (String(c.domain || '').includes('online-fix.me') || String(c.domain || '').includes('uploads.online-fix.me')));
      if (!relevant || relevant.length === 0) return null;

      const cookieHeader = relevant.map(c => `${c.name}=${c.value}`).join('; ');
      return cookieHeader || null;
    } catch (err) {
      console.warn('[OnlineFixMe] puppeteer cookie fetch failed:', err?.message || err);
      return null;
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * @param {Buffer} torrentBuffer
   * @returns {Promise<string|null>}
   */
  async #extractMagnetFromTorrentBuffer(torrentBuffer) {
    if (!Buffer.isBuffer(torrentBuffer) || torrentBuffer.length < 32) return null;

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
   * @param {string} value
   * @returns {boolean}
   */
  #isValidMagnetUri(value) {
    return /^magnet:\?xt=urn:btih:[a-z0-9]{16,}/i.test(String(value || '').trim());
  }

  /**
   * Resolve a magnet link for a game name (NOT slug) on Online-Fix.me
   * @param {string} gameName
   * @returns {Promise<string|null>}
   */
  async onlineFixMeMagnetLink(gameName) {
    const name = String(gameName || '').trim();
    if (!name) return null;
    
    let tempPath = '';
    let tempDir = '';

    try {
      const { listUrl, html } = await this.#fetchOnlineFixMeTorrentList(name);
      const href = await this.#getHrefFromListHtml(html);
      if (!href) {
        console.warn(`[OnlineFixMe] No torrent href found for game "${name}"`);
        return null;
      }

      let downloadUrl = href;
      try { downloadUrl = new URL(href, listUrl).toString(); } catch {}

      const downloaded = await this.#downloadTorrentToTemp(downloadUrl);
      tempPath = downloaded.tempPath;
      tempDir = downloaded.tempDir;

      const magnet = await this.#extractMagnetFromTorrentBuffer(downloaded.buffer);
      if (!magnet) {
        console.warn('[OnlineFixMe] could not extract magnet URI from downloaded torrent:', downloadUrl);
        return null;
      }

      const decodedMagnet = this.#decodeHtmlAmpersands(magnet);
      if (!this.#isValidMagnetUri(decodedMagnet)) {
        console.warn('[OnlineFixMe] extracted magnet URI is invalid:', decodedMagnet.slice(0, 80));
        return null;
      }

      return decodedMagnet;
    } catch (error) {
      console.error(`Error fetching OnlineFixMe magnet link for "${gameName}":`, error);
      return null;
    } finally {
      if (tempPath) await fs.unlink(tempPath).catch(() => {});
      if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

module.exports = OnlineFixMeController;
