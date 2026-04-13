const { getPlatformBannerUrl, normalizeGenreNames, normalizePlatformName, fetchGogGameDetails, fetchItchGameDetails, fetchSteamGameDetails } = require('./apiHelpers.js');

let ITAD_API_KEY=process.env.ITAD_API_KEY || null;
let ITAD_CLIENT_ID=process.env.ITAD_CLIENT_ID || null;
let ITAD_CLIENT_SECRET=process.env.ITAD_CLIENT_SECRET || null;
let IGDB_CLIENT_ID=process.env.IGDB_CLIENT_ID || null;
let IGDB_CLIENT_SECRET=process.env.IGDB_CLIENT_SECRET || null;

//------------ Utility functions ------------------//
//not necessary to use as itad should run only daily and 1000 calls is still fine without retry, but better to be safe than sorry
// Robust fetch helper that respects 429 Retry-After and retries transient 5xx errors.
// Simple sleep helper used by retry/backoff logic
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Number(ms) || 0));
}
async function fetchWithRateHandling(url, opts = {}, maxRetries = 6, initialBackoffMs = 2000) {
  let attempt = 0;
  let backoff = Number(initialBackoffMs) || 1000;
  while (true) {
    let res;
    try {
      res = await fetch(url, opts);
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await sleep(backoff);
      attempt++;
      backoff = Math.min(backoff * 2, 30000);
      continue;
    }
    if (res.ok) return res;
    // Respect explicit Retry-After header on 429
    if (res.status === 429 && attempt < maxRetries) {
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
      await sleep(waitMs);
      attempt++;
      backoff = Math.min(backoff * 2, 30000);
      continue;
    }
    // Retry for transient server errors
    if (res.status >= 500 && res.status < 600 && attempt < maxRetries) {
      await sleep(backoff);
      attempt++;
      backoff = Math.min(backoff * 2, 30000);
      continue;
    }
    // Non-retryable or out of retries: return response for caller to handle
    return res;
  }
}

//------------------- Main Shop Specials Function ------------------//
//Check if any non itad is discounted by itadfetchgame or sth
module.exports.getShopSpecials = async function getShopSpecials(){
  ITAD_API_KEY=process.env.ITAD_API_KEY || null;
ITAD_CLIENT_ID=process.env.ITAD_CLIENT_ID || null;
ITAD_CLIENT_SECRET=process.env.ITAD_CLIENT_SECRET || null;
IGDB_CLIENT_ID=process.env.IGDB_CLIENT_ID || null;
IGDB_CLIENT_SECRET=process.env.IGDB_CLIENT_SECRET || null;
  const token = await fetchIGDBToken();
  const popularGames = await fetchPopularGamesFromIGDB(400, token);//400
  const upcomingGames = await fetchUpcomingGamesFromIGDB(400, token);//400
  const itadDeals = await fetchItadDealsBulk(500);//500

// Merge the three lists into a single list of unique games, using appId or igdbId as the key. If a game appears in multiple lists, merge their properties and take the best values for popularityScore and discount.
const keyFor = (item) => {
  const shop = item.shop ? String(item.shop).toLowerCase() : 'unknown';

  if (item.appId) {
    return `app:${shop}:${item.appId}`;
  }

  if (item.igdbId) {
    return `igdb:${item.igdbId}`;
  }

  if (item.name) {
    return `name:${item.name.toLowerCase().trim()}`;
  }

  return null;
};
  const merged = new Map();

  const mergeInto = item => {
    const key = keyFor(item);
    const prev = merged.get(key) || {};
    merged.set(key, {
      app_id: prev.app_id ?? item.app_id ?? null,
      igdbId: prev.igdbId ?? item.igdbId ?? null,
      name: prev.name ?? item.name ?? null,
      genres: [...new Set([...(prev.genres || []), ...(item.genres || [])])],
      headerImageUrl: prev.headerImageUrl ?? item.headerImageUrl ?? null,
      description: prev.description ?? item.description ?? "",
      minimum_requirements: prev.minimum_requirements ?? item.minimum_requirements ?? null,
      shop: prev.shop ?? item.shop ?? null,
      country_code: prev.country_code ?? item.country_code ?? 'DE',
      cost: Math.max(Number(prev.cost ?? -1), Number(item.cost ?? -1)),
      // merge the three target fields and ensure a numeric default
      popularityScore:  Math.max(Number(prev.popularityScore ?? 0), Number(item.popularityScore ?? 0)),
      upcoming: (prev.upcoming ? 1 : 0) || (item.upcoming ? 1 : 0) ? 1 : 0,
      discount: Math.max(Number(prev.discount ?? 0), Number(item.discount ?? 0))
    });
  };
  popularGames.filter(Boolean).forEach(mergeInto);
  upcomingGames.forEach(mergeInto);
  itadDeals.forEach(mergeInto);

  const combined = Array.from(merged.values()).map(g => ({
    ...g,
    popularityScore: Number(g.popularityScore ?? 0),
    upcoming: Number(g.upcoming ?? 0),
    discount: Number(g.discount ?? 0)
  }));
  const duplicates = combined.filter(g => g.name === 'Divinity: Original Sin II');
  return combined;
}



//------------------- IGDB API ------------------//
/**
 * Fetches an access token from the IGDB API.
 * @returns {Promise<string>} The token values that the api returns
 */
async function fetchIGDBToken() {
  try {
    const url = `https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials`;
    const response = await fetchWithRateHandling(url, { method: 'POST' }, 4, 2000);
    if (!response || !response.ok) {
      const txt = response ? await response.text().catch(()=>null) : null;
      throw new Error(`IGDB token fetch failed HTTP ${response ? response.status : 'no-response'}: ${txt}`);
    }
    const data = await response.json();
    return data.access_token;
  } catch (err) {
    console.error('Error fetching IGDB token:', err);
    throw err;
  }
}
/**
 * A simple helper to query IGDB endpoints with the provided query string. Remember to call fetchIGDBToken() first to set the igdbToken variable.
 * @param {string} endpoint for example "games", "popularity_types", etc...
 * @param {string} query The body of the api call to IGDB, for example: `fields id,name; where id = 123;` You can find more about the query syntax in the IGDB API documentation.
 * @returns {Promise<any>} whatever the api returns
 */
async function fetchIGDB(endpoint, query, token = null) {
  if (!IGDB_CLIENT_ID) {
    throw new Error('Missing IGDB client id (IGDB_CLIENT_ID)');
  }
  if (!token) {
    throw new Error('Missing IGDB token; fetchIGDBToken() must run first');
  }
  const url = `https://api.igdb.com/v4/${endpoint}`;
  const opts = {
    method: 'POST',
    headers: {
      'Client-ID': IGDB_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain',
      'Accept': 'application/json',
    },
    body: query,
  };

  const response = await fetchWithRateHandling(url, opts, 4, 2000);
  const text = response ? await response.text().catch(()=>null) : null;
  if (!response || !response.ok) {
    throw new Error(`IGDB ${endpoint} HTTP ${response ? response.status : 'no-response'}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
/**
 * Fetches popular games from the IGDB API based on a weighted popularity score.
 * @param {number} limit  I wouldnt give it a smaller number than 10, igdb works funnily, also can sometimes break with very big numbers
 * @returns {Promise<Array>} An array of normal game models extended with the popularity score that is calculated differently than how igdb does it as it isn't the best.
 */
async function fetchPopularGamesFromIGDB(limit = 10, token = null) {    
  const body = `fields game_id,value,popularity_type; sort value desc; limit ${limit}; where popularity_type = (1,3,5,6);` ;
  try {
    let data = await fetchIGDB("popularity_primitives", body, token);
    const popularityWeights = {
      1:0.5,
      3:1,
      5:3,
      6:4
    };
    const scoreMap = new Map();
    for (const row of data) {
      const gid = Number(row.game_id);
      if (!Number.isFinite(gid)) continue;
      const val = Number(row.value) || 0;
      const wt = Number(popularityWeights[row.popularity_type] ?? 0.5); // fallback weight
      const entry = scoreMap.get(gid) || { weightedSum: 0, weightSum: 0, raw: [] };
      entry.weightedSum += val * wt;
      entry.weightSum += wt;
      entry.raw.push(row);
      scoreMap.set(gid, entry);
    }
    const ranked = Array.from(scoreMap.entries())
      .map(([game_id, e]) => ({
        game_id,
        weightedSum: e.weightedSum
      }))
      .sort((a, b) => b.weightedSum - a.weightedSum);
      const scoreLookup = new Map(ranked.map(r => [r.game_id, r.weightedSum]));
      let games = await fetchIGDBGameDetails(ranked.map(r => r.game_id), token);
      if (!Array.isArray(games)) games = [];
      games = games.filter(Boolean);
      for (const g of games) {
        try {
          g.popularityScore = scoreLookup.get(g.igdbId) ?? 0;
        } catch (err) {
          // defensive: skip malformed entries
        }
      }
      return games;
  } catch (err) {
    console.error('Error fetching popular games from IGDB:', err);
    throw err;
  }
}
/**
 * Fetches upcoming games from the IGDB API based on release dates in the future. Note that not all games have release dates, so this is not a comprehensive list of all upcoming games, just the ones that have release dates set in IGDB.
 * @param {number} limit I wouldnt give it a smaller number than 10, igdb works funnily, also can sometimes break with very big numbers
 * @returns {Promise<Array>} An array of normal game models extended with the upcoming flag.
 */
async function fetchUpcomingGamesFromIGDB(limit = 10, token = null) {
  const now = Math.floor(Date.now() / 1000);
  const body = `fields date, game; sort date asc; limit ${limit}; where date > ${now};` ;
  try {
    let data = await fetchIGDB("release_dates", body, token);
    const gameIds = new Set(data.map(d => d.game).filter(gid => Number.isFinite(Number(gid))));  
    let games = await fetchIGDBGameDetails([...gameIds], token);
    if (!Array.isArray(games)) games = [];
    games = games.filter(Boolean);
    return games.map(g => ({...g, upcoming: 1}));
  } catch (err) {
    console.error('Error fetching upcoming games from IGDB:', err);
    throw err;
  }
}
/**
 * Fetches details for a list of games from the IGDB API. Note that IGDB can return error if the list is too long, should be fine with around 300 gameIds.
 * @param {Array<number>} gameIds An array of game IDs to fetch details for.
 * @returns {Promise<Array>} An array of game details.
 */
async function fetchIGDBGameDetails(gameIds, token = null) {
  if (!Array.isArray(gameIds) || gameIds.length === 0) return [];
  // build a comma-separated id list for IGDB: id = (1,2,3)
  const idsList = gameIds.map(g => Number(g)).filter(n => Number.isFinite(n)).join(',');
  const whereIds = idsList.length ? `id = (${idsList})` : '1 = 0';
  const body = `fields id,name,genres.name,cover.url,external_games.external_game_source.name, external_games.uid,summary; where ${whereIds} & (external_games.external_game_source.name = "Itchio" | external_games.external_game_source.name = "GOG" | external_games.external_game_source.name = "Steam"); limit ${gameIds.length};`;
  try {
    const data = await fetchIGDB("games", body, token);
    const gameData = data.map(async (game) => {
      const igdbId = game.id;
      const title = game.name ?? null;
      const genres = Array.isArray(game.genres) ? game.genres.map(g => g.name).filter(Boolean) : [];

      // prioritize external sources: Itch.io, GOG, Steam (normalize names)
      let preferred = null;
      const priorities = ['itchio', 'gog', 'steam'];
      if (Array.isArray(game.external_games)) {
        for (const p of priorities) {
          const found = game.external_games.find(eg => {
            const srcName = String(eg?.external_game_source?.name ?? '').toLowerCase().trim();
            const norm = srcName.replace(/[^a-z0-9]/g, '');
            return norm === p || norm.includes(p) || srcName.includes(p);
          });
          if (found) { preferred = found; break; }
        }
        if (!preferred) {
          // no preferred external source found; skip
          return null;
        }
      }

      const shopNameRaw = preferred?.external_game_source?.name || null;
      let shopName = shopNameRaw ? normalizePlatformName(shopNameRaw) : null;
      const coverFallback = game.cover && game.cover.url ? `https:${game.cover.url}` : null;
      // Try initial platform fetch, then probe others if needed to correct mismatched external ids (e.g., steam id with gog mapping)
      let platformDetails = shopName && preferred?.uid ? await fetchGameDetailsFromPlatform(preferred.uid, shopName).catch(() => null) : null;
      if (!platformDetails && preferred?.uid) {
        const probe = await detectPlatformForAppId(preferred.uid, [shopName, 'gog', 'steam', 'itchio'], game.name);
        if (probe.details) {
          platformDetails = probe.details;
          shopName = probe.shop;
        } else {
          // Preserve previous behavior: if mapping indicated GOG but we couldn't fetch, skip
          if (shopName && shopName.includes('gog')) return null;
        }
      }
      const headerImageUrl = preferred?.uid
        ? (await getPlatformBannerUrl(shopName, preferred.uid).catch(() => null) || coverFallback)
        : coverFallback;
      const description = game.summary ?? null;
      // If this game maps to GOG but we couldn't fetch GOG details, skip it (consistent with ITAD flow)
      if (shopName && shopName.includes('gog') && !platformDetails) {
        return null;
      }


      return {
        igdbId,
        app_id: preferred?.uid || null,
        name: title,
        genres: normalizeGenreNames(genres),
        headerImageUrl: headerImageUrl,
        description: String(description),
        cost: platformDetails?.price ?? -1,
        minimum_requirements: platformDetails?.minimum_requirements ?? null,
        discount: platformDetails?.discount ?? 0,
        shop:  shopName ? shopName.toLowerCase() : null,
        country_code: "DE",
      };
    });
    return Promise.all(gameData);
  } catch (err) {
    console.error('Error fetching IGDB game details:', err);
    throw err;
  }
}


//------------------- ITAD API ------------------//
/**
 * 
 * Fetches deals from the ITAD API in bulk by making multiple paginated requests. The function will fetch games sorted by discount cut in descending order, so the most discounted games will be fetched first. Note that the ITAD API has an undisclosed rate limit even with an API key, so fetching a very large number of games may result in some failed requests. It's recommended to keep the count under ~500 for best results.
 * @param {number} count A simple number of how many games you want, keep it under ~500 because of the undisclosed api rate limit (even with key)
 * @returns {Promise<Array>} The same game return model that other functions use but with the discountcut added as an additional property.
 */
async function fetchItadDealsBulk(count){
  const offsets = [];
  for (let offset = 0; offset < count; offset += 200) offsets.push(offset);

  const promises = offsets.map(offset =>
    
    fetchItadDeals(200, offset)
      .then(batch => ({ offset, batch }))
      .catch(err => ({ offset, batch: [], err }))
  );

  const results = await Promise.all(promises);
  for (const r of results) {
    // Process the batch as needed, e.g., save to database
  }

  // return flattened array of all games
  return results.flatMap(r => Array.isArray(r.batch) ? r.batch : []);
}
/**
 * Fetches deals from the ITAD API for a specific range. The games are sorted by discount cut in descending order, so the most discounted games will be fetched first. Note that the ITAD API has an undisclosed rate limit even with an API key, so it's recommended to add a small sleep between calls if you are fetching a large number of games in bulk to avoid hitting the rate limit.
 * @param {number} limit Number of games you want
 * @param {number} offset The name tells...
 * @param {number} sleepMs isnt needed but recommended to add a small sleep (like 100-300ms) between calls to avoid hitting the undisclosed rate limit of the ITAD API, especially if you are fetching a large number of games in bulk. You can set it to 0 to disable the sleep, but be aware that it may lead to more failed requests if you are fetching many games.
 * @returns {Promise<Array>} the default game return model but with the discount cut added as an additional property. Note that the games returned by this function do not have the description property filled, you would need to call fetchGameDetailsFromPlatform with the appId and shop name to get the description and other details for each game. This is done to minimize the number of calls to the platform APIs, as fetching details for each game can be time-consuming and may also have rate limits.
 */
async function fetchItadDeals(limit, offset, sleepMs = 0){
    const shops = await fetchItadShops();
    const shopIds = shops.map(s => s.id);
    const dealsUrl = `https://api.isthereanydeal.com/deals/v2?key=${ITAD_API_KEY}&country=DE&limit=${limit}&offset=${offset}&sort=-cut&shops=${shopIds.join(',')}`;
    try {
        const response = await fetchWithRateHandling(dealsUrl, {headers: { 'Content-Type': 'application/json' }, method: 'GET' }, 4, 1000);
        if (!response || !response.ok) {
          const errorText = response ? await response.text().catch(()=>null) : null;
          console.error(`HTTP error! status: ${response ? response.status : 'no-response'} - ${errorText}`);
          throw new Error(`HTTP error! status: ${response ? response.status : 'no-response'}`);
        }
        const data = await response.json();
        // Process all games in parallel for speed. Use Promise.allSettled to avoid failing the whole batch
        const gamePromises = (data.list || [])
          .filter(g => g && g.type === 'game')
          .map(async (game) => {
            if (sleepMs && Number.isFinite(Number(sleepMs)) && Number(sleepMs) > 0) await sleep(Number(sleepMs));
            try {
              const gameInfo = await fetchItadGameInfo(game.id);
              if (!gameInfo) return null;
              let shopNameCandidate = game.deal?.shop?.name ? normalizePlatformName(game.deal.shop.name) : null;
              let headerImageUrl = gameInfo.assets.banner600;
              let platformGameDetails = null;
              try {
                platformGameDetails = await fetchGameDetailsFromPlatform(gameInfo.appid, shopNameCandidate);
                if (!platformGameDetails) {
                  const probe = await detectPlatformForAppId(gameInfo.appid, [shopNameCandidate, 'gog', 'steam', 'itchio'], gameInfo.title);
                  if (probe.details) {
                    platformGameDetails = probe.details;
                    shopNameCandidate = probe.shop;
                  } else {
                    if (shopNameCandidate && shopNameCandidate.includes('gog')) {
                      return null;
                    }
                  }
                }
              } catch (err) {
                platformGameDetails = null;
              }
              headerImageUrl = gameInfo.appid
                ? (await getPlatformBannerUrl(shopNameCandidate, gameInfo.appid).catch(() => headerImageUrl) || headerImageUrl)
                : headerImageUrl;
              if (game.deal?.shop?.name && shopNameCandidate !== normalizePlatformName(game.deal.shop.name)) {
                console.warn(`Shop name mismatch for game ${gameInfo.title} (appid: ${gameInfo.appid}): ITAD shop "${game.deal.shop.name}" vs detected "${shopNameCandidate}"`);
              }
              if(!gameInfo.appid || !gameInfo.title) return null;          
              return {
                app_id: gameInfo.appid || null,
                name: gameInfo.title || null,
                genres: gameInfo.tags ? normalizeGenreNames(gameInfo.tags) : [],
                headerImageUrl: headerImageUrl || null,
                discount: platformGameDetails?.discount ?? game.deal.cut ?? null,
                shop: shopNameCandidate,
                cost: platformGameDetails?.price ?? game.deal.regular.amountInt ?? -1,
                country_code: 'DE' || null,
                description: platformGameDetails?.description || null,
                minimum_requirements: platformGameDetails?.minimum_requirements ?? null
              };
            } catch (err) {
              return null;
            }
          });

        const settled = await Promise.allSettled(gamePromises);
        const games = settled
          .filter(s => s.status === 'fulfilled' && s.value)
          .map(s => s.value);
        return games;
    } catch (error) {
        console.error('fetchItadDeals error:', error);
    }
} 
/**
 * Fetches a list of ITAD shops that are relevant for game deals. The function filters the shops to only include predetermined shops (in current built is itch/gog/steam).
 * @returns itad shopids that belong to steam/itch/gog and is paired to it in the array
 */
async function fetchItadShops(){
    const shopsUrl = `https://api.isthereanydeal.com/service/shops/v1?key=${ITAD_API_KEY}&client_id=${ITAD_CLIENT_ID}&client_secret=${ITAD_CLIENT_SECRET}`;
    try{
      const response = await fetchWithRateHandling(shopsUrl, {headers: { 'Content-Type': 'application/json' }, method: 'GET' }, 4, 1000);
      if (!response || !response.ok) {
        throw new Error(`HTTP error! status: ${response ? response.status : 'no-response'}`);
      }
      const data = await response.json();
        const allShops = Array.isArray(data) ? data : (data.shops || data.list || []);
        const wantedTitles = ['itchio', 'gog', 'steam'];
        const filtered = allShops.filter(shop => {
          if (!shop.title) return false;
          const normalizedTitle = String(shop.title).toLowerCase().replace(/[^a-z0-9]/g, '');
          return wantedTitles.some(w => normalizedTitle.includes(w));
        }).map(shop => ({ id: shop.id, title: shop.title }));
        return filtered;
    } catch (error) {
        console.error(error);
        return [];
    }
}
/**
 * Fetches information about a specific game from the ITAD API.
 * @param {number} gameId The name speaks for itself...
 * @returns {Promise<Object|null>} everything that isthereanydeal.com's api returns to the function
 */
async function fetchItadGameInfo(gameId){
    const gameInfoUrl = `https://api.isthereanydeal.com/games/info/v2?key=${ITAD_API_KEY}&client_id=${ITAD_CLIENT_ID}&client_secret=${ITAD_CLIENT_SECRET}&id=${gameId}`;
    try {
      const response = await fetchWithRateHandling(gameInfoUrl, {headers: { 'Content-Type': 'application/json' }, method: 'GET' }, 4, 1000);
      if (!response || !response.ok) {
        throw new Error(`HTTP error! status: ${response ? response.status : 'no-response'}`);
      }
      const data = await response.json();
        if (data.type!= "game") {
            return null;
        }     
        return data;
    } catch (error) {
        console.error(error);
    }    
}

//------------------- Platform APIs ------------------//
/**
 * Fetches game details from a specific platform based on its ID and platform name. Note that steam api tends to fails because of api rate limits with long cooldowns so avoid if possible.
 * @param {number|string} appId  The name speaks for itself...
 * @param {string} platformName The name speaks for itself...
 * @returns {Promise<Array | null>} The games details, return content varies from platform to platform but generally includes properties like title, description, genres, cover image URL, and other relevant information. If the platform is not recognized or if there was an error fetching the details, the function returns null.
 */
async function fetchGameDetailsFromPlatform(appId, platformName) {
    // normalize incoming platformName (accept 'itch.io', 'itch', 'itchio', etc.)
    platformName = String(platformName || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (platformName === 'itchio' || platformName === 'itch') {
    return await fetchItchGameDetails(appId);
  } else if (platformName === 'gog') {
    return await fetchGogGameDetails(appId);
  } else if (platformName === 'steam') {
    return await fetchSteamGameDetails(appId);
  }
  return null;
}

/**
 * Probe multiple known platforms for a given app id and return the first platform that yields details. Needed as Twitch usually misassigns appids :/
 * Returns { shop: <platformName|null>, details: <object|null> }
 */
function compareGameTitles(details, title) {
  if (!details || !details.title || !title) return false;
  const normalize = str => String(str).toLowerCase().replace(/[^a-z0-9]+/g, '');
  return normalize(details.title) === normalize(title);
}
async function detectPlatformForAppId(appId, candidateShops = ['gog','steam','itchio'], title) {
  // If no appId provided, nothing to probe.
  if (appId == null || appId === '') return { shop: null, details: null };
  const tried = new Set();
  const order = [];
  if (Array.isArray(candidateShops)) {
    for (const s of candidateShops) {
      if (!s) continue;
      const name = normalizePlatformName(s);
      if (!tried.has(name)) { tried.add(name); order.push(name); }
    }
  }
  for (const s of ['gog','steam','itchio']) if (!tried.has(s)) order.push(s);

  for (const shop of order) {
    try {
      let details = null;
      if (shop === 'gog') {
        details = await fetchGogGameDetails(appId);
        if(!compareGameTitles(details, title)) {
          details = null;
        }
      }
      else if (shop === 'itchio' || shop === 'itch') {
        details = await fetchItchGameDetails(appId);
        if(!compareGameTitles(details, title)) {
          details = null;
        }
      }
      else if (shop === 'steam') {
        details = await fetchSteamGameDetails(appId);
        if(!compareGameTitles(details, title)) {
          details = null;
        }
      }
      if (details) return { shop, details };
    } catch (err) {
      // ignore and try next
    }
  }
  return { shop: null, details: null };
}

