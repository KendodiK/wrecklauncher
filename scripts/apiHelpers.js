
const fetch = require('node-fetch');
const CountriesController = require('../database/controllers/CountiesController.js');
const PricesController = require('../database/controllers/PricesController.js');
const { disconnect } = require('process');
// Read itch API key from environment when available to avoid relying on caller files
let itchApiKey = process.env.ITCH_API_KEY || null;

// Local sleep helper for retry/backoff
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Number(ms) || 0));
}

/**
 * Fetch helper that retries on HTTP 429 (Too Many Requests) until a non-429 response is received.
 * Respects the `Retry-After` header when present and applies exponential backoff between attempts.
 * WARNING: By default this will keep retrying on 429 indefinitely until a different status is returned.
 * You can pass options.maxRetries to limit attempts.
 */
async function fetchWith429Retries(url, opts = {}, options = {}) {
  const maxRetries = options.maxRetries == null ? Infinity : Number(options.maxRetries);
  const initialBackoff = Number(options.initialBackoffMs) || 1000;
  const maxBackoff = 60000; // 1 minute

  let attempt = 0;
  let backoff = initialBackoff;
  console.log(`Fetching ${url} with up to ${maxRetries} retries on 429...`);
  while (true) {
    let res;
    try {
      res = await fetch(url, opts);
    } catch (err) {
      // network error - retry similar to 5xx transient
      if (attempt >= maxRetries) throw err;
      await sleep(backoff);
      attempt++;
      backoff = Math.min(backoff * 2, maxBackoff);
      continue;
    }

    if (!res) {
      if (attempt >= maxRetries) throw new Error('No response from fetch');
      await sleep(backoff);
      attempt++;
      backoff = Math.min(backoff * 2, maxBackoff);
      continue;
    }

    if (res.status === 429) {
      // Respect Retry-After header if available
      const ra = res.headers.get('Retry-After');
      let waitMs = backoff;
      if (ra) {
        const raNum = Number(ra);
        if (!Number.isNaN(raNum)) waitMs = raNum * 1000;
        else {
          const date = Date.parse(ra);
          if (!Number.isNaN(date)) waitMs = Math.max(0, date - Date.now());
        }
      }
      if (attempt >= maxRetries) return res; // give caller the 429 if we've exhausted retries
      await sleep(waitMs);      
      attempt++;
      console.log(`Received 429 for ${url}. Attempt ${attempt}/${maxRetries}. Retrying in ${waitMs} ms...`);
      backoff = Math.min(backoff * 2, maxBackoff);
      continue; // retry on 429
    }

    // Non-429 response (success or other error) - return to caller
    return res;
  }
}



module.exports.getCountryIdByCode = async function (countyCode) {
  try {
    const normalizedCode = String(countyCode || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(normalizedCode)) {
      throw new Error(`Invalid country code: ${String(countyCode)}`);
    }

    const countryCtrl = new CountriesController();
    let country = await countryCtrl.getByCode(normalizedCode);
    if(country instanceof Error || !country) {
      const resp = await fetch(`https://restcountries.com/v3.1/alpha/${normalizedCode.toLowerCase()}`);
      if (!resp.ok) {
        throw new Error(`restcountries API ${resp.status}: ${await resp.text()}`);
      }
      const body = await resp.json();
      const apiCountry = Array.isArray(body) ? body[0] : body;
      if (!apiCountry) throw new Error('No country data returned from restcountries');

      const name = apiCountry?.name?.common ?? null;
      let currencySymbol = null;
      const currencies = apiCountry?.currencies;
      if (currencies && typeof currencies === 'object') {
        const first = Object.values(currencies)[0];
        currencySymbol = first?.symbol ?? null;
      }

      country = await countryCtrl.create({ name, code: normalizedCode, currency: currencySymbol });
    }
    return country?.id ?? null;
  } catch (err) {
    throw err;
  }
}

module.exports.getFormatedPrice = async function (gameId, countyCode) {
  try {
    const pricesCtrl = new PricesController();
    const prices = await pricesCtrl.getByGameId(gameId);

    let result = null;
    for (const price of prices || []) {
      if ((price.county_code ?? '').toLowerCase() === String(countyCode).toLowerCase()) {
        result = price;
        break;
      }
    }

    if (!result) {
      return new Error({ message: 'No price with given countyCode' });
    }

    return `${(result.price / 100).toFixed(2)} ${result.currency ?? ''}`;
  } catch (err) {
    throw err;
  }
};

/**
 * Normalizes an array of genre names by converting them to title case, removing duplicates, and filtering out utility genres.
 * @param {Array<string>} genreNames The array of genre names to normalize.
 * @returns {Array<string>} The normalized array of genre names.
 */
