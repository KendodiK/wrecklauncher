
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

function normalizeGenreNames (genreNames) {
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

function toTitleCaseWords(text) {
  if (typeof text !== 'string') return null;
  const normalized = collapseWhitespace(text.toLowerCase());
  if (!normalized) return null;
  return normalized
    .split(' ')
    .map((w) => w ? (w[0].toUpperCase() + w.slice(1)) : w)
    .join(' ');
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

module.exports.getPlatformBannerUrl = async function ({ platformName, appId, fallbackBanner }) {
  const normalizedPlatform = String(platformName ?? '').trim().toLowerCase();
  if (normalizedPlatform === 'steam') {
    return getSteamHeaderImageUrl(appId) ?? (fallbackBanner ?? '');
  }

  if (normalizedPlatform === 'itch' || normalizedPlatform === 'itchio') {
    const itchCover = await fetchItchCoverUrl(appId);
    return itchCover ?? (fallbackBanner ?? '');
  }

  if (normalizedPlatform === 'gog') {
    const gogCover = await fetchGogCoverUrl(appId);
    return gogCover ?? (fallbackBanner ?? '');
  }

  return fallbackBanner ?? '';
}

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

function getFirstStringByPaths(source, paths) {
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