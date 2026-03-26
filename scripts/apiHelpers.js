
const fetch = require('node-fetch');
const CountriesController = require('../database/controllers/CountiesController.js');
const PricesController = require('../database/controllers/PricesController.js');

module.exports.getCountryIdByCode = async function (countyCode) {
  try {
    const countryCtrl = new CountriesController();
    let country = await countryCtrl.getByCode(countyCode);
    if(country instanceof Error || !country) {
      const resp = await fetch(`https://restcountries.com/v3.1/alpha/${countyCode.toLowerCase()}`);
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

      country = await countryCtrl.create({ name, code: countyCode, currency: currencySymbol });
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
    const genre = toTitleCaseWords(String(raw).replace(/[-_]/g, ' '));
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


module.exports.shouldSkipGameBecausePriceMissing = function (gameLike, sourceLabel, gameName) {
  const missingPrice = !this.hasPriceValue(gameLike?.cost);
  const hasFreeSignal = gameLike?.is_free != null || gameLike?.free != null;
  const free = this.isGameFree(gameLike);
  if (missingPrice && hasFreeSignal && !free) {
    console.log(`Skipping ${sourceLabel} game: missing price for non-free game`, {
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
    const numericAppId = Number(appId);
  if (!Number.isFinite(numericAppId) || numericAppId <= 0) return null;
  const url = `https://cdn.cloudflare.steamstatic.com/steam/apps/${numericAppId}/library_600x900.jpg`;
  const response = fetch(url, { method: 'HEAD' })
    .then(res => {
      if (res.ok && res.status === 200) {
        return url;
        } else {
            return null;
        }
    }).catch(() => {return null});
    return await response || null;
}
/**
 * Fetches the URL of the cover image for a GOG game.
 * @param {string|number} appId The GOG application ID.
 * @returns {Promise<string|null>} The URL of the cover image or null if not found.
 */
async function fetchGogCoverUrl(appId) {
  const numericAppId = Number(appId);
  if (!Number.isFinite(numericAppId) || numericAppId <= 0) return null;

  const endpoints = [
    `https://api.gog.com/products/${numericAppId}?expand=description`,
    `https://api.gog.com/v2/games/${numericAppId}?locale=en-US`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint);
      if (!response.ok) continue;
      const payload = await response.json();
      const candidate = getFirstStringByPaths(payload, [
        ['image'],
        ['images', 'logo'],
        ['images', 'background'],
        ['_embedded', 'product', 'image'],
        ['_embedded', 'product', 'images', 'logo'],
        ['_embedded', 'product', 'images', 'background'],
      ]);
      if (candidate) {
        if (candidate.startsWith('//') && candidate.endsWith('glx_vertical_cover.webp')) return `https:${candidate}`;
        return candidate;
      }
    } catch (err) {
      console.warn('Failed to fetch GOG cover URL from endpoint:', {
        appId: numericAppId,
        endpoint,
        err: err?.message,
      });
    }
  }

  return null;
}
/**
 * Fetches the URL of the cover image for an Itch game.
 * @param {string|number} appId The Itch application ID.
 * @returns {Promise<string|null>} The URL of the cover image or null if not found.
 */
async function fetchItchCoverUrl(appId) {
  const details = await fetchItchGameDetails(appId);
  return details?.cover_url ?? null;
}

/**
 * Fetches the preferred header image URL based on the platform name and application ID.
 * @param {string} platformName The name of the platform.
 * @param {string|number} appId The application ID.
 * @returns {Promise<string|null>} The URL of the preferred header image or null if not found.
 */
module.exports.getPlatformBannerUrl = async function ( platformName, appId ) {
    platformName = String(platformName).trim().toLowerCase();
    if (platformName && platformName.toLowerCase().includes('itch')) {
        const itchioUrl = await fetchItchCoverUrl(appId);
        if (itchioUrl) return itchioUrl;
    }
    if (platformName && platformName.toLowerCase().includes('gog')) {
        const gogUrl = await fetchGogCoverUrl(appId);
        if (gogUrl) return gogUrl;
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
module.exports.fetchItchGameDetails = async function (appId, { includeRaw = false, includePageDetails = false } = {}) {
  const numericAppId = Number(appId);
  if (!Number.isFinite(numericAppId) || numericAppId <= 0) return null;
  if (!itchApiKey) return null;

  const endpoint = `https://itch.io/api/1/${itchApiKey}/game/${numericAppId}`;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) return null;
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
      cover_url: getFirstStringByPaths(game, [['cover_url'], ['still_cover_url'], ['thumb_url']]),
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
      min_price: hasMinPrice ? minPriceNumeric : null,
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
      genres: normalizeGenreNames(pageDetails?.genres ?? []),
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



async function fetchItchPageDetailsByUrl(gameUrl) {
  if (!gameUrl || typeof gameUrl !== 'string') return null;

  try {
    const response = await fetch(gameUrl, {
      headers: {
        'User-Agent': 'WreckLauncher/1.0 (+itch description parser)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) return null;

    const html = await response.text();
    const description = extractItchPageDescription(html);
    const genres = extractItchPageGenres(html);
    return {
      description: description || null,
      genres,
    };
  } catch (err) {
    console.warn('Failed to fetch itch detailed description:', { gameUrl, err: err?.message });
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