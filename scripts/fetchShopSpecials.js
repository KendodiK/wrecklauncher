const apiHelpers = require('./apiHelpers.js');
const { getPlatformBannerUrl, normalizeGenreNames} = apiHelpers;


//------------ Utility functions ------------------//
//not necessary to use as itad should run only daily and 1000 calls is still fine without retry, but better to be safe than sorry
// Robust fetch helper that respects 429 Retry-After and retries transient 5xx errors.
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




//------------------- IGDB API ------------------//
/**
 * A variable to hold the IGDB access token. This token is required for making authenticated requests to the IGDB API. The token ususally has a 60 day lifespan, but it's recommended to call fetchIGDBToken() and refresh this variable periodically to ensure uninterrupted access to the IGDB API.
 */
let igdbToken = null;
/**
 * Fetches an access token from the IGDB API.
 * @returns {Promise<string>} The token values that the api returns
 */
module.exports.fetchIGDBToken = async function() {
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
/**
 * A simple helper to query IGDB endpoints with the provided query string. Remember to call fetchIGDBToken() first to set the igdbToken variable.
 * @param {string} endpoint for example "games", "popularity_types", etc...
 * @param {string} query The body of the api call to IGDB, for example: `fields id,name; where id = 123;` You can find more about the query syntax in the IGDB API documentation.
 * @returns {Promise<any>} whatever the api returns
 */
module.exports.fetchIGDB = async function (endpoint, query) {
  if (!process.env.IGDB_CLIENT_ID) {
    throw new Error('Missing IGDB client id (IGDB_CLIENT_ID)');
  }
  if (!igdbToken) {
    throw new Error('Missing IGDB token; fetchIGDBToken() must run first');
  }

  const response = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: 'POST',
    headers: {
      'Client-ID': process.env.IGDB_CLIENT_ID,
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
/**
 * Fetches popular games from the IGDB API based on a weighted popularity score.
 * @param {number} limit  I wouldnt give it a smaller number than 10, igdb works funnily, also can sometimes break with very big numbers
 * @returns {Promise<Array>} An array of normal game models extended with the popularity score that is calculated differently than how igdb does it as it isn't the best.
 */
module.exports.fetchPopularGamesFromIGDB = async function (limit = 10) {    
  const body = `fields game_id,value,popularity_type; sort value desc; limit ${limit}; where popularity_type = (1,3,5,6);` ;
  try {
    let data = await fetchIGDB("popularity_primitives", body);
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
      let games = await fetchIGDBGameDetails(ranked.map(r => r.game_id));
      for (const g of games) {
        g.popularityScore = scoreLookup.get(g.igdbId) ?? 0;
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
module.exports.fetchUpcomingGamesFromIGDB = async function (limit = 10) {
  const now = Math.floor(Date.now() / 1000);
  const body = `fields date, game; sort date asc; limit ${limit}; where date > ${now};` ;
  try {
    let data = await fetchIGDB("release_dates", body);
    const gameIds = new Set(data.map(d => d.game).filter(gid => Number.isFinite(Number(gid))));  
    const games = await fetchIGDBGameDetails([...gameIds]);
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
module.exports.fetchIGDBGameDetails = async function (gameIds) {
  if (!Array.isArray(gameIds) || gameIds.length === 0) return [];
  // build a comma-separated id list for IGDB: id = (1,2,3)
  const idsList = gameIds.map(g => Number(g)).filter(n => Number.isFinite(n)).join(',');
  const whereIds = idsList.length ? `id = (${idsList})` : '1 = 0';
  const body = `fields id,name,genres.name,cover.url,external_games.external_game_source.name, external_games.uid,summary; where ${whereIds} & (external_games.external_game_source.name = "Itchio" | external_games.external_game_source.name = "GOG" | external_games.external_game_source.name = "Steam"); limit ${gameIds.length};`;
  try {
    const data = await fetchIGDB("games", body);
    const gameData = data.map(async (game) => {
      const igdbId = game.id;
      const title = game.name ?? null;
      const genres = Array.isArray(game.genres) ? game.genres.map(g => g.name).filter(Boolean) : [];

      // prioritize external sources: Itch.io, GOG, Steam
      let preferred = null;
      const priorities = ['Itch.io', 'GOG', 'Steam'];
      if (Array.isArray(game.external_games)) {
        for (const p of priorities) {
          const found = game.external_games.find(eg => eg.external_game_source && String(eg.external_game_source.name).toLowerCase().includes(p.toLowerCase()));
          if (found) { preferred = found; break; }
        }
        if (!preferred && game.external_games.length > 0) preferred = game.external_games[0];
      }

      const shopName = preferred?.external_game_source?.name || null;
      const coverFallback = game.cover && game.cover.url ? `https:${game.cover.url}` : null;
      const headerImageUrl = await getPlatformBannerUrl(shopName, preferred?.uid || null).catch(()=>null) || coverFallback;
      const description = game.summary ?? null;

      return {
        igdbId,
        appId: preferred?.uid || null,
        name: title,
        genres: normalizeGenreNames(genres),
        headerImageUrl: headerImageUrl,
        description: String(description),
        shop: shopName,
        countryCode: "DE",
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
    const dealsUrl = `https://api.isthereanydeal.com/deals/v2?key=${process.env.ITAD_API_KEY}&country=DE&limit=${limit}&offset=${offset}&sort=-cut&shops=${shopIds.join(',')}`;
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
              const headerImageUrl = await getPlatformBannerUrl(game.deal.shop.name, gameInfo.appid).catch(() => gameInfo.assets.banner600) || gameInfo.assets.banner600;
              let platformGameDetails = null;
              try{
                platformGameDetails = await fetchGameDetailsFromPlatform(gameInfo.appid, game.deal.shop.name);}
              catch(err){
                platformGameDetails = null;
              }
              if(!gameInfo.appid || !gameInfo.title) return null;
              return {
                appId: gameInfo.appid || null,
                name: gameInfo.title || null,
                genres: gameInfo.tags ? normalizeGenreNames(gameInfo.tags) : [],
                headerImageUrl: headerImageUrl || null,
                discount: game.deal.cut || null,
                shop: game.deal.shop.name || null,
                countryCode: 'DE' || null,
                description: platformGameDetails?.description || null
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
    const shopsUrl = `https://api.isthereanydeal.com/service/shops/v1?key=${process.env.ITAD_API_KEY}&client_id=${process.env.ITAD_CLIENT_ID}&client_secret=${process.env.ITAD_CLIENT_SECRET}`;
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
            const titleLower = shop.title.toLowerCase();
            return wantedTitles.some(w => titleLower.includes(w));
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
    const gameInfoUrl = `https://api.isthereanydeal.com/games/info/v2?key=${process.env.ITAD_API_KEY}&client_id=${process.env.ITAD_CLIENT_ID}&client_secret=${process.env.ITAD_CLIENT_SECRET}&id=${gameId}`;
    try {
      const response = await fetchWithRateHandling(gameInfoUrl, {headers: { 'Content-Type': 'application/json' }, method: 'GET' }, 4, 1000);
      if (!response || !response.ok) {
        throw new Error(`HTTP error! status: ${response ? response.status : 'no-response'}`);
      }
      const data = await response.json();
        if (data.type!= "game") {
            return null;
        }
        // let genreNames = data.tags || [];
        // genreNames = normalizeGenreNames(genreNames);        
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
    platformName = String(platformName).trim().toLowerCase();
  if (platformName === 'itchio') {
    return await fetchItchGameDetails(appId);
  } else if (platformName === 'gog') {
    return await fetchGogGameDetails(appId);
  } else if (platformName === 'steam') {
    return await fetchSteamGameDetails(appId);
  }
  return null;
}


/**
 * Fetches details for a game from the GOG platform.
 * @param {number|string} appId The name speaks for itself yet again...
 * @param {Array} param1 Whether you want the raw data or not.
 * @returns Basic info about the game, almost the same as the default game return model
 */
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
      cover_url: payload?._links?.image?.href,
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
/**
 * Fetches details for a game from the Steam platform. Whatch out for the rate limits on steam api, it can be quite harsh and with long cooldowns, so avoid if possible.
 * @param {number|string} appId The name speaks for itself yet again...
 * @param {Array} param1 Whether you want the raw data or not.
 * @returns Basic info about the game, almost the same as the default game return model.
 */
async function fetchSteamGameDetails(appId, { includeRaw = false } = {}) {
  const numericAppId = Number(appId);
  if (!Number.isFinite(numericAppId) || numericAppId <= 0) return null;

  const endpoint = `https://store.steampowered.com/api/appdetails?appids=${numericAppId}`;
  try {
    const response = await fetch(endpoint);
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload || typeof payload !== 'object') return null;

    const gameData = payload[numericAppId].data;
    if (!gameData || typeof gameData !== 'object') return null;

    const title = typeof gameData.name === 'string' ? gameData.name.trim() : null;
    const coverUrl = typeof gameData.header_image === 'string' ? gameData.header_image : null;
    const description = typeof gameData.about_the_game === 'string' ? gameData.about_the_game : null;

    const details = {
      id: numericAppId,
      app_id: numericAppId,
      title,
      cover_url: coverUrl,
      genres: normalizeGenreNames(Array.isArray(gameData.genres) ? gameData.genres.map(g => g.description) : []),
      description,
      url: `https://store.steampowered.com/app/${numericAppId}`,
    };

    if (includeRaw) details.raw = gameData;
    return details;
  } catch (err) {
    console.warn('Failed to fetch Steam game details:', { appId: numericAppId, err: err?.message });
    return null;
  }
}



