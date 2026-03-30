const express = require('express');
const fetch = require('node-fetch'); // works with v2
const puppeteer = require('puppeteer');
const cors = require('cors');
require('dotenv').config();
const mysql = require('mysql2');
const { env } = require('process');
const app = express();
const https = require('https');
const zlib = require('zlib');
const { platform } = require('os');
const crypto = require('crypto');

const databaseHandler = require('./database/DatabaseHandler');
const DBCreator = require('./database/DBCreator');

const nativeUserController = require('./database/controllers/NativeUsersController');
const platformUsersController = require('./database/controllers/PlatformUsersController');
const platformsController = require('./database/controllers/PlatformsController');
const gamesGenresConnnectionController = require('./database/controllers/GamesGenresConnectionController');
const gamesController = require('./database/controllers/GamesController');
const friendsController = require('./database/controllers/FriendsController');
const chatsController = require('./database/controllers/ChatsController'); 
const shopSpecialsController = require('./database/controllers/ShopSpecialsController');
const pirateSitesController = require('./database/controllers/PirateSitesController');
const gamesPirateSitesConnectionController = require('./database/controllers/GamesPirateSitesConnectionController');
const countriesController = require('./database/controllers/CountiesController');
const pricesController = require('./database/controllers/PricesController');
const NativeUsersController = require('./database/controllers/NativeUsersController');
const CountiesController = require('./database/controllers/CountiesController');

const { errorMonitor } = require('events');
const { error } = require('console');

const PORT = 3000;
// Replace with your actual Steam API key and Steam ID
const steamApiKey = process.env.STEAM_API_KEY;
const itchApiKey = process.env.ITCH_API_KEY;
const itadApiKey = process.env.ITAD_API_KEY;
const clientId = process.env.IGDB_CLIENT_ID;
const clientSecret = process.env.IGDB_CLIENT_SECRET;
let igdbToken = null;
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Global error handlers to avoid silent exits
process.on('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
});
process.on('unhandledRejection', (reason, p) => {
  console.error('unhandledRejection at:', p, 'reason:', reason);
});

// Start server and attach listeners for better diagnostics
const server = app.listen(PORT, () => {
  console.log(`Proxy server running at http://localhost:${PORT}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
});

server.on('listening', async () => {
  try {
    const addr = server.address();
    if (typeof addr === 'string') {
      console.log('Server listening on', addr);
    } else {
      console.log('Server listening on', `${addr.address}:${addr.port}`);
    }
  } catch (err) {
    console.error('Error retrieving server address:', err);
  }

  try {
    const databaseCreator = new DBCreator();
    await databaseCreator.createTables();
  } catch (err) {
    console.error('Error creating database tables on startup:', err);
  }
});


// ------------------- Helper functions ------------------ //
async function fetchIGDBToken() {
  try {
    const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${process.env.IGDB_CLIENT_ID}&client_secret=${process.env.IGDB_CLIENT_SECRET}&grant_type=client_credentials`, {
      method: 'POST',
    });
    const data = await response.json();
    return data.access_token;
  } catch (err) {
    console.error('Error fetching IGDB token:', err);
    throw err;
  }
}
async function fetchIGDB(endpoint, query) {
  if (!clientId) {
    throw new Error('Missing IGDB client id (IGDB_CLIENT_ID)');
  }
  if (!igdbToken) {
    throw new Error('Missing IGDB token; fetchIGDBToken() must run first');
  }

  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${igdbToken}`,
      'Content-Type': 'text/plain',
      'Accept': 'application/json',
    },
    // IGDB expects the query as plain text in the request body
    body: query,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`IGDB ${endpoint} HTTP ${response.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    // If IGDB ever returns non-JSON (unexpected), surface the raw body.
    return text;
  }
}

function normalizeIgdbImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('//')) return `https:${url}`;
  return url;
}

function getSteamAppIdFromIgdbGame(igdbGame) {
  const externalGames = igdbGame?.external_games;
  if (!Array.isArray(externalGames) || externalGames.length === 0) return null;

  // IGDB: external_games.category indicates the store/platform.
  // Steam is commonly category = 1.
  const steamEntry = externalGames.find((eg) => Number(eg?.category) === 1);
  const uid = steamEntry?.uid;
  if (uid == null) return null;

  const numeric = Number(uid);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function getSteamHeaderImageUrl(appId) {
  const numericAppId = Number(appId);
  if (!Number.isFinite(numericAppId) || numericAppId <= 0) return null;
  return `https://cdn.akamai.steamstatic.com/steam/apps/${numericAppId}/header.jpg`;
}

/**
 * Verify that a Steam app ID exists by calling the Steam store API.
 * Returns true if the app exists, false otherwise.
 * @param {number} appId - The Steam app ID to verify
 * @returns {Promise<boolean>}
 */
async function verifySteamGameExists(appId) {
  try {
    const numericAppId = Number(appId);
    if (!Number.isFinite(numericAppId) || numericAppId <= 0) return false;

    const url = `https://store.steampowered.com/api/appdetails?appids=${numericAppId}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WreckLauncher/1.0',
      },
    });

    if (!response.ok) return false;

    const data = await response.json();
    const appData = data[numericAppId];
    
    // Check if the app exists and is not marked as unavailable
    return appData?.success === true;
  } catch (err) {
    console.error(`Error verifying Steam game ${appId}:`, err);
    return false;
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

function collapseWhitespace(text) {
  if (typeof text !== 'string') return null;
  return text.replace(/\s+/g, ' ').trim();
}

function stripHtml(text) {
  if (typeof text !== 'string') return null;
  return text.replace(/<[^>]*>/g, ' ');
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

function normalizeGenreNames(genreNames) {
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

async function upsertGenresForGame(gameId, genreNames) {
  const normalized = normalizeGenreNames(genreNames);
  if (!gameId || normalized.length === 0) return;

  const genresCtrl = new (require('./database/controllers/GenresController'))();
  const gameGenresCtrl = new gamesGenresConnnectionController();

  const existingRows = await gameGenresCtrl.getByGameId(gameId);
  const existingSet = new Set((existingRows || []).map((g) => String(g?.genre ?? '').trim().toLowerCase()).filter(Boolean));

  for (const genreName of normalized) {
    if (existingSet.has(genreName.toLowerCase())) continue;
    const genre = await genresCtrl.create({ genre: genreName });
    const genreId = Number(genre?.id);
    if (!Number.isFinite(genreId) || genreId <= 0) continue;
    try {
      await gameGenresCtrl.create({ game_id: Number(gameId), genre_id: genreId });
      existingSet.add(genreName.toLowerCase());
    } catch (err) {
      console.warn('Failed to attach genre to game', { gameId, genreName, err: err?.message });
    }
  }
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

  return normalizeGenreNames(raw);
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

async function fetchItchCoverUrl(appId) {
  const details = await fetchItchGameDetails(appId);
  return details?.cover_url ?? null;
}

async function fetchItchGameDetails(appId, { includeRaw = false, includePageDetails = false } = {}) {
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

/**
 * Fetch the user's itch.io library (owned games) using the API key.
 * Automatically fetches ALL pages and returns the complete list.
 * @returns {Promise<{ owned_keys: Array<{ game_id: number, game: object, download_key_id: number, created_at: string }>, total: number } | null>}
 */
async function fetchItchLibrary() {
  if (!itchApiKey) return null;

  const pageSize = 50;
  const allKeys = [];
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const endpoint = `https://itch.io/api/1/${itchApiKey}/my-owned-keys?page=${page}&page_size=${pageSize}`;
      const response = await fetch(endpoint);
      if (!response.ok) {
        if (page === 1) return null; // First page failed, return null
        break; // Subsequent page failed, return what we have
      }

      const payload = await response.json();
      if (!payload || typeof payload !== 'object') break;

      const ownedKeys = Array.isArray(payload.owned_keys) ? payload.owned_keys : [];
      if (ownedKeys.length === 0) {
        hasMore = false;
      } else {
        for (const key of ownedKeys) {
          allKeys.push({
            game_id: key.game_id ?? key.game?.id ?? null,
            download_key_id: key.download_key_id ?? key.id ?? null,
            created_at: key.created_at ?? null,
            game: key.game ? {
              id: key.game.id ?? null,
              title: key.game.title ?? null,
              url: key.game.url ?? null,
              cover_url: key.game.cover_url ?? key.game.still_cover_url ?? null,
              short_text: key.game.short_text ?? null,
              classification: key.game.classification ?? null,
              min_price: key.game.min_price ?? null,
              user: key.game.user ? {
                id: key.game.user.id ?? null,
                username: key.game.user.username ?? null,
                url: key.game.user.url ?? null,
              } : null,
            } : null,
          });
        }
        // If we got fewer than pageSize, we're done
        hasMore = ownedKeys.length >= pageSize;
        page++;
      }
    }

    return {
      owned_keys: allKeys,
      total: allKeys.length,
    };
  } catch (err) {
    console.warn('Failed to fetch itch library:', err?.message);
    return allKeys.length > 0 ? { owned_keys: allKeys, total: allKeys.length } : null;
  }
}