module.exports.normalizeGenreNames = function (genreNames) {
  if (!Array.isArray(genreNames)) return [];
  const utilityGenreSet = new Set([
    'free',
    'paid',
    'on sale',
    'demo',
    'released',
    'coming soon',
    'new & popular',
    'top sellers',
  ]);
  const seen = new Set();
  const out = [];
  for (const raw of genreNames) {
    if (raw == null) continue;
    const genre = module.exports.toTitleCaseWords(String(raw).replace(/[-_]/g, ' '));
    if (!genre) continue;
    const key = genre.toLowerCase();
    if (utilityGenreSet.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(genre);
  }
  return out;
}

/**
 * Converts a string to title case, trimming whitespace and replacing hyphens and underscores with spaces.
 * @param {string} text Text you want to clean up from whitespaces
 * @returns {string|null} The normalized string or null if the input is not a valid string
 */
module.exports.toTitleCaseWords = function (text) {
  if (typeof text !== 'string') return null;
  const normalized = collapseWhitespace(text.toLowerCase());
  if (!normalized) return null;
  return normalized
    .split(' ')
    .map((w) => w ? (w[0].toUpperCase() + w.slice(1)) : w)
    .join(' ');
}
/**
 * Collapses multiple whitespace characters into a single space and trims the string.
 * @param {string} text The string to collapse whitespace in.
 * @returns {string|null} The collapsed string or null if the input is not a valid string.
 */
function collapseWhitespace(text) {
  if (typeof text !== 'string') return null;
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Normalize platform/store names to a canonical simple form (lowercase, alphanumeric only).
 * Examples: 'Itch.io' -> 'itchio', 'itch' -> 'itch', 'GOG.com' -> 'gog'
 */
module.exports.normalizePlatformName = function (name) {
  if (name == null) return '';
  return String(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}


module.exports.shouldSkipGameBecausePriceMissing = function (gameLike, sourceLabel, gameName) {
  const missingPrice = !this.hasPriceValue(gameLike?.cost);
  const hasFreeSignal = gameLike?.is_free != null || gameLike?.free != null;
  const free = this.isGameFree(gameLike);
  if (missingPrice && hasFreeSignal && !free) {
    console.error(`Skipping ${sourceLabel} game: missing price for non-free game`, {
      name: gameName ?? gameLike?.name ?? null,
      app_id: gameLike?.app_id ?? null,
      is_free: gameLike?.is_free ?? gameLike?.free ?? null,
      cost: gameLike?.cost ?? null,
    });
    return true;
  }
  return false;
}

module.exports.hasPriceValue = function (cost) {
  if (cost == null) return false;
  if (typeof cost === 'number') return Number.isFinite(cost);
  if (typeof cost === 'string') {
    const trimmed = cost.trim();
    if (!trimmed) return false;
    if (trimmed.toLowerCase() === 'free') return true;
    const numeric = Number(trimmed.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(numeric);
  }
  return false;
}

module.exports.isGameFree = function (gameLike) {
  if (this.isTruthyFlag(gameLike?.is_free) || this.isTruthyFlag(gameLike?.free)) {
    return true;
  }

  const rawCost = gameLike?.cost;
  if (typeof rawCost === 'number') {
    return Number.isFinite(rawCost) && rawCost <= 0;
  }
  if (typeof rawCost === 'string') {
    const normalized = rawCost.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === 'free') return true;
    const numeric = Number(normalized.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(numeric) && numeric <= 0;
  }

  return false;
}

module.exports.isTruthyFlag = function (value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

/**
 * Fetches the URL of the header image for a Steam game. Also makes a HEAD request to check if the image exists, as not all games have header images and the API doesn't provide a direct way to check for their existence. Note that Steam's CDN may return a default placeholder image even for non-existent header images, so this function checks the response status to ensure the image actually exists.
 * @param {string|number} appId The Steam application ID.
 * @returns {Promise<string|null>} The URL of the header image or null if not found.
 */
async function getSteamHeaderImageUrl(appId) {
  const url = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
  try {
    const res = await fetchWith429Retries(url, { method: 'HEAD' });
    const ok = !!res && res.ok && res.status === 200;
    const url2 = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg?`;
    try{
      const res2 = await fetchWith429Retries(url2, { method: 'HEAD' });
      const ok2 = !!res2 && res2.ok && res2.status === 200;
      return ok2 ? url2 : (ok ? url : null);
    }catch(err2){
      console.warn('Failed to HEAD Steam alternative header image:', { appId: appId, err: err2?.message });
      return ok ? url : null;
    }
  } catch (err) {
    console.warn('Failed to HEAD Steam header image:', { appId: appId, err: err?.message });
    return null;
  }
}
/**
 * Fetches the URL of the cover image for a GOG game.
 * @param {string|number} appId The GOG application ID.
 * @returns {Promise<string|null>} The URL of the cover image or null if not found.
 */
async function fetchGogCoverUrl(appId) {
  // if (!Number.isFinite(numericAppId) || numericAppId <= 0) return null;

  const response = await fetch(`https://api.gog.com/v2/games/${appId}?locale=en-US`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'User-Agent': 'WreckLauncher/1.0 (+gog scraper)',
    },
  });
  if (!response.ok) {
    console.warn('Failed to fetch GOG cover URL:', { appId: appId, status: response.status });
    return null;
  }
  const data = await response.json();
  const imageFormatterUrl = String(String(data?._embedded?.product?._links?.image?.href).split('{formatter}.png')[0] ?? '');
  const imageUrl = `${String(data?._embedded?.product?._links?.image?.href).split('{formatter}.png')[0] ?? ''}glx_vertical_cover.webp`;
  const isValidImage = await fetch(imageUrl, { method: 'HEAD' })
    .then(res => res.ok && res.status === 200)
    .catch(() => false);
  if (isValidImage) {
    return imageUrl;
  }
  const fallback = `${imageFormatterUrl}1600.png`;
  return fallback;
}
/**
 * Fetches the URL of the cover image for an Itch game.
 * @param {string|number} appId The Itch application ID.
 * @returns {Promise<string|null>} The URL of the cover image or null if not found.
 */
async function fetchItchCoverUrl(appId) {
  const details = await module.exports.fetchItchGameDetails(appId, { includePageDetails: true });
  return details?.cover_url ?? null;
}

/**
 * Fetches the preferred header image URL based on the platform name and application ID.
 * @param {string} platformName The name of the platform.
 * @param {string|number} appId The application ID.
 * @returns {Promise<string|null>} The URL of the preferred header image or null if not found.
 */
module.exports.getPlatformBannerUrl = async function ( platformName, appId ) {
    // Basic guard: if no appId provided, don't attempt platform-specific fetches
    if (appId == null || appId === '') return null;
    platformName = String(platformName).trim().toLowerCase();
    // Normalize platform name to an alphanumeric canonical form (e.g. 'itch.io' -> 'itchio')
    const pn = module.exports.normalizePlatformName(platformName);
    if (pn === 'itchio' || pn === 'itch') {
      const itchioUrl = await fetchItchCoverUrl(appId);
      if (itchioUrl) return itchioUrl;
      return null;
    }
    if (pn === 'gog') {
      const gogUrl = await fetchGogCoverUrl(appId);
      if (gogUrl) return gogUrl;
      return null;
    }
    const steamUrl = await getSteamHeaderImageUrl(appId);
    return steamUrl;
}
/**
 * Fetches details for a game from the itch.io platform.
 * @param {number|string} appId The name speaks for itself...
 * @param {Array} param1 options object with the following optional boolean properties: includeRaw (if true, includes the raw API response in the returned details under the 'raw' property) and includePageDetails (if true, attempts to fetch additional details from the game's webpage, which may include a more comprehensive description and genre information). Note that fetching page details can be time-consuming and may fail if the page structure is unexpected or if there are network issues, so it's recommended to set includePageDetails to false if you want a faster response and are okay with potentially less detailed information.
 * @returns Everything that itch.io's API returns for the game, but normalized into a consistent format with other platforms and with some additional processing to compute properties like is_free and to extract genres. If includePageDetails is true, it will also attempt to fetch and include additional details from the game's webpage, which may provide a more comprehensive description and genre information than the API alone. However, this can be time-consuming and may fail if the page structure is unexpected or if there are network issues, so use with caution.
 */
module.exports.fetchItchGameDetails = async function (appId, { includeRaw = false, includePageDetails = true } = {}) {
  itchApiKey = itchApiKey || process.env.ITCH_API_KEY || null; // Re-read from environment in case it was set after module load
  if (!itchApiKey) {
    console.warn('Itch API key is not set. Cannot fetch itch game details.');
    return null;
  }
  const numericAppId = Number(appId);
  if (!Number.isFinite(numericAppId) || numericAppId <= 0) {
    console.warn(`Invalid Itch appId provided: ${appId}`);
    return null;
  }
  const endpoint = `https://itch.io/api/1/${itchApiKey}/game/${numericAppId}`;
  try {
    const response = await fetchWith429Retries(endpoint, { method: 'GET' });
    if (!response.ok) {
      console.log(`Failed to fetch itch game details for appId ${appId}. Status: ${response.status} ${response.statusText}`);
      return null;
    }
    const payload = await response.json();
    const game = payload?.game ?? payload;
    if (!game || typeof game !== 'object') return null;

    const minPriceNumeric = Number(game.min_price);
    const hasMinPrice = Number.isFinite(minPriceNumeric);
    const computedFree = hasMinPrice ? minPriceNumeric <= 0 : false;
    const pageDetails = includePageDetails ? await fetchItchPageDetailsByUrl(game.url) : null;
    const details = {
      id: game.id ?? numericAppId,
      app_id: numericAppId,
      title: game.title ?? null,
      short_text: game.short_text ?? null,
      url: game.url ?? null,
      cover_url: pageDetails?.cover_url ?? module.exports.getFirstStringByPaths(game, [['cover_url'], ['still_cover_url'], ['thumb_url']]),
      cover_urls: {
        cover: game.cover_url ?? null,
        still_cover: game.still_cover_url ?? null,
        thumb: game.thumb_url ?? null,
      },
      classification: game.classification ?? null,
      type: game.type ?? null,
      can_be_bought: game.can_be_bought ?? null,
      has_demo: game.has_demo ?? null,
      is_free: computedFree,
      price: hasMinPrice ? minPriceNumeric : null,
      discount: game?.sale?.rate ?? null,
      created_at: game.created_at ?? null,
      published_at: game.published_at ?? null,
      updated_at: game.updated_at ?? null,
      user: {
        id: game?.user?.id ?? null,
        username: game?.user?.username ?? null,
        url: game?.user?.url ?? null,
      },
      supports: {
        windows: game.p_windows ?? null,
        linux: game.p_linux ?? null,
        osx: game.p_osx ?? null,
        android: game.p_android ?? null,
      },
      metrics: {
        views_count: game.views_count ?? null,
        purchases_count: game.purchases_count ?? null,
      },
      description: pageDetails?.description ?? game.short_text ?? null,
      genres: module.exports.normalizeGenreNames(pageDetails?.genres ?? []),
    };

    if (includeRaw) {
      details.raw = game;
    }

    return details;
  } catch (err) {
    console.warn('Failed to fetch itch game details:', { appId: numericAppId, err: err?.message });
    return null;
  }
}


/**
 * Try to extract a textual description from an itch.io game page HTML.
 * Returns trimmed text or null.
 */
function extractItchPageDescription(html) {
  if (!html || typeof html !== 'string') return null;
  let m = html.match(/<meta\s+(?:property|name)=["'](?:og:description|description)["']\s+content=["']([^"']+)["']/i);
  if (m && m[1]) return m[1].trim();
  m = html.match(/<div[^>]*class=["'][^"']*(?:game_text|short_text|description)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (m && m[1]) return m[1].replace(/<[^>]+>/g, '').trim() || null;
  return null;
}

/**
 * Attempt to extract genre/tag names from an itch.io game page HTML.
 * Returns an array of strings (may be empty).
 */
function extractItchPageGenres(html) {
  if (!html || typeof html !== 'string') return [];
  const genres = new Set();
  let m;
  const regexA = /<a[^>]+href=["'][^"']*\/tags?\/[^"]*["'][^>]*>([^<]+)<\/a>/gi;
  while ((m = regexA.exec(html))) {
    const g = m[1].trim();
    if (g) genres.add(g);
  }
  const regexSpan = /<span[^>]*class=["'][^"']*(?:game_tag|tag|genre)[^"']*["'][^>]*>([^<]+)<\/span>/gi;
  while ((m = regexSpan.exec(html))) {
    const g = m[1].trim();
    if (g) genres.add(g);
  }
  const meta = html.match(/<meta\s+name=["']keywords["']\s+content=["']([^"']+)["']/i);
  if (meta && meta[1]) {
    for (const part of meta[1].split(',')) {
      const t = part.trim();
      if (t) genres.add(t);
    }
  }
  return Array.from(genres);
}

async function fetchItchPageDetailsByUrl(gameUrl) {
  if (!gameUrl || typeof gameUrl !== 'string') return null;

  try {
    const response = await fetchWith429Retries(gameUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'WreckLauncher/1.0 (+itch description parser)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) {
      console.log(`Failed to fetch itch game details for URL ${gameUrl}. Status: ${response.status} ${response.statusText}`);
      return null;
    }

    const html = await response.text();
    const description = extractItchPageDescription(html);
    const genres = extractItchPageGenres(html);
    const headerImage = extractItchHeaderImageUrl(html);
    return {
      description: description || null,
      genres,
      cover_url: headerImage || null,
    };
  } catch (err) {
    console.warn('Failed to fetch itch detailed description:', { gameUrl, err: err?.message });
    return null;
  }
}
function extractItchHeaderImageUrl(html) {
  if (!html || typeof html !== 'string') return null;
  const normalizeUrl = (u) => {
    if (!u || typeof u !== 'string') return null;
    const t = u.trim();
    return t.startsWith('//') ? 'https:' + t : t;
  };

  // Prefer meta tags (og:image / twitter:image)
  let m = html.match(/<meta\s+(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["'][^>]*content\s*=\s*["']([^"']+)["']/i);
  if (m && m[1]) return normalizeUrl(m[1]);

  // Look for an <img> inside the header container
  m = html.match(/<div[^>]*id=["']header["'][^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["'][^>]*>/i);
  if (m && m[1]) return normalizeUrl(m[1]);

  // Fallback: first <img> on the page
  m = html.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
  if (m && m[1]) return normalizeUrl(m[1]);

  return null;
}
function stripHtml(text) {
  if (typeof text !== 'string') return null;
  return text.replace(/<[^>]*>/g, ' ');
}
function decodeHtmlEntities(text) {
  if (typeof text !== 'string') return null;
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}
function extractItchPageDescription(html) {
  const blockMatch = html.match(/<div[^>]*class=["'][^"']*(formatted_description|game_info_panel_widget)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const blockText = blockMatch?.[2]
    ? collapseWhitespace(decodeHtmlEntities(stripHtml(blockMatch[2])))
    : null;
  if (blockText && blockText.length > 40) return blockText;

  const fromMeta =
    extractMetaTagContent(html, 'description', 'name') ||
    extractMetaTagContent(html, 'og:description', 'property') ||
    extractMetaTagContent(html, 'twitter:description', 'name');

  if (fromMeta) return fromMeta;

  return blockText || null;
}
function extractMetaTagContent(html, key, attrName) {
  if (typeof html !== 'string' || !html) return null;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<meta[^>]*${attrName}=["']${escapedKey}["'][^>]*content=["']([^"']+)["'][^>]*>|<meta[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${escapedKey}["'][^>]*>`,
    'i'
  );
  const match = html.match(pattern);
  const value = match?.[1] ?? match?.[2] ?? null;
  if (!value) return null;
  return collapseWhitespace(decodeHtmlEntities(value));
}
function extractItchPageGenres(html) {
  if (typeof html !== 'string' || !html) return [];

  const raw = [];
  const keywords = extractMetaTagContent(html, 'keywords', 'name');
  if (keywords) {
    for (const part of keywords.split(',')) raw.push(part);
  }

  const tagHrefRegex = /href=["'][^"']*\/games\/tag-([^"'\/?#]+)[^"']*["']/gi;
  let match;
  while ((match = tagHrefRegex.exec(html)) !== null) {
    raw.push(decodeURIComponent(match[1]));
  }

  const genreHrefRegex = /href=["'][^"']*\/games\/genre-([^"'\/?#]+)[^"']*["']/gi;
  while ((match = genreHrefRegex.exec(html)) !== null) {
    raw.push(decodeURIComponent(match[1]));
  }

  return module.exports.normalizeGenreNames(raw);
}

/**
 * Parse various possible price value representations returned by GOG APIs.
 * Returns numeric value (float) in currency units or null if not parseable.
 */
function parseGogPrice(val) {
  if (val == null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'string') {
    const cleaned = String(val).replace(/[^0-9,.-]/g, '').replace(/,/g, '.').trim();
    if (!cleaned) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof val === 'object') {
    // Try common numeric keys first
    for (const k of ['amount', 'price', 'final', 'base', 'value', 'gross']) {
      if (val[k] != null) {
        const p = parseGogPrice(val[k]);
        if (p != null) return p;
      }
    }
    // Try all properties as a last resort
    for (const k of Object.keys(val)) {
      const p = parseGogPrice(val[k]);
      if (p != null) return p;
    }
  }
  return null;
}

/**
 * Compute discount percent given initial and final numeric prices.
 * Returns a number representing percent (e.g. 75 for 75%), rounded to two decimals, or null.
 */
function computeDiscountPercent(initial, final) {
  if (typeof initial !== 'number' || typeof final !== 'number' || initial <= 0) return null;
  const pct = ((initial - final) / initial) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 100) / 100;
}

/**
 * Fetches details for a game from the GOG platform.
 * @param {number|string} appId The name speaks for itself yet again...
 * @param {Array} param1 Whether you want the raw data or not.
 * @returns Basic info about the game, almost the same as the default game return model
 */
module.exports.fetchGogGameDetails = async function (appId, { includeRaw = false } = {}) {
  const numericAppId = Number(appId);
  // If caller passed a numeric GOG product id, prefer the products endpoint which
  // returns richer data for numeric ids. Otherwise fall back to slug-based v2/games.
  if (Number.isFinite(numericAppId) && numericAppId > 0) {
    const endpoint = `https://api.gog.com/products/${numericAppId}?expand=description,screenshots`;
    try {
      const response = await fetch(endpoint, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WreckLauncher/1.0 (+gog scraper)',
        },
      });
      if (!response.ok) return null;
      const payload = await response.json();
      if (!payload || typeof payload !== 'object') return null;

      const title = typeof payload.title === 'string' ? payload.title.trim() : null;
      const bannerCandidate = module.exports.getFirstStringByPaths(payload, [
        ['images', 'background'],
        ['images', 'logo'],
        ['image'],
      ]);
      const bannerImg = typeof bannerCandidate === 'string' && bannerCandidate.startsWith('//')
        ? `https:${bannerCandidate}`
        : (bannerCandidate ?? null);

      const leadDesc = typeof payload?.description?.lead === 'string' ? payload.description.lead : null;
      const fullDesc = typeof payload?.description?.full === 'string' ? payload.description.full : null;
      const description = leadDesc || fullDesc || null;
      const priceUrl = `https://api.gog.com/products/${numericAppId}/prices?countryCode=DE`;    
      try {
        const priceRes = await fetch(priceUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'WreckLauncher/1.0 (+gog price checker)',
          },
        });
        if (priceRes.ok) {
          const priceData = await priceRes.json();
          let priceArray = [];
          if (Array.isArray(priceData)) {
            priceArray = priceData;
          } else if (priceData && typeof priceData === 'object') {
            if (Array.isArray(priceData._embedded?.prices)) priceArray = priceData._embedded.prices;
            else if (Array.isArray(priceData.prices)) priceArray = priceData.prices;
            else priceArray = Object.values(priceData);
          }
          for (const priceEntry of priceArray) {
            const currencyCode = String(priceEntry?.currency?.code ?? priceEntry?.currencyCode ?? '').trim().toUpperCase();
            if (currencyCode !== 'EUR') continue;
            const priceInitialNumeric = parseGogPrice(priceEntry.basePrice ?? priceEntry.base_price ?? priceEntry.initial ?? priceEntry.price ?? priceEntry.amount ?? priceEntry);
            const priceFinalNumeric = parseGogPrice(priceEntry.finalPrice ?? priceEntry.final_price ?? priceEntry.final ?? priceEntry.price ?? priceEntry.amount ?? priceEntry);
            payload.price = {
              initial: priceInitialNumeric ?? null,
              final: priceFinalNumeric ?? null,
              discount: computeDiscountPercent(priceInitialNumeric, priceFinalNumeric),
            };
            break;
          }
        }
      } catch (err) {
        console.warn('Failed to parse GOG price entry:', { appId: numericAppId, err: err?.message });
      }
      let cost = null;
      const finalPrice = payload?.price?.final ?? payload?.price?.initial ?? null;
      if (finalPrice != null) {
        const parsed = Number.parseFloat(String(finalPrice));
        if (Number.isFinite(parsed)) cost = parsed;
      }

      const genres = module.exports.normalizeGenreNames(
        Array.isArray(payload?.genres)
          ? payload.genres.map((g) => (typeof g === 'string' ? g : g?.name))
          : []
      );
      let minimumRequirements = "";
      const minReqUrl = `https://api.gog.com/v2/games/${numericAppId}?locale=en-US`;
      try {
        const minReqRes = await fetch(minReqUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'WreckLauncher/1.0 (+gog scraper)',
          },
        });
        if (minReqRes.ok) {
          const minReqData = await minReqRes.json();
          if (minReqData) {
            // Try several possible shapes where requirements may live
            let supported = [];
            if (Array.isArray(minReqData.supportedOperatingSystems)) supported = minReqData.supportedOperatingSystems;
            else if (Array.isArray(minReqData.supported_operating_systems)) supported = minReqData.supported_operating_systems;
            else if (Array.isArray(minReqData.systemRequirements)) supported = minReqData.systemRequirements;
            else if (Array.isArray(minReqData.system_requirements)) supported = minReqData.system_requirements;
            else if (Array.isArray(minReqData._embedded?.product?.supportedOperatingSystems)) supported = minReqData._embedded.product.supportedOperatingSystems;
            else if (Array.isArray(minReqData._embedded?.product?.systemRequirements)) supported = minReqData._embedded.product.systemRequirements;
            else if (Array.isArray(minReqData._embedded?.supportedOperatingSystems)) supported = minReqData._embedded.supportedOperatingSystems;
            else if (Array.isArray(minReqData._embedded?.systemRequirements)) supported = minReqData._embedded.systemRequirements;
            else if (Array.isArray(minReqData)) supported = minReqData;

            const blocks = [];
            for (const entry of supported) {
              if (!entry || typeof entry !== 'object') continue;

              // Case A: entry is a requirement block itself: { type: 'minimum', requirements: [...] }
              if (typeof entry.type === 'string' && Array.isArray(entry.requirements)) {
                blocks.push({ osName: String(entry?.operatingSystem?.name ?? '').trim(), block: entry });
                continue;
              }

              // Case B: entry groups systemRequirements under an operatingSystem
              const sysReqs = Array.isArray(entry.systemRequirements) ? entry.systemRequirements : (Array.isArray(entry.system_requirements) ? entry.system_requirements : null);
              if (Array.isArray(sysReqs)) {
                const osName = String(entry?.operatingSystem?.name ?? entry?.operatingSystem ?? entry?.name ?? '').trim();
                for (const b of sysReqs) {
                  if (!b || typeof b !== 'object') continue;
                  blocks.push({ osName, block: b });
                }
                continue;
              }

              // Case C: fallback: entry may contain nested requirement arrays under other keys
              if (Array.isArray(entry.requirements)) {
                blocks.push({ osName: String(entry?.operatingSystem?.name ?? '').trim(), block: entry });
              }
            }

            const outBlocks = [];
            for (const item of blocks) {
              const osName = item.osName || '';
              const block = item.block;
              const type = String(block?.type ?? '').toLowerCase();
              if (!type.includes('minimum')) continue;

              const lines = [];
              if (osName) lines.push(`OS: ${osName}`);

              const reqItems = Array.isArray(block.requirements) ? block.requirements : [];
              for (const r of reqItems) {
                if (typeof r === 'string') {
                  const t = r.trim(); if (t) lines.push(t);
                  continue;
                }
                if (!r || typeof r !== 'object') continue;
                const name = String(r?.name ?? r?.id ?? '').trim();
                const desc = String(r?.description ?? r?.value ?? '').trim();
                if (name && desc) lines.push(`${name} ${desc}`);
                else if (name) lines.push(name);
                else if (desc) lines.push(desc);
              }

              if (lines.length > 0) outBlocks.push(lines.join('\n'));
            }

            if (outBlocks.length > 0) minimumRequirements = outBlocks.join('\n\n');
          }
        }
      } catch (err) {
        console.warn('Failed to fetch GOG minimum requirements:', { appId: numericAppId, err: err?.message });
      }

      const details = {
        id: numericAppId,
        app_id: numericAppId,
        title,
        cover_url: bannerImg,
        banner_img: bannerImg,
        description,
        minimum_requirements: minimumRequirements || "",
        min_price: cost,
        price: payload?.price?.initial ?? null,
        discount: payload?.price?.discount ?? null,
        is_free: Number.isFinite(cost) ? cost <= 0 : false,
        genres,
        url: `https://www.gog.com/en/game/${numericAppId}`,
      };

      if (includeRaw) details.raw = payload;
      return details;
    } catch (err) {
      console.warn('Failed to fetch GOG game details (products endpoint):', { appId: numericAppId, err: err?.message });
      // fall through to slug-based attempt below
    }
  }

  // Fallback: treat appId as slug and query v2/games (existing behavior)
  const endpoint = `https://api.gog.com/v2/games/${appId}?locale=en-US`;
  try {
    const response = await fetch(endpoint, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'WreckLauncher/1.0 (+gog scraper)',
      },
    });

    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') return null;

    const title = typeof payload.title === 'string' ? payload.title.trim() : null;

    const description = typeof payload?.description === 'string' ? payload.description : null;

    const priceUrl = `https://api.gog.com/products/${appId}/prices?countryCode=DE`;
    try {
      const priceRes = await fetch(priceUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'WreckLauncher/1.0 (+gog price checker)',
        },
      });
      if (priceRes.ok) {
        const priceData = await priceRes.json();
        let priceArray = [];
        if (Array.isArray(priceData)) {
          priceArray = priceData;
        } else if (priceData && typeof priceData === 'object') {
          if (Array.isArray(priceData._embedded?.prices)) priceArray = priceData._embedded.prices;
          else if (Array.isArray(priceData.prices)) priceArray = priceData.prices;
          else priceArray = Object.values(priceData);
        }
        for (const priceEntry of priceArray) {
          const currencyCode = String(priceEntry?.currency?.code ?? priceEntry?.currencyCode ?? '').trim().toUpperCase();
          if (currencyCode !== 'EUR') continue;
          const priceInitialNumeric = parseGogPrice(priceEntry.basePrice ?? priceEntry.base_price ?? priceEntry.initial ?? priceEntry.price ?? priceEntry.amount ?? priceEntry);
          const priceFinalNumeric = parseGogPrice(priceEntry.finalPrice ?? priceEntry.final_price ?? priceEntry.final ?? priceEntry.price ?? priceEntry.amount ?? priceEntry);
          payload.price = {
            initial: priceInitialNumeric ?? null,
            final: priceFinalNumeric ?? null,
            discount: computeDiscountPercent(priceInitialNumeric, priceFinalNumeric),
          };
          break;
        }
      }
    } catch (err) {
      console.warn('Failed to parse GOG price entry:', { appId: appId, err: err?.message });
    }

    let cost = null;
    const finalPrice = payload?.price?.initial;
    if (finalPrice != null) {
      const parsed = Number.parseFloat(String(finalPrice));
      if (Number.isFinite(parsed)) cost = parsed;
    }

    const genres = module.exports.normalizeGenreNames(
      Array.isArray(payload?.genres)
        ? payload.genres.map((g) => (typeof g === 'string' ? g : g?.name))
        : []
    );

    const cover_url = await fetchGogCoverUrl(appId);
    const bannerImg = cover_url ?? null;
    let minimumRequirements = "";
    try {
      const minReqData = payload;
      let supported = [];
      if (Array.isArray(minReqData.supportedOperatingSystems)) supported = minReqData.supportedOperatingSystems;
      else if (Array.isArray(minReqData.supported_operating_systems)) supported = minReqData.supported_operating_systems;
      else if (Array.isArray(minReqData.systemRequirements)) supported = minReqData.systemRequirements;
      else if (Array.isArray(minReqData.system_requirements)) supported = minReqData.system_requirements;
      else if (Array.isArray(minReqData._embedded?.product?.supportedOperatingSystems)) supported = minReqData._embedded.product.supportedOperatingSystems;
      else if (Array.isArray(minReqData._embedded?.product?.systemRequirements)) supported = minReqData._embedded.product.systemRequirements;
      else if (Array.isArray(minReqData._embedded?.supportedOperatingSystems)) supported = minReqData._embedded.supportedOperatingSystems;
      else if (Array.isArray(minReqData._embedded?.systemRequirements)) supported = minReqData._embedded.systemRequirements;
      else if (Array.isArray(minReqData)) supported = minReqData;

      const blocks = [];
      for (const entry of supported) {
        if (!entry || typeof entry !== 'object') continue;

        // Case A: entry is a requirement block itself
        if (typeof entry.type === 'string' && Array.isArray(entry.requirements)) {
          blocks.push({ osName: String(entry?.operatingSystem?.name ?? '').trim(), block: entry });
          continue;
        }

        // Case B: entry groups systemRequirements under an operatingSystem
        const sysReqs = Array.isArray(entry.systemRequirements) ? entry.systemRequirements : (Array.isArray(entry.system_requirements) ? entry.system_requirements : null);
        if (Array.isArray(sysReqs)) {
          const osName = String(entry?.operatingSystem?.name ?? entry?.operatingSystem ?? entry?.name ?? '').trim();
          for (const b of sysReqs) {
            if (!b || typeof b !== 'object') continue;
            blocks.push({ osName, block: b });
          }
          continue;
        }

        // Case C: fallback - entry may contain nested requirement arrays under other keys
        if (Array.isArray(entry.requirements)) {
          blocks.push({ osName: String(entry?.operatingSystem?.name ?? '').trim(), block: entry });
        }
      }

      const outBlocks = [];
      for (const item of blocks) {
        const osName = item.osName || '';
        const block = item.block;
        const type = String(block?.type ?? '').toLowerCase();
        if (!type.includes('minimum')) continue;

        const lines = [];
        if (osName) lines.push(`OS: ${osName}`);

        const reqItems = Array.isArray(block.requirements) ? block.requirements : [];
        for (const r of reqItems) {
          if (typeof r === 'string') {
            const t = r.trim(); if (t) lines.push(t);
            continue;
          }
          if (!r || typeof r !== 'object') continue;
          const name = String(r?.name ?? r?.id ?? '').trim();
          const desc = String(r?.description ?? r?.value ?? '').trim();
          if (name && desc) lines.push(`${name} ${desc}`);
          else if (name) lines.push(name);
          else if (desc) lines.push(desc);
        }

        if (lines.length > 0) outBlocks.push(lines.join('\n'));
      }

      if (outBlocks.length > 0) minimumRequirements = outBlocks.join('\n\n');

    } catch (err) {
      console.warn('Failed to parse GOG minimum requirements (fallback):', { appId: appId, err: err?.message });
    }

    const details = {
      id: appId,
      app_id: appId,
      title,
      cover_url,
      banner_img: bannerImg,
      description,
      minimum_requirements: minimumRequirements || "",
      min_price: cost,
      price: payload?.price?.initial ?? null,
      discount: payload?.price?.discount ?? null,
      is_free: Number.isFinite(cost) ? cost <= 0 : false,
      genres,
      url: `https://www.gog.com/en/game/${appId}`,
    };

    if (includeRaw) details.raw = payload;
    return details;
  } catch (err) {
    console.warn('Failed to fetch GOG game details:', { appId: appId, err: err?.message });
    return null;
  }
}


/**
 * Fetches details for a game from the Steam platform. Whatch out for the rate limits on steam api, it can be quite harsh and with long cooldowns, so avoid if possible.
 * @param {number|string} appId The name speaks for itself yet again...
 * @param {Array} param1 Whether you want the raw data or not.
 * @returns Basic info about the game, almost the same as the default game return model.
 */
module.exports.fetchSteamGameDetails = async function (appId, { includeRaw = false } = {}) {


  const endpoint = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
  try {
    const response = await fetchWith429Retries(endpoint, { method: 'GET' });
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') return null;

    const gameData = payload[appId].data;
    if (!gameData || typeof gameData !== 'object') return null;

    const title = typeof gameData.name === 'string' ? gameData.name.trim() : null;
    const coverUrl = typeof gameData.header_image === 'string' ? gameData.header_image : null;
    const description = typeof gameData.about_the_game === 'string' ? gameData.about_the_game : null;

    const details = {
      id: appId,
      app_id: appId,
      title,
      cover_url: coverUrl,
      genres: module.exports.normalizeGenreNames(Array.isArray(gameData.genres) ? gameData.genres.map(g => g.description) : []),
      description,
      minimum_requirements: typeof gameData.pc_requirements?.minimum === 'string' ? gameData.pc_requirements.minimum : "",
      price: gameData.price_overview?.initial ?? gameData.is_free ? 0 : -1,
      discount: gameData.price_overview?.discount_percent ?? 0,
      url: `https://store.steampowered.com/app/${appId}`,
    };

    if (includeRaw) details.raw = gameData;
    return details;
  } catch (err) {
    console.warn('Failed to fetch Steam game details:', { appId: appId, err: err?.message });
    return null;
  }
}

/**

*Return the first non-empty string found at any of the provided nested paths inside source.
*Each path is an array of keys (strings or numbers) describing a nested access sequence (e.g. ['images','logo']).
*Only string values are considered valid; the found string is trimmed before being returned.
*@param {Object|null|undefined} source - The object to search through.
*@param {Array<Array<string|number>>} paths - Array of paths; each path is an array of keys to traverse.
*@returns {string|null} The trimmed string found at the first matching path, or null if none found.
*@example
*const obj = { images: { logo: ' //example.png ' } };
*getFirstStringByPaths(obj, [['images','logo'], ['image']]); // returns '//example.png'
*/
module.exports.getFirstStringByPaths = function (source, paths) {
  for (const path of paths) {
    let cursor = source;
    let validPath = true;
    for (const key of path) {
      if (cursor == null || !(key in cursor)) {
        validPath = false;
        break;
      }
      cursor = cursor[key];
    }
    if (validPath && typeof cursor === 'string' && cursor.trim()) {
      return cursor.trim();
    }
  }
  return null;
}

module.exports.ensureScrapedGameUploaded = async function ({ appId, platformName, name, bannerImg, description, cost, genreNames }) {
  const numericAppId = Number(appId);
  if (!Number.isFinite(numericAppId) || numericAppId <= 0) {
    return { uploaded: false, gameId: null, reason: 'invalid-app-id' };
  }

  const normalizedPlatformName = String(platformName || '').trim().toLowerCase();
  if (!normalizedPlatformName) {
    return { uploaded: false, gameId: null, reason: 'missing-platform' };
  }

  const gamesCtrl = new gamesController();
  const platformsCtrl = new platformsController();

  const platform = await platformsCtrl.create({ name: normalizedPlatformName });
  const platformId = Number(platform?.id);
  if (!Number.isFinite(platformId) || platformId <= 0) {
    return { uploaded: false, gameId: null, reason: 'platform-resolution-failed' };
  }

  const existingId = await gamesCtrl.getGameIdByAppIdAndPlatform(numericAppId, platformId);
  if (existingId) {
    return { uploaded: false, gameId: existingId, reason: 'already-exists' };
  }

  const gameData = {
    app_id: numericAppId,
    platform_name: normalizedPlatformName,
    name: String(name || `game:${numericAppId}`),
    banner_img: bannerImg || '',
    description: description || '',
    minimum_requirements: '',
    cost: cost ?? null,
    is_free: Number.isFinite(Number(cost)) ? Number(cost) <= 0 : false,
  };

  if (shouldSkipGameBecausePriceMissing(gameData, `${normalizedPlatformName}-scrape`, gameData.name)) {
    return { uploaded: false, gameId: null, reason: 'missing-price' };
  }

  const uploaded = await gamesCtrl.uploadWithAll(gameData, null, normalizeGenreNames(genreNames ?? []));
  return { uploaded: true, gameId: uploaded?.id ?? null, reason: 'uploaded' };
}