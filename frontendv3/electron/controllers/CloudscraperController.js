// @ts-check

const cloudscraper = require('cloudscraper');

class CloudscraperController {
  /** @type {number} */
  #timeoutMs;

  /**
   * @param {{ timeoutMs?: number }} [cfg]
   */
  constructor(cfg) {
    const timeoutMs = Number(cfg?.timeoutMs);
    this.#timeoutMs = timeoutMs > 0 ? timeoutMs : 20_000;
  }

  /**
   * @param {string} value
   */
  #normalizeHttpUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) throw new Error('URL is required');

    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('Only http/https URLs are supported');
    }
    return url.toString();
  }

  /**
   * @param {string} url
   * @param {{ method?: string, headers?: Record<string, string>, body?: any, qs?: Record<string, any> }} [options]
   */
  async fetch(url, options = {}) {
    const targetUrl = this.#normalizeHttpUrl(url);

    const method = String(options.method || 'GET').toUpperCase();
    const headers = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      ...(options.headers || {}),
    };

    /** @type {any} */
    const requestOptions = {
      method,
      uri: targetUrl,
      headers,
      qs: options.qs,
      body: options.body,
      timeout: this.#timeoutMs,
      gzip: true,
      resolveWithFullResponse: true,
    };

    const res = await cloudscraper(requestOptions);

    return {
      ok: Number(res.statusCode) >= 200 && Number(res.statusCode) < 300,
      statusCode: Number(res.statusCode) || 0,
      url: targetUrl,
      headers: res.headers || {},
      body: typeof res.body === 'string' ? res.body : String(res.body ?? ''),
    };
  }

  async fetchGogGamesHome() {
    return await this.fetch('https://gog-games.to/');
  }

  async fetchDodiRepacksHome() {
    return await this.fetch('https://dodi-repacks.site/');
  }

  /**
   * @param {string} gameSlug
   */
  async fetchGogGamePage(gameSlug) {
    if (!gameSlug || !String(gameSlug).trim()) throw new Error('Game slug is required');
    const url = `https://gog-games.to/api/v1/games/${encodeURIComponent(String(gameSlug).trim())}`;
    const response = await this.fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch GOG game page for slug "${gameSlug}": HTTP ${response.statusCode}`);
    }
    const json = JSON.parse(response.body);
    if (!json || typeof json !== 'object') {
        throw new Error(`Invalid JSON response when fetching GOG game page for slug "${gameSlug}"`);
    }
    const links = json.links;
    return links.game.gofile.links[0].link;
  }

}

module.exports = CloudscraperController;