async function fetchGogGameDetails(appId, { includeRaw = false } = {}) {
  const numericAppId = Number(appId);
  if (!Number.isFinite(numericAppId) || numericAppId <= 0) return null;

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
    const bannerCandidate = getFirstStringByPaths(payload, [
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

    let cost = null;
    const finalPrice = payload?.price?.final;
    if (finalPrice != null) {
      const parsed = Number.parseFloat(String(finalPrice));
      if (Number.isFinite(parsed)) cost = parsed;
    }

    const genres = normalizeGenreNames(
      Array.isArray(payload?.genres)
        ? payload.genres.map((g) => (typeof g === 'string' ? g : g?.name))
        : []
    );

    const details = {
      id: numericAppId,
      app_id: numericAppId,
      title,
      cover_url: bannerImg,
      banner_img: bannerImg,
      description,
      min_price: cost,
      is_free: Number.isFinite(cost) ? cost <= 0 : false,
      genres,
      url: `https://www.gog.com/en/game/${numericAppId}`,
    };

    if (includeRaw) details.raw = payload;
    return details;
  } catch (err) {
    console.warn('Failed to fetch GOG game details:', { appId: numericAppId, err: err?.message });
    return null;
  }
}

async function ensureScrapedGameUploaded({ appId, platformName, name, bannerImg, description, cost, genreNames }) {
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

async function fetchItad(endpointPath, { method = 'GET', query = {}, body = null } = {}) {
  if (!itadApiKey) {
    throw new Error('Missing ITAD API key (ITAD_API_KEY)');
  }

  const params = new URLSearchParams();
  params.set('key', itadApiKey);
  for (const [k, v] of Object.entries(query || {})) {
    if (v == null || v === '') continue;
    params.set(k, String(v));
  }
  const querySuffix = params.toString() ? `?${params.toString()}` : '';
  const url = `https://api.isthereanydeal.com${endpointPath}${querySuffix}`;

  const response = await fetch(url, {
    method,
    headers: body == null ? { 'Accept': 'application/json' } : {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`ITAD ${endpointPath} HTTP ${response.status}: ${text}`);
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseNumericShopGameId(shopGameId) {
  if (shopGameId == null) return null;
  const asString = String(shopGameId).trim();
  if (!asString) return null;
  const match = asString.match(/(\d+)(?!.*\d)/);
  if (!match) return null;
  const numeric = Number(match[1]);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

async function fetchItadDealsDaily() {
  if (!itadApiKey) {
    console.log('Skipping ITAD sync: missing ITAD_API_KEY');
    return;
  }

  const shops = await fetchItad('/service/shops/v1', {
    query: { country: 'US' },
  });
  const allShops = Array.isArray(shops) ? shops : [];

  const targetPlatforms = [
    { itadShopName: 'steam', platformName: 'steam' },
    { itadShopName: 'gog', platformName: 'gog' },
    { itadShopName: 'itch.io', platformName: 'itch' },
  ];

  const matchedShops = targetPlatforms
    .map((target) => {
      const shop = allShops.find((s) => String(s?.title ?? '').trim().toLowerCase() === target.itadShopName);
      if (!shop?.id) return null;
      return {
        ...target,
        shopId: Number(shop.id),
      };
    })
    .filter(Boolean);

  if (matchedShops.length === 0) {
    console.log('Skipping ITAD sync: no matching shops found for steam/gog/itch.io');
    return;
  }

  const dealsResp = await fetchItad('/deals/v2', {
    query: {
      country: 'US',
      limit: 500,
      sort: '-cut',
      shops: matchedShops.map((s) => s.shopId).join(','),
      mature: 'false',
    },
  });
  const deals = Array.isArray(dealsResp?.list) ? dealsResp.list : [];
  if (deals.length === 0) {
    console.log('ITAD sync finished: no deals returned');
    return;
  }

  const gamesCtrl = new gamesController();
  const platformsCtrl = new platformsController();

  const platformByShopId = new Map();
  for (const matched of matchedShops) {
    const platform = await platformsCtrl.create({ name: matched.platformName });
    if (platform?.id) {
      platformByShopId.set(matched.shopId, {
        platformId: Number(platform.id),
        platformName: matched.platformName,
      });
    }
  }

  const itadIds = [...new Set(deals.map((d) => d?.id).filter(Boolean))];
  const appIdsByShopAndItadId = new Map();
  const itadGenresById = new Map();

  for (const itadId of itadIds) {
    try {
      const info = await fetchItad('/games/info/v2', { query: { id: itadId } });
      const tags = Array.isArray(info?.tags) ? info.tags : [];
      itadGenresById.set(itadId, normalizeGenreNames(tags));
    } catch (err) {
      itadGenresById.set(itadId, []);
    }
  }

  for (const [shopId, platformInfo] of platformByShopId.entries()) {
    try {
      const lookup = await fetchItad(`/lookup/shop/${shopId}/id/v1`, {
        method: 'POST',
        body: itadIds,
      });
      for (const itadId of Object.keys(lookup || {})) {
        const shopIds = Array.isArray(lookup[itadId]) ? lookup[itadId] : [];
        const numeric = parseNumericShopGameId(shopIds[0]);
        if (numeric) {
          appIdsByShopAndItadId.set(`${shopId}:${itadId}`, numeric);
        }
      }
    } catch (err) {
      console.warn('Failed ITAD lookup for shop/game id mapping', {
        shopId,
        platformName: platformInfo.platformName,
        err: err?.message,
      });
    }
  }

  let createdOrUpdated = 0;
  for (const dealEntry of deals) {
    const itadGameId = dealEntry?.id;
    const deal = dealEntry?.deal;
    const shopId = Number(deal?.shop?.id);
    const platformInfo = platformByShopId.get(shopId);
    if (!itadGameId || !platformInfo) continue;

    const appId = appIdsByShopAndItadId.get(`${shopId}:${itadGameId}`);
    if (!appId) continue;
    const itchDetails = platformInfo.platformName === 'itch'
      ? await fetchItchGameDetails(appId, { includePageDetails: true })
      : null;
    const genreNames = normalizeGenreNames([
      ...(itadGenresById.get(itadGameId) ?? []),
      ...(itchDetails?.genres ?? []),
    ]);

    const gameData = {
      app_id: appId,
      platform_id: platformInfo.platformId,
      name: dealEntry?.title ?? itchDetails?.title ?? String(appId),
      banner_img: await getPlatformBannerUrl({
        platformName: platformInfo.platformName,
        appId,
        fallbackBanner: getFirstStringByPaths(dealEntry, [
          ['assets', 'banner600'],
          ['assets', 'banner400'],
          ['assets', 'banner300'],
          ['assets', 'banner145'],
        ]) ?? itchDetails?.cover_url ?? '',
      }),
      description: itchDetails?.short_text ?? '',
      minimum_requirements: '',
      cost: deal?.price?.amount ?? itchDetails?.min_price ?? null,
      free: deal?.price?.amount === 0 || itchDetails?.is_free === true,
    };

    if (shouldSkipGameBecausePriceMissing(gameData, 'ITAD', gameData.name)) {
      continue;
    }

    const existingGameId = await gamesCtrl.getGameIdByAppIdAndPlatform(appId, platformInfo.platformId);
    if (existingGameId != null) {
      try {
        await gamesCtrl.dbConnection.execute(
          'UPDATE games SET name = ?, banner_img = ?, cost = ? WHERE id = ?;',
          [
            gameData.name,
            gameData.banner_img,
            gameData.cost,
            Number(existingGameId),
          ]
        );
        await upsertGenresForGame(Number(existingGameId), genreNames);
        createdOrUpdated++;
      } catch (err) {
        console.warn('Failed to update existing ITAD game', { appId, platformId: platformInfo.platformId, err: err?.message });
      }
      continue;
    }

    try {
      await gamesCtrl.uploadWithAll(gameData, null, genreNames);
      createdOrUpdated++;
    } catch (err) {
      console.warn('Failed to create ITAD game', { appId, platformId: platformInfo.platformId, err: err?.message });
    }
  }

  console.log('ITAD sync finished', {
    dealsFetched: deals.length,
    gamesCreatedOrUpdated: createdOrUpdated,
  });
}

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
        if (candidate.startsWith('//')) return `https:${candidate}`;
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

async function getPlatformBannerUrl({ platformName, appId, fallbackBanner }) {
  const normalizedPlatform = String(platformName ?? '').trim().toLowerCase();
  if (normalizedPlatform === 'steam') {
    return getSteamHeaderImageUrl(appId) ?? (fallbackBanner ?? '');
  }

  if (normalizedPlatform === 'itch' || normalizedPlatform === 'itch.io') {
    const itchCover = await fetchItchCoverUrl(appId);
    return itchCover ?? (fallbackBanner ?? '');
  }

  if (normalizedPlatform === 'gog') {
    const gogCover = await fetchGogCoverUrl(appId);
    return gogCover ?? (fallbackBanner ?? '');
  }

  return fallbackBanner ?? '';
}

function isTruthyFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes';
  }
  return false;
}

function hasPriceValue(cost) {
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

function isGameFree(gameLike) {
  if (isTruthyFlag(gameLike?.is_free) || isTruthyFlag(gameLike?.free)) {
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

function shouldSkipGameBecausePriceMissing(gameLike, sourceLabel, gameName) {
  const missingPrice = !hasPriceValue(gameLike?.cost);
  const hasFreeSignal = gameLike?.is_free != null || gameLike?.free != null;
  const free = isGameFree(gameLike);
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

async function upsertShopSpecialsFromIgdb({ trending = [], upcoming = [] } = {}) {
  // shop_specials.game_id references games.id, so we ensure the games exist first.
  // Prefer platform-specific records (gog/itch) over steam when IGDB provides multiple external ids.
  const platformsCtrl = new platformsController();

  const gamesCtrl = new gamesController();
  const shopSpecialsCtrl = new shopSpecialsController();

  // Priority mapping for IGDB external_games.category -> preferred platform name
  const IGDB_CATEGORY_PRIORITY = [
    { category: 5, platformName: 'gog' },
    { category: 11, platformName: 'itch' },
    { category: 1, platformName: 'steam' },
  ];

  function getPreferredPlatformFromIgdbGame(igdbGame) {
    const externalGames = igdbGame?.external_games;
    if (!Array.isArray(externalGames) || externalGames.length === 0) return null;

    for (const map of IGDB_CATEGORY_PRIORITY) {
      const eg = externalGames.find((e) => Number(e?.category) === map.category && (e?.uid || e?.url));
      if (!eg) continue;

      // Try to extract a numeric id if present, otherwise return raw uid/url as fallback
      let candidate = parseNumericShopGameId(eg.uid ?? eg.url ?? null);
      if (candidate == null && typeof eg.uid === 'string') {
        const m = eg.uid.match(/(\d+)(?!.*\d)/);
        if (m) candidate = Number(m[1]);
      }

      return { platformName: map.platformName, appId: candidate ?? (eg.uid ?? eg.url ?? null) };
    }
    return null;
  }

  async function verifyPlatformAppExists(platformName, appId) {
    try {
      if (!platformName || appId == null) return false;
      if (platformName === 'steam') return await verifySteamGameExists(appId);
      if (platformName === 'gog') {
        const details = await fetchGogGameDetails(appId, { includeRaw: false });
        return details != null;
      }
      if (platformName === 'itch' || platformName === 'itch.io' || platformName === 'itchio') {
        const details = await fetchItchGameDetails(appId, { includeRaw: false });
        return details != null;
      }
    } catch (err) {
      return false;
    }
    return false;
  }

  async function resolvePlatformId(platformName) {
    if (!platformName) return null;
    const p = await platformsCtrl.create({ name: platformName });
    return Number(p?.id) || null;
  }

  // Make sure DB connection is ready, then wipe existing specials.
  // Note: this will also remove any manually-managed flags (e.g. discounted).
  await shopSpecialsCtrl.ready;
  try {
    await shopSpecialsCtrl.dbConnection.execute('TRUNCATE TABLE shop_specials;');
  } catch (err) {
    // Some MySQL configs restrict TRUNCATE; fall back to DELETE.
    try {
      await shopSpecialsCtrl.dbConnection.execute('DELETE FROM shop_specials;');
    } catch (err2) {
      console.error('Failed to wipe shop_specials table:', err2);
      throw err2;
    }
  }

  async function ensureGameId(igdbGame) {
    if (shouldSkipGameBecausePriceMissing(igdbGame, 'IGDB', igdbGame?.name)) {
      return null;
    }
    const resolved = getPreferredPlatformFromIgdbGame(igdbGame);
    if (!resolved) {
      console.log('Skipping IGDB game: missing external platform ids:', {
        igdbId: igdbGame?.id,
        name: igdbGame?.name,
      });
      return null;
    }

    let { platformName, appId } = resolved;

    // Verify the chosen platform/app actually exists; if not, try fallbacks (steam last)
    let verified = await verifyPlatformAppExists(platformName, appId);
    if (!verified && platformName !== 'steam') {
      const steamAppId = getSteamAppIdFromIgdbGame(igdbGame);
      if (steamAppId) {
        verified = await verifyPlatformAppExists('steam', steamAppId);
        if (verified) {
          platformName = 'steam';
          appId = steamAppId;
        }
      }
    }

    if (!verified) {
      console.log('Skipping IGDB game: platform app verification failed:', {
        igdbId: igdbGame?.id,
        name: igdbGame?.name,
        attempted: { platformName, appId },
      });
      return null;
    }

    const genreNames = normalizeGenreNames((igdbGame?.genres ?? []).map((g) => g?.name));

    const platformId = await resolvePlatformId(platformName);
    if (!platformId) {
      console.log('Skipping IGDB game: failed to resolve platform id:', { platformName });
      return null;
    }

    const existingGameId = await gamesCtrl.getGameIdByAppIdAndPlatform(appId, platformId);
    if (existingGameId != null) {
      const numericExisting = Number(existingGameId);
      if (!Number.isFinite(numericExisting)) return null;

      const refreshedBanner = await getPlatformBannerUrl({
        platformName,
        appId,
        fallbackBanner: normalizeIgdbImageUrl(igdbGame?.cover?.url) ?? '',
      });
      if (typeof refreshedBanner === 'string' && refreshedBanner.trim()) {
        try {
          await gamesCtrl.dbConnection.execute(
            'UPDATE games SET banner_img = ? WHERE id = ?;',
            [refreshedBanner, numericExisting]
          );
          await upsertGenresForGame(numericExisting, genreNames);
        } catch (err) {
          console.warn('Failed to refresh existing IGDB game banner_img', {
            gameId: numericExisting,
            platformName,
            appId,
            err: err?.message,
          });
        }
      }

      return numericExisting;
    }

    const gameData = {
      app_id: appId,
      platform_id: platformId,
      name: igdbGame?.name ?? String(appId),
      banner_img: await getPlatformBannerUrl({
        platformName,
        appId,
        fallbackBanner: normalizeIgdbImageUrl(igdbGame?.cover?.url) ?? '',
      }),
      description: igdbGame?.summary ?? '',
      minimum_requirements: '',
      cost: null,
    };

    const created = await gamesCtrl.uploadWithAll(gameData, null, genreNames);
    const createdId = created?.id;
    const numericCreated = Number(createdId);
    if (!Number.isFinite(numericCreated)) {
      console.warn('Skipping IGDB game: created game missing numeric id', { platformName, appId, created });
      return null;
    }
    return numericCreated;
  }

  // Merge flags so each game_id is inserted once.
  const gameIdByAppId = new Map();
  const specialsByGameId = new Map();

  async function addSpecial(igdbGame, flags) {
    if (shouldSkipGameBecausePriceMissing(igdbGame, 'IGDB', igdbGame?.name)) return;

    const resolved = getPreferredPlatformFromIgdbGame(igdbGame);
    if (!resolved) {
      console.log('Skipping shop_special: missing external platform id for IGDB game:', {
        igdbId: igdbGame?.id,
        name: igdbGame?.name,
      });
      return;
    }

    const platformKey = `${resolved.platformName}:${resolved.appId}`;
    let gameId = gameIdByAppId.get(platformKey);
    if (gameId == null) {
      gameId = await ensureGameId(igdbGame);
      if (gameId == null) {
        console.warn('Skipping shop_special: could not resolve game id for IGDB game', { platformKey, name: igdbGame?.name });
        return;
      }
      gameIdByAppId.set(platformKey, gameId);
    }

    // Extra safety: ensure it's numeric before using as a DB foreign key.
    const numericGameId = Number(gameId);
    if (!Number.isFinite(numericGameId)) {
      console.warn('Skipping shop_special: non-numeric game id', { steamAppId, gameId });
      return;
    }
    gameId = numericGameId;

    const current = specialsByGameId.get(gameId) ?? {
      game_id: gameId,
      featured: false,
      coming_soon: false,
      discounted: false,
    };
    specialsByGameId.set(gameId, {
      ...current,
      featured: current.featured || !!flags.featured,
      coming_soon: current.coming_soon || !!flags.coming_soon,
      // discounted is not provided by IGDB sync; keep false on daily rebuild.
    });
  }

  for (const g of trending) {
    await addSpecial(g, { featured: true });
  }
  for (const g of upcoming) {
    await addSpecial(g, { coming_soon: true });
  }

  for (const special of specialsByGameId.values()) {
    const gameId = special?.game_id;
    if (gameId == null) {
      console.warn('Skipping shop_special insert: missing game_id', special);
      continue;
    }

    // Insert directly to avoid the current ShopSpecialsController.create() foreign-key check bug.
    await shopSpecialsCtrl.dbConnection.execute(
      'INSERT INTO shop_specials (game_id, featured, coming_soon, discounted) VALUES (?, ?, ?, ?);',
      [
        Number(gameId),
        special.featured ? 1 : 0,
        special.coming_soon ? 1 : 0,
        special.discounted ? 1 : 0,
      ]
    );
  }
}

// Main function
async function fetchGamesDaily() {
  try {
    igdbToken = await fetchIGDBToken();
    console.log('Fetched IGDB token successfully');
  } catch (err) {
    console.error('Failed to fetch IGDB token:', err);
    return;
  }

  console.log("Fetching games...");

  let trending = [];
  let upcoming = [];


  //#1 Popular games based on visits (can change later but eh)
  try{
  rows = await fetchIGDB(
    "popularity_primitives",
    "fields game_id,value,popularity_type; where popularity_type = (1,3,5,6) & value > 0; limit 500;"
  );
  console.log('Fetched popularity primitives successfully');
  const scores = {};
  const weights = {
  1:0.2,
  3:0.3,
  5:1,
  6:0.2
};
  for (const r of rows) {
  if (!weights[r.popularity_type]) continue;

  if (!scores[r.game_id]) scores[r.game_id] = 0;

  scores[r.game_id] += r.value * weights[r.popularity_type];
  }
  const ranked = Object.entries(scores)
  .map(([game_id, score]) => ({ game_id: Number(game_id), score }))
  .sort((a,b) => b.score - a.score)
  .slice(0,10);
  try{
  const ids = ranked.map(g => g.game_id).join(",")
  const trending = await fetchIGDB(
    "games",
    `fields name,external_games.category, external_games.uid,summary,genres.name,external_games.uid;
     where id = (${ids}) & external_games.category in (1,5,11);`
  );
  console.log('Fetched trending games successfully');
  console.log(trending.length);
  }catch(err){
    console.error('Failed to extract game IDs from popularity primitives:', err);
  }
  }catch(err){
    console.error('Failed to fetch popularity primitives from IGDB:', err);
  }
 


  // 1️⃣ Trending / Featured
  // try {
  //   trending = await fetchIGDB(
  //     "games",
  //     `fields id, name, summary, cover.url, genres.name, hypes, follows, external_games.category, external_games.uid;
  //      where external_games.category = 1;
  //      sort hypes desc;
  //      limit 100;`
  //   );
  //   console.log('Fetched trending games successfully');
  //   console.log(trending);

  //   for (const g of trending) {
  //     const steamAppId = getSteamAppIdFromIgdbGame(g);
  //     if (!steamAppId) {
  //       console.log('IGDB game missing Steam appid (external_games category=1):', {
  //         igdbId: g?.id,
  //         name: g?.name,
  //       });
  //     }
  //   }
  // } catch (err) {
  //   console.error('Failed to fetch trending games:', err);
  // }
  
  // 2️⃣ Coming Soon
  try {
    upcoming = await fetchIGDB(
      "games",
      `fields id, name, summary, cover.url, genres.name, first_release_date, external_games.category, external_games.uid;
       where first_release_date > ${Math.floor(Date.now() / 1000)} & external_games.category = 1;
       sort first_release_date asc;
       limit 100;`
    );
    console.log('Fetched upcoming games successfully');
    console.log(upcoming.length);
  } catch (err) {
    console.error('Failed to fetch upcoming games:', err);
  }

  try {
    await upsertShopSpecialsFromIgdb({ trending, upcoming });
    console.log('Uploaded IGDB specials to shop_specials successfully');
  } catch (err) {
    console.error('Failed to upload IGDB specials to shop_specials:', err);
  }

  try {
    await fetchItadDealsDaily();
  } catch (err) {
    console.error('Failed to sync ITAD deals:', err);
  }
}
// Run immediately
//fetchGamesDaily();

// Run every 24 hours
//setInterval(fetchGamesDaily, 24 * 60 * 60 * 1000);

async function getCountyIdByCode(countyCode) {
  const countyCtrl = new CountiesController();

  const countyData = await countyCtrl.getByCode(countyCode);
  if (countyData instanceof Error || !countyData?.id) {
    const id = await createCountyByCode(countyCode);

    if (!id) {
      return new Error({ message: "Error while adding new county to DB" });
    }
    return id;
  }

  return countyData.id;
}

async function createCountyByCode(countyCode) {
  try {
    const countyCtrl = new CountiesController();
    const resp = await fetch(`https://restcountries.com/v3.1/alpha/${countyCode.toLowerCase()}`);
    if (!resp.ok) {
      throw new Error(`restcountries API ${resp.status}: ${await resp.text()}`);
    }
    const body = await resp.json();
    const country = Array.isArray(body) ? body[0] : body;
    if (!country) throw new Error('No country data returned from restcountries');

    const name = country?.name?.common || null;
    let currencySymbol = null;
    const currencies = country?.currencies;
    if (currencies && typeof currencies === 'object') {
      const first = Object.values(currencies)[0];
      currencySymbol = first?.symbol ?? null;
    }

    const county = await countyCtrl.create({ name, code: countyCode, currency: currencySymbol });
    return county?.id ?? null;
  } catch (err) {
    throw err;
  }
}

async function getFormatedPrice(gameId, countyCode) {
  try {
    const pricesCtrl = new pricesController();
    const prices = pricesCtrl.getByGameId(gameId);
  
    let result;
    for( price in prices ){
      if (price.countyCode == countyCode.toLowerCase()) {
        result = price
      }
    }
    if ( !result ) {
      return new Error({ message: "No price with given countyCode" });
    }
    return String(parseFloat(result.price / 100)), " ", result.currency; 
  } catch (err) {
    throw err;
  }
}


// ------------------- Middleware ------------------ //

function tokenValidate(req) {
  return async (req, res, next) => {
    try {
      const auth = req.headers?.authorization;
      if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
      }
      const token = auth.slice('bearer '.length).trim();

      const parts = token.split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return res.status(401).json({ error: 'Invalid token format' });
      }

      const [userId, userUniqueToken] = parts;

      const nativeUserCtrl = new nativeUserController();
      const user = await nativeUserCtrl.show(userId);
      if (!user || user.token !== userUniqueToken) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      req.auth = { userId, user, token };

      return next();
    } catch (error) {
      console.error('Error in token validation:', error);
      return res.status(500).json({ error: 'Internal server error during token validation' });
    }
  };
}

// ------------------- API Endpoints ------------------ //



// -------------------     GET      ------------------ //

app.get('/api/itch/game/:appId', async (req, res) => {
  try {
    const { appId } = req.params;
    const numericAppId = Number(appId);
    if (!Number.isFinite(numericAppId) || numericAppId <= 0) {
      return res.status(400).json({ error: 'Invalid appId' });
    }

    const includeRaw = String(req.query?.raw ?? '').trim().toLowerCase() === 'true';
    const ensureUpload = req.query?.ensureUpload == null
      ? true
      : isTruthyFlag(req.query?.ensureUpload);
    const details = await fetchItchGameDetails(numericAppId, { includeRaw, includePageDetails: true });
    if (!details) {
      return res.status(404).json({ error: 'Itch game not found or ITCH_API_KEY missing' });
    }

    let upload = null;
    if (ensureUpload) {
      try {
        upload = await ensureScrapedGameUploaded({
          appId: numericAppId,
          platformName: 'itch',
          name: details.title,
          bannerImg: details.cover_url,
          description: details.description ?? details.short_text,
          cost: details.min_price,
          genreNames: details.genres,
        });
      } catch (uploadErr) {
        upload = { uploaded: false, gameId: null, reason: 'upload-error', error: uploadErr?.message || String(uploadErr) };
      }
    }

    const result = {
      ...details,
      description: details.description ?? details.short_text ?? null,
      description_source: details.description && details.description !== details.short_text ? 'page' : (details.short_text ? 'short_text' : null),
      upload,
    };

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/itch/library', async (req, res) => {
  try {
    const library = await fetchItchLibrary();
    if (!library) {
      return res.status(404).json({ error: 'Could not fetch itch.io library (ITCH_API_KEY may be missing)' });
    }
    return res.json(library);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/gog/game/:appId', async (req, res) => {
  try {
    const { appId } = req.params;
    const numericAppId = Number(appId);
    if (!Number.isFinite(numericAppId) || numericAppId <= 0) {
      return res.status(400).json({ error: 'Invalid appId' });
    }

    const includeRaw = String(req.query?.raw ?? '').trim().toLowerCase() === 'true';
    const ensureUpload = req.query?.ensureUpload == null
      ? true
      : isTruthyFlag(req.query?.ensureUpload);

    const details = await fetchGogGameDetails(numericAppId, { includeRaw });
    if (!details) {
      return res.status(404).json({ error: 'GOG game not found' });
    }

    let upload = null;
    if (ensureUpload) {
      try {
        upload = await ensureScrapedGameUploaded({
          appId: numericAppId,
          platformName: 'gog',
          name: details.title,
          bannerImg: details.banner_img ?? details.cover_url,
          description: details.description,
          cost: details.min_price,
          genreNames: details.genres,
        });
      } catch (uploadErr) {
        upload = { uploaded: false, gameId: null, reason: 'upload-error', error: uploadErr?.message || String(uploadErr) };
      }
    }

    return res.json({ ...details, upload });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/api/steam/profile_id/:vanityurl', async (req, res) => {
  try {
    const { vanityurl } = req.params;
    const response = await fetch(
      `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/?key=${steamApiKey}&vanityurl=${encodeURIComponent(vanityurl)}`
    );
    if (!response.ok) {
      return res.status(502).json({ error: 'Steam API error' });
    }
    const data = await response.json();
    if (data?.response?.success !== 1) {
      return res.status(404).json({ error: 'Vanity URL not found' });
    }
    return res.json({ steamid: data.response.steamid });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/steam/api/getOwnedGames', tokenValidate(), async (req, res) => { 
  try {
    const { userId } = req.auth;
    const platformUserCtrl = new platformUsersController();
    const platformUsers = await platformUserCtrl.getByNativeUserId(userId);
    const platformCtrl = new platformsController();
    const steamPlatform = await platformCtrl.getByPlatformName('steam');
    if (!steamPlatform) {
      return res.status(400).json(steamPlatform.error ?? { error: 'Steam platform not found in database' });
    }
    let ownedGames = [];
    for (const platformUser of platformUsers) {
      if (Number(platformUser.platform_id) === Number(steamPlatform.id)) {
        const steamApiUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${steamApiKey}&steamid=${platformUser.platform_profile_id}&format=json`;
        const response = await fetch(steamApiUrl);
        if (!response.ok) {
          console.error('Error fetching Steam API:', response.statusText);
          return res.status(500).json({ error: 'Failed to fetch data from Steam API' });
        }
        const data = await response.json();
        ownedGames.push(...data.response.games);
      }
    }
    if (ownedGames.length === 0) {
      return res.status(400).json({ error: 'No owned games found for this user on Steam' });
    }
    return res.json({ ownedGames });
  } catch (error) {
    console.error('Error in /steam/api/getOwnedGames endpoint:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/*
  route: /api/platform/user_id/:platformname/:platformUsername
  params: platformname (string), platformUsername (string)
  headers: auth token
  body: -

  returns: { platform_users.id }
*/
app.get('/steam/api/getOwnedGames', tokenValidate(), async (req, res) => { 
  try {
    const { userId } = req.auth;
    const platformUserCtrl = new platformUsersController();
    const platformUsers = await platformUserCtrl.getByNativeUserId(userId);
    const platformCtrl = new platformsController();
    const steamPlatform = await platformCtrl.getByPlatformName('steam');
    if (!steamPlatform) {
      return res.status(400).json(steamPlatform.error ?? { error: 'Steam platform not found in database' });
    }
    const ownedGames = [];
    for (const platformUser of platformUsers) {
      if (Number(platformUser.platform_id) === Number(steamPlatform.id)) {
        const steamApiUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${steamApiKey}&steamid=${platformUser.platform_profile_id}&include_appinfo=true`;
        const response = await fetch(steamApiUrl);
        if (!response.ok) {
          console.error('Error fetching Steam API:', response.statusText);
          return res.status(500).json({ error: 'Failed to fetch data from Steam API' });
        }
        const data = await response.json();
        ownedGames.push(...data.response.games);
      }
    }
    if (ownedGames.length === 0) {
      return res.status(400).json({ error: 'No owned games found for this user on Steam' });
    }
    return res.json({ ownedGames });
  } catch (error) {
    console.error('Error in /steam/api/getOwnedGames endpoint:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/platform/user_id/:platformname/:platformUsername', tokenValidate(), async (req, res) => {
    try {
        const { platformname, platformUsername } = req.params;

        // Extract user ID from token (format: id.token)
        const { userId } = req.auth;
        
        // Get platform users for this native user
        const platformUserCtrl = new platformUsersController();
        const platformUsers = await platformUserCtrl.getByNativeUserId(userId);
        
        if (!platformUsers || platformUsers.length === 0) {
            return res.status(404).json({ error: 'No platform users found for this user' });
        }
        
        // Resolve platform id from platform name
        const platformsCtrl = new platformsController();
        const platform = await platformsCtrl.getByPlatformName(platformname);
        if (!platform) {
          return res.status(404).json({ error: `Unknown platform: ${platformname}` });
        }

        // Find the matching platform user (platform_users has platform_id, not platform_name)
        const index = platformUsers.findIndex(
          row => row.platform_user_name == platformUsername && Number(row.platform_id) === Number(platform.id)
        );
        if (index === -1) {
            return res.status(404).json({ error: `Platform user not found for ${platformname}:${platformUsername}` });
        }
        
        const platformUserID = platformUsers[index].platform_profile_id;    
        return res.json({ platformUserID: platformUserID });
    } catch (error) {
        console.error("Error in /api/platform/UserID endpoint:", error);
        res.status(500).json({ error: error.message });
    }
});

/*
  route: /api/games/:id
  params: games.id
  headers: -
  body: -

  returns: 
    {
      games.id,
      games.app_id,
      games.platform_id,
      games.name,
      games.banner_img,
      games.description,
      games.minimum_requirements,
      games.cost
    }
*/
app.get("/api/games/:id", async (req, res) => { //nem biztos hogy kell használni, ha van /games/:id/all -> a libary-hoz.
  try {
    const { id: gameId } = req.params;
    const gameCtrl = new gamesController();
    const game = await gameCtrl.show(gameId);
    return res.json(game);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  }
});

/*
  route: /api/games/app/:appId/all
  params: games.app_id (platform-specific id, e.g. Steam appid)
  headers: -
  body: -

  returns:
    Same shape as /api/games/:id/all.
*/
app.get("/api/games/platform/:appId/all", async (req, res) => {
  try {
    const { appId } = req.params;
    const appIdNum = Number(appId);
    if (!Number.isFinite(appIdNum) || appIdNum <= 0) {
      return res.status(400).json({ error: `Invalid appId: ${String(appId)}` });
    }

    const gameCtrl = new gamesController();
    const gameId = await gameCtrl.getGameIdByAppId(appIdNum);
    if (!gameId) {
      return res.status(404).json({ error: `Game not found by appId: ${appIdNum}` });
    }

    const game = await gameCtrl.getWithAllForeign(gameId);
    if (!game) {
      return res.status(404).json({ error: `Game not found: ${gameId}` });
    }

    const gamesGenresCtrl = new gamesGenresConnnectionController();
    const gameGenres = await gamesGenresCtrl.getByGameId(gameId);
    game.genres = gameGenres;

    const gamesPirateSitesConnCtrl = new gamesPirateSitesConnectionController();
    const pirateSites = await gamesPirateSitesConnCtrl.getConnectionsByGameId(gameId);
    game.pirate_sites = pirateSites;

    return res.json(game);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/*
  route: /api/games/:id
  params: games.id
  headers: -
  body: -

  returns: 
    {
      games.id,
      games.app_id,
      games.platform_id,
      games.name,
      games.banner_img,
      games.description,
      games.minimum_requirements,
      games.cost
    }
*/
app.get("/api/games/:id/all", async (req, res) => {
  try {
    const {id: gameId } = req.params;
    const gameCtrl = new gamesController();
    const game = await gameCtrl.getWithAllForeign(gameId);

    if (!game) {
      return res.status(404).json({ error: `Game not found: ${gameId}` });
    }

    const gamesGenresCtrl = new gamesGenresConnnectionController();
    const gameGenres = await gamesGenresCtrl.getByGameId(gameId);
    game.genres = gameGenres;

    return res.json(game);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  }
});

app.get("/api/games/list/:platformId/all/:from", async (req, res) => {
  try {
    const { platformId, from } = req.params;
    const countyCode = req.body.countyCode ?? "de";
    const gameCtrl = new gamesController();
    const games = gameCtrl.getAllGamesByPlatformFrom(countyCode, platformId, from);

    if (games instanceof Error) {
      res.status(404).json({ error: games.message });
    }
    return res.json(games);
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
});

app.get("/api/games/list/:from", async (req, res) => {
  try {
    const { from } = req.params;
    const countyCode = req.body.county_code ?? "de";

    const gamesCtrl = new gamesController();
    const games = await gamesCtrl.getAllGamesFrom(countyCode, from);

    return res.json(games);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  }
});

app.get("/api/search/:needle", async (req, res) => {
  try {
    const { needle } = req.params;
    const gameCtrl = new gamesController();
    const result = gameCtrl.search(needle);
    if (result instanceof Error) {
      return res.status(400).json({ error: result.error });
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/*
  route: /api/friends/:nativeUserId
  params: native_users.id
  headers: -
  body: -

  returns: 
    {
      {friends.id, native_user.id}
      {friends.id, native_user.id}
      .
      .
      .
    }
*/
app.get("/api/friends/:nativeUserId", async (req, res) => {
  try {
    const { nativeUserId } = req.params;
    const friendsCtrl = new friendsController();
    const friendsRaw = await friendsCtrl.getFriendsByNativeUserId(nativeUserId);

    const friends = [];
    friendsRaw.forEach(friend => {
      friends.push({
        id: friend.id,
        user_id: (Number(friend.user1_id) !== Number(nativeUserId)) ? friend.user1_id : friend.user2_id
      });
    });

    return res.json(friends);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  } 
});

/*
  route: /api/nativeUser/
  params: -
  headers: auth token
  body: -

  returns: 
    {
      native_user.id,
      native_user.token,
      native_user.user_password,
      native_user.email,
      native_user.bio,
      native_user.pfp
    }
*/
app.get("/api/nativeUser", tokenValidate(), async (req, res) => {
  try {
    const { userId } = req.auth;
    const nativeUserCtrl = new nativeUserController();
    const user = await nativeUserCtrl.show(userId);
    return res.json(user);
  } catch (err) {
      return res.status(500).json({ error: err.message });
  }
});


/*
  route: /api/chat/:friendsId
  params: friends.id
  headers: -
  body: from (int, the number where we want to see the messages from)

  returns: 
    {
      [0] {chats.id, chats.friends_id, chats.message, chats.sender_id},
      [1] {chats.id, chats.friends_id, chats.message, chats.sender_id},
      .
      .
      .
      [9] {chats.id, chats.friends_id, chats.message, chats.sender_id},
    }
*/
app.get("/api/chat/:friendsId", async (req, res) => {
  try {
    const { friendsId } = req.params;
    const { from } = req.body;
    const chatsCtrl = new chatsController();
    const chatLog = await chatsCtrl.getByFriedsId(friendsId, from);
    return res.json(chatLog);
  } catch (error) {
    console.error('Error in /api/chat endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/platforms/:platformName", async (req, res) => {
  try {
    const { platformName } = req.params;
    const platformCtrl = new platformsController();
    const result = await platformCtrl.getByPlatformName(platformName);
    if (result instanceof Error) {
      return res.status(400).json({ message: 'Iternal server error', error: result });
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/platform_users", tokenValidate(), async (req, res) => {
  try {
    const { userId } = req.auth;
    const platformUserCtrl = new platformUsersController();
    const result = await platformUserCtrl.getByNativeUserId(userId);
    if (result instanceof Error) {
      return res.status(400).json({ message: 'Iternal server error', error: result });
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/shop_specials/:filter/:from", async (req, res) => {
  try {
    const { filter, from } = req.params;
    const shopSpecialsCtrl = new shopSpecialsController();
    let result = await shopSpecialsCtrl.getFilteredGamesFrom(filter, from);
    if (result instanceof Error) {
      return res.status(400).json({ message: 'Iternal server error', error: result });
    }
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } 
});

// -------------------     POST      ------------------ //

/*
  route: /api/login/:username/:password
  params: -
  headers: username, password
  body: -

  returns: 
    {
      user auth token (user.id + user.token)
    }
*/
app.post('/api/login/:username/:password', async (req, res) => {
  try {
    const nativeUserCtrl = new nativeUserController();

    const { username, password } = req.params;
    const user = await nativeUserCtrl.getUserByNameAndPassword(username, password);
    console.log("User found:", user);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    await nativeUserCtrl.update(user.id, {token: true});
    const updatedUser = await nativeUserCtrl.show(user.id);
    
    return res.json(user.id + "." + updatedUser.token);
  } catch (error) {
    console.error('Error in /api/login endpoint:', error);
    res.status(500).json({ error: error.message });
  }
});

/*
  route: /api/signup/
  params: -
  headers: -
  body: username, password, email

  returns: 
    {
      {
        native_user.id,
        native_user.token,
        native_user.user_password,
        native_user.email,
        native_user.bio,
        native_user.pfp
      }
      {
        user auth token (user.id + user.token)
      }
    }
*/
app.post('/api/signup', async (req, res) => {
  try {
    const nativeUserCtrl = new nativeUserController();

    const { username, password, email } = req.body;

    const existingUser = await nativeUserCtrl.getUserByNameAndPassword(username, password);

    if (existingUser) {
      return res.status(400).json({ error: 'Username already exists' });
    }

    const userData = {
      "name": username,
      "user_password": password,
      "email": email,
    };

    const newUser = await nativeUserCtrl.create(userData);
    return res.status(201).json({newUser, token: newUser.id + "." + newUser.token});
  } catch (error) {
    console.error('Error in /api/signup endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});

/*
  route: /api/games/
  params: -
  headers: auth token
  body: app_id, platform_id || platfrom_name, name, banner_img, description, minimum_requirements, cost, genre_names[]

  returns: 
    {
      message: 'Game uploaded successfully', gameId: uploadedGame.id
    }
*/
app.post("/api/games", tokenValidate(), async (req, res) => {
  try {
    if (shouldSkipGameBecausePriceMissing(req.body, 'upload', req.body?.name)) {
      return res.status(200).json({ message: 'Skipped upload: non-free game is missing price.' });
    }

    const gameCtrl = new gamesController();
    const existingGameId = await gameCtrl.getGameIdByAppId(req.body.app_id);
    if (existingGameId != null) {
      return res.status(400).json({ message: 'Game with the same app_id already exists', gameId: existingGameId });
    }

    const platformName = req.body.platform_name ?? null;
    // Backward-compatible: accept the old misspelled key too.
    const platformId = req.body.platform_id ?? req.body.platfomr_id ?? null;
    if (platformId == null && platformName == null) {
      return res.status(400).json({
        message: 'Cannot upload, no data for platform. Please give platform_name or platform_id.'
      });
    }

    let resolvedPlatformName = platformName;
    if (!resolvedPlatformName && platformId != null) {
      try {
        const platformsCtrl = new platformsController();
        const platform = await platformsCtrl.show(platformId);
        resolvedPlatformName = platform?.platform_name ?? null;
      } catch (resolveErr) {
        console.warn('Failed to resolve platform name by platform_id for banner URL:', {
          platformId,
          err: resolveErr?.message,
        });
      }
    }

    const fallbackBanner = req.body.banner_img ?? null;
    const platformBannerImg = await getPlatformBannerUrl({
      platformName: resolvedPlatformName,
      appId: req.body.app_id,
      fallbackBanner,
    });

    const gameData = {
      app_id: req.body.app_id,
      platform_id: platformId,
      platform_name: platformName,
      name: req.body.name,
      banner_img: platformBannerImg,
      description: req.body.description ?? null,
      minimum_requirements: req.body.minimum_requirements ?? null,
    };

    let { county_code: countyCode, genre_names: genreNames } = req.body;
    if ((!Array.isArray(genreNames) || genreNames.length === 0) && String(resolvedPlatformName ?? '').trim().toLowerCase() === 'itch') {
      const itchDetails = await fetchItchGameDetails(req.body.app_id, { includePageDetails: true });
      genreNames = normalizeGenreNames(itchDetails?.genres ?? []);
    }

    const gamesCtrl = new gamesController();
    const pricesCtrl = new pricesController();
    const uploadedGame = await gamesCtrl.uploadWithAll(gameData, null, genreNames);

    const countyId = getCountyIdByCode(countyCode);

    const uploadPrice = await pricesCtrl.create({"gameId": uploadedGame.id, "countyId": countyId, "price": price});
    return res.status(201).json({ message: 'Game uploaded successfully', gameId: uploadedGame.id });
  } catch (err) {
    console.error('Error in /api/games/upload endpoint:', err);
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/prices", tokenValidate(), async (req, res) => {
  try {
    const { price, county_code: countyCode, game_id: gameId } = req.body;
    const pricesCtrl = new pricesController();
  
    const countyId = await getCountyIdByCode(countyCode);
    const uploadPrice = await pricesCtrl.create({"gameId": gameId, "countyId": countyId, "price": price});

    return res.status(201).json({ message: `Price to game (id: ${gameId}) upladed succesfully`});
  } catch (err) {
    console.error('Error in /api/games/upload endpoint:', err);
    return res.status(500).json({ error: err.message });
  }
})

/*
  route: /api/friends/
  params: -
  headers: auth token
  body: friendUserid (native_user.id)

  returns: 
    {
      message: "frinedship created", id: result.id
    }
*/
app.post("/api/friends", tokenValidate(), async (req, res) => {
  try {
    const { userId } = req.auth;
    const { friendUserId } = req.body;

    const friendsCtrl = new friendsController();
    const result = await friendsCtrl.create({ user1_id: userId, user2_id: friendUserId });
    if (result.message.includes('already exists') || result instanceof Error) {
      return res.status(400).json({ message: result.message });
    }
    return res.status(201).json({message: "frinedship created", id: result.id});
  } catch (error) {
    console.error('Error in /api/friends endpoint:', error);
    return res.status(500).json({ error: error.message }); 
  }
});

app.post("/api/platforms", tokenValidate(), async (req, res) => {
  try {
    const { platformName } = req.body;

    const platformCtrl = new platformsController();
    const result = await platformCtrl.create({name: platformName});
    if( result instanceof Error ) {
      return res.status(400).json({ message: result.message });
    }
    return res.status(201).json({message: "platform uploaded", id: result.id})
  } catch (err) {
    console.log('Error in /api/platforms endpoint:', err);
    return res.status(500).json({ error: err.message });
  }
})

app.post("/api/platform_users", tokenValidate(), async (req, res) => {
  try {
    const { userId } = req.auth;

    const { platformUserName, platformId, platfProfId, platformPassword } = req.body || {};
    const missing = [];
    if (platformUserName == null) missing.push('platformUserName');
    if (platformId == null) missing.push('platformId');
    if (platfProfId == null) missing.push('platfProfId');
    if (platformPassword == null) missing.push('platformPassword');
    if (missing.length) {
      return res.status(400).json({ message: 'Missing required fields', missing });
    }

    const data = {
      "native_user_id": userId,
      "platform_user_name": platformUserName,
      "platform_id": platformId,
      "platform_profile_id": platfProfId,
      "platform_password": platformPassword,
    }

    const platformUserCtrl = new platformUsersController();
    const result = await platformUserCtrl.create(data);
    if( result instanceof Error ) {
      return res.status(400).json({ message: result.message });
    }
    return res.status(201).json({ message: "platform user uploaded", id: result.id });
  } catch (err) {
    console.log('Error in /api/platform_users endpoint:', err);
    return res.status(500).json({ error: err.message });
  }
})

app.post("/api/counties", tokenValidate(), async (req, res) => {
  const { code } = req.body;
  try {

    const id = await createCountyByCode(code);
    if ( id instanceof Error ) {
      return res.status(400).json({ message: res.message });
    }
    return res.status(201).json({ message: "county uploaded", id: id});
  } catch (err) {
    console.log('Error in /api/county endpoint:', err);
    return res.status(500).json({ error: err.message });
  }
});

// -------------------      PUT       ------------------ //

app.put("/api/pirate_sites/:gameId", async (req, res) => {
  try {
    const {gameId} = req.params;
    const {link, siteId, siteName} = req.body;
    const gamesPirateSitesConnCtrl = new gamesPirateSitesConnectionController();
    const data = {
      "game_id": gameId,
      "pirate_site_id": siteId ?? null,
      "site_name": siteName ?? null,
      "link": link,
    }
    const result = await gamesPirateSitesConnCtrl.createWithAll(data);
    if (result instanceof Error) {
      return res.status(400).json({ message: result.message });
    }
    return res.json(result);
  } catch (err) {
    console.error('Error in /api/pirate_sites/:gameId/siteId endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});
/*
  route: /api/login/
  params: -
  headers: auth token
  body: token, name, user_password, email

  returns: 
    {
      native_user.id,
      native_user.token,
      native_user.name
      native_user.user_password,
      native_user.email,
      native_user.bio,
      native_user.pfp
    }
*/
app.put("/api/login", tokenValidate(), async (req, res) => {
  try {
    const { userId } = req.auth;
    const nativeUserCtrl = new nativeUserController();
    const updatedUser = await nativeUserCtrl.update(userId, req.body);
    if (updatedUser instanceof Error) {
      return res.status(400).json({ message: updatedUser.message });
    }
    return res.json(updatedUser);
  } catch (error) {
    console.error('Error in /api/nativeUser/:id endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});

/*
  route: /api/games/:id
  params: game id
  headers: -
  body: app_id, platform_id, name, banner_img, description || null, minimum_requirements || null

  returns: 
    {
      game.id,
      game.app_id,
      game.platform_id,
      game.name,
      game.banner_img,
      game.description,
      game.minimum_requirements
    }
*/
app.put("/api/games/:id", async (req, res) => {
  try {
    const { id: gameId } = req.params;

    const gameData = {
      "app_id": req.body.app_id,
      "platform_id": platformId,
      "name": req.body.name,
      "banner_img": req.body.banner_img,
      "description": req.body.description ?? null,
      "minimum_requirements": req.body.minimum_requirements ?? null,
      "cost": req.body.cost ?? null,
    }

    const gamesCtrl = new gamesController();
    const updatedGame = gamesCtrl.update(gameId, gameData);
    if (updatedGame instanceof Error) {
      return res.status(400).json({ message: updatedGame.message });
    }
    return res.json(updatedGame);
  } catch (err) {
    console.error('Error in /api/games/:id endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.put("/api/shop_specials/:gameId", async (req, res) => {
  try {
    const { gameId } = req.params;
    const { featured, coming_soon, discounted } = req.body;
    const shopSpecialsCtrl = new shopSpecialsController();
    const result = await shopSpecialsCtrl.update(gameId, { "featured": featured, "coming_soon": coming_soon, "discounted": discounted });
    if (result instanceof Error) {
      return res.status(400).json({ message: result.message });
    }
    return res.json(result);
  } catch (err) {
    console.error('Error in /api/shop_specials/:gameId endpoint:', error);
    return res.status(500).json({ error: error.message });
  } 
});

app.put("/api/pirate_sites/:gameId/siteId", async (req, res) => {
  try {
    const {gameId, siteId} = req.params;
    const {link} = req.body;
    const gamesPirateSitesConnCtrl = new gamesPirateSitesConnectionController();
    const result = await gamesPirateSitesConnCtrl.update(gameId, siteId, link);
    if (result instanceof Error) {
      return res.status(400).json({ message: result.message });
    }
    return res.json(result);
  } catch (err) {
    console.error('Error in /api/pirate_sites/:gameId/siteId endpoint:', error);
    return res.status(500).json({ error: error.message });
  }
});

// -------------------     DELETE     ------------------ //

/*
  route: /api/nativeUser/:friendShipId
  params: friends.id
  headers: auth token
  body: -

  returns: 
    {
      message
    }
*/
app.delete("/api/friends/:friendShipId", tokenValidate(), async (req, res) => {
  try {
    const { friendShipId } = req.params;

    const friendsCtrl = new friendsController();
    const result = await friendsCtrl.delete(friendShipId);
    if (result instanceof Error) {
      return res.status(400).json({ message: result.message });
    }
    return res.status(201).json({});
  } catch (err) {
    console.error('Error in /api/friends endpoint:', err);
    return res.status(500).json({ error: err.message }); 
  }
});

app.delete("/api/platform_user/:platfromUserId", tokenValidate(), async (req, res) => {
  try {
    const { userId } = req.auth;
    const { id } = req.params;

    const platformUserCtrl = new platformUsersController();
    const result = await platformUserCtrl.deleteByNativeUserId(id, userId);
    if (result instanceof Error) {
      return res.status(400).json({ message: result.message });
    }
    if (!result.deleted) {
      return res.status(404).json({
        message: 'Platform user not found for authenticated user',
        ...result,
      });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error("Error in /api/platform_user endpoint:", err);
    return res.status(500).json({error: err.message});
  }
});

app.delete("/api/native_user", tokenValidate(), async (req, res) => {
  try {
    const { userId } = req.auth;

    const natvieUserCtrl = new NativeUsersController();
    const result = await natvieUserCtrl.delete(userId);
    return res.status(201).json({});
  } catch (err) {
    console.error("Error on /api/native_user endpoint:", err);
    return res.status(500).json({error: err.message});
  }
});