// @ts-check

const { execFile } = require('child_process');
const https = require('https');
const { shell } = require('electron');
const GamesController = require('./GamesController');
const { joinUrl, normalizeBaseUrl } = require('../lib/url');
const { fetchJsonSafe } = require('../lib/http');

class GogController extends GamesController {
  /** @type {string} */
  #serverUrl;

  /**
   * @param {{ serverUrl: string }} cfg
   */
  constructor(cfg) {
    const serverUrl = cfg?.serverUrl;
    super({ serverUrl });
    this.#serverUrl = normalizeBaseUrl(serverUrl, { defaultProtocol: 'https:' });
  }

  static #agent = new https.Agent({
    keepAlive: true,
    maxSockets: 2,
    timeout: 20_000,
  });

  /**
   * @param {string} token
   * @param {any} details
   * @param {string|number} appIdHint
   * @returns {Promise<void>}
   */
  async #syncGogDetailsToServer(token, details, appIdHint) {
    const tokenStr = typeof token === 'string' ? token.trim() : '';
    if (!tokenStr || !details || typeof details !== 'object') return;

    const numericAppId = Number(details.app_id ?? details.id ?? appIdHint);
    if (!Number.isFinite(numericAppId) || numericAppId <= 0) return;

    const genreNames = Array.isArray(details.genres)
      ? details.genres
          .map((entry) => {
            if (typeof entry === 'string') return entry;
            if (entry && typeof entry === 'object') return entry.name ?? entry.genre ?? entry.description ?? null;
            return null;
          })
          .filter((value) => typeof value === 'string' && value.trim())
      : [];

    try {
      await super.syncScrapedGameWithServer(tokenStr, {
        app_id: String(numericAppId),
        platform_name: 'gog',
        name: details.title ?? `gog:${numericAppId}`,
        banner_img: details.banner_img ?? details.cover_url ?? '',
        description: details.description ?? '',
        minimum_requirements: details.minimum_requirements ?? '',
        cost: typeof details.min_price === 'number' ? details.min_price : null,
        genre_names: genreNames,
        country_code: 'DE',
      });
    } catch (err) {
      if (err && typeof err === 'object' && /** @type {any} */ (err).code === 'WRECK_INVALID_TOKEN') {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`Failed to sync GOG game details for appID ${numericAppId}: ${msg}`);
    }
  }


  /**
   * Run a Windows REG QUERY and return stdout as a string.
   * @param {string[]} args
   * @returns {Promise<string>}
   */
  static #regQuery(args) {
    return new Promise((resolve, reject) => {
      execFile('REG', args, { shell: false, windowsHide: true, timeout: 10_000 }, (err, stdout, stderr) => {
        if (err) {
          // exit code 1 means "key not found" — treat as empty result, not an error
          if (err.code === 1 || (typeof stderr === 'string' && stderr.toLowerCase().includes('the system was unable to find'))) {
            resolve('');
          } else {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
          return;
        }
        resolve(typeof stdout === 'string' ? stdout : '');
      });
    });
  }

  /**
   * Parse the output of `REG QUERY` into a flat map of value name → value data.
   * Handles multi-level output (sub-keys and their values).
   *
   * @param {string} regOutput
   * @returns {Map<string, string>}  key is "HKLM\...\GameId:ValueName", value is the data string
   */
  static #parseRegOutput(regOutput) {
    const map = new Map();
    let currentKey = '';

    for (const rawLine of regOutput.split('\n')) {
      const line = rawLine.trimEnd();
      if (!line.trim()) continue;

      // A registry key line looks like "HKEY_LOCAL_MACHINE\SOFTWARE\..."
      if (/^HKEY/i.test(line.trim())) {
        currentKey = line.trim();
        continue;
      }

      // A value line looks like "    ValueName    REG_SZ    SomeData"
      const match = line.match(/^\s{4}(.+?)\s{4}(REG_SZ|REG_DWORD|REG_EXPAND_SZ)\s{4}(.*)$/);
      if (match && currentKey) {
        const valueName = match[1].trim();
        const valueData = match[3].trim();
        map.set(`${currentKey}:${valueName}`, valueData);
      }
    }
    return map;
  }

  /**
   * Detect installed GOG games from the Windows registry.
   * GOG Galaxy writes entries under:
   *   HKLM\SOFTWARE\WOW6432Node\GOG.com\Games\{productId}
   * Each sub-key has values: GAMENAME, EXEFILE, LAUNCHCOMMAND, INSTALLPATH, PRODUCTID, etc.
   *
   * @returns {Promise<import('../models').GogInstalledGame[]>}
   */
  async getInstalledGames() {
    const baseKey = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\WOW6432Node\\GOG.com\\Games';
    const baseKey64 = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\GOG.com\\Games';

    /** @type {import('../models').GogInstalledGame[]} */
    const results = [];

    for (const key of [baseKey, baseKey64]) {
      let output = '';
      try {
        output = await GogController.#regQuery(['QUERY', key, '/s']);
      } catch {
        continue;
      }

      if (!output.trim()) continue;

      // Group lines into sub-keys
      const lines = output.split('\n');
      /** @type {Map<string, Map<string, string>>} */
      const subKeys = new Map();
      let currentSubKey = '';

      for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line.trim()) continue;

        if (/^HKEY/i.test(line.trim())) {
          currentSubKey = line.trim();
          if (!subKeys.has(currentSubKey)) subKeys.set(currentSubKey, new Map());
          continue;
        }

        const match = line.match(/^\s{4}(.+?)\s{4}(REG_SZ|REG_DWORD|REG_EXPAND_SZ)\s{4}(.*)$/);
        if (match && currentSubKey) {
          const vals = subKeys.get(currentSubKey);
          if (vals) vals.set(match[1].trim(), match[3].trim());
        }
      }

      for (const [subKey, vals] of subKeys) {
        // Skip the root key itself (it has no game values)
        if (subKey.toLowerCase() === key.toLowerCase()) continue;

        const gameName = vals.get('GAMENAME') || vals.get('GameName') || null;
        if (!gameName && !vals.get('EXEFILE')) continue; // skip non-game entries

        const productId = vals.get('PRODUCTID') || vals.get('productID') || subKey.split('\\').pop() || null;
        const installPath = vals.get('INSTALLPATH') || vals.get('Path') || null;
        const launchCommand = vals.get('LAUNCHCOMMAND') || vals.get('LaunchCommand') || vals.get('EXEFILE') || null;
        const version = vals.get('VERSIONGAMESCANNER') || vals.get('ver') || null;
        const buildId = vals.get('BUILDID') || null;

        if (!productId) continue;

        results.push({
          productId,
          gameName: gameName || `GOG ${productId}`,
          installPath,
          launchCommand,
          version,
          buildId,
          raw: Object.fromEntries(vals),
        });
      }
    }

    results.sort((a, b) => (a.gameName || '').toLowerCase().localeCompare((b.gameName || '').toLowerCase()));
    return results;
  }
/**
 * Parse various possible price value representations returned by GOG APIs.
 * Returns numeric value (float) in currency units or null if not parseable.
 * @param {any} val
 * @return {number|null}
 */
  #parseGogPrice(val) {
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
        //@ts-ignore
        const p = this.#parseGogPrice(val[k]);
        if (p != null) return p;
      }
    }
    // Try all properties as a last resort
    for (const k of Object.keys(val)) {
        //@ts-ignore
      const p = this.#parseGogPrice(val[k]);
      if (p != null) return p;
    }
  }
  return null;
}
/**
 * Compute discount percent given initial and final numeric prices.
 * Returns a number representing percent (e.g. 75 for 75%), rounded to two decimals, or null.
 * @param {number} initial
 * @param {number} final
 * @return {number|null}
 */
  #computeDiscountPercent(initial, final) {
  if (typeof initial !== 'number' || typeof final !== 'number' || initial <= 0) return null;
  const pct = ((initial - final) / initial) * 100;
  if (!Number.isFinite(pct)) return null;
  return Math.round(pct * 100) / 100;
}
/**
 * Fetches the URL of the cover image for a GOG game.
 * @param {string|number} appId The GOG application ID.
 * @returns {Promise<string|null>} The URL of the cover image or null if not found.
 */
async #fetchGogCoverUrl(appId) {
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
   * @param {string} title
   * @returns {string[]}
   */
  #buildSlugCandidatesFromTitle(title) {
    const normalized = this._normalizeTitleForCompare(title);
    if (!normalized) return [];

    const words = normalized.split(' ').filter(Boolean);
    if (words.length < 1) return [];

    const dropTail = new Set(['edition', 'ultimate', 'complete', 'game', 'year', 'deluxe']);
    const trimmedWords = [...words];
    while (trimmedWords.length > 2 && dropTail.has(trimmedWords[trimmedWords.length - 1])) {
      trimmedWords.pop();
    }

    const noLeadingThe = words[0] === 'the' && words.length > 1 ? words.slice(1) : words;

    const variants = new Set([
      words.join('_'),
      words.join('-'),
      trimmedWords.join('_'),
      trimmedWords.join('-'),
      noLeadingThe.join('_'),
      noLeadingThe.join('-'),
    ]);

    return Array.from(variants).filter((slug) => typeof slug === 'string' && slug.trim()).slice(0, 8);
  }

  /**
   * Search GOG game candidates by title (slug probing).
   *
   * @param {string} title
   * @returns {Promise<Array<{ slug: string, appId: string|number|null, title: string, score: number, url: string|null }>>}
   */
  async searchGameByTitle(title) {
    const needle = String(title || '').trim();
    if (!needle) return [];

    const slugs = this.#buildSlugCandidatesFromTitle(needle);
    const matches = [];
    const seen = new Set();

    for (const slug of slugs) {
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);

      const details = await this.getGameDetails(slug, { includeRaw: false });
      if (!details || typeof details !== 'object') continue;

      const matchedTitle = String(details.title || '').trim();
      const score = this._titleMatchScore(needle, matchedTitle);

      matches.push({
        slug,
        appId: details.app_id ?? details.id ?? null,
        title: matchedTitle || slug,
        score,
        url: typeof details.url === 'string' ? details.url : null,
      });
    }

    matches.sort((a, b) => b.score - a.score);
    return matches;
  }

  /**
   * Resolve GOG details by game title instead of cross-platform appid.
   *
   * @param {string} title
   * @param {string} [token]
   * @returns {Promise<import('../models').GogGameDetails|null>}
   */
  async getGameDetailsByTitle(title, token = '') {
    const matches = await this.searchGameByTitle(title);
    if (matches.length < 1) return null;

    for (const match of matches.slice(0, 4)) {
      const details = token
        ? await this.getGameDetails(match.slug, token, { includeRaw: true })
        : await this.getGameDetails(match.slug, { includeRaw: true });
      if (!details || typeof details !== 'object') continue;

      return {
        ...details,
        raw: {
          ...(details.raw || {}),
          search_match: match,
        },
      };
    }

    return null;
  }

  /**
   * Fetch game details from the GOG public API (no auth required).
   * Endpoint: https://api.gog.com/products/{productId}?expand=description,screenshots,videos,related_products,changelog
   *
   * @param {string|number} appId  GOG product ID.
   * @param {string|{includeRaw?: boolean}} [tokenOrOptions]
   * @param {{includeRaw?: boolean}} [maybeOptions]
   * @returns {Promise<import('../models').GogGameDetails|null>}
   */
  async getGameDetails(appId, tokenOrOptions = '', maybeOptions = {}) {
    let token = '';
    /** @type {{ includeRaw?: boolean }} */
    let options = {};

    if (tokenOrOptions && typeof tokenOrOptions === 'object' && !Array.isArray(tokenOrOptions)) {
      options = tokenOrOptions;
    } else {
      token = typeof tokenOrOptions === 'string' ? tokenOrOptions.trim() : '';
      options = maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {};
    }

    const includeRaw = options.includeRaw !== false;
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
        const bannerCandidate = this._getFirstStringByPaths(payload, [
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
              const priceInitialNumeric = this.#parseGogPrice(priceEntry.basePrice ?? priceEntry.base_price ?? priceEntry.initial ?? priceEntry.price ?? priceEntry.amount ?? priceEntry);
              const priceFinalNumeric = this.#parseGogPrice(priceEntry.finalPrice ?? priceEntry.final_price ?? priceEntry.final ?? priceEntry.price ?? priceEntry.amount ?? priceEntry);
              payload.price = {
                initial: priceInitialNumeric ?? null,
                final: priceFinalNumeric ?? null,
                //@ts-ignore
                discount: this.#computeDiscountPercent(priceInitialNumeric, priceFinalNumeric),
              };
              break;
            }
          }
        } catch (err) {
          //@ts-ignore
          console.warn('Failed to parse GOG price entry:', { appId: numericAppId, err: err?.message });
        }
        let cost = null;
        const finalPrice = payload?.price?.final ?? payload?.price?.initial ?? null;
        if (finalPrice != null) {
          const parsed = Number.parseFloat(String(finalPrice));
          if (Number.isFinite(parsed)) cost = parsed;
        }
  
        const genres = this._normalizeGenreNames(
          Array.isArray(payload?.genres)
          //@ts-ignore
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
          //@ts-ignore
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
          //@ts-ignore
          is_free: Number.isFinite(cost) ? cost <= 0 : false,
          genres,
          url: `https://www.gog.com/en/game/${numericAppId}`,
        };
        //@ts-ignore
        if (includeRaw) details.raw = payload;
        await this.#syncGogDetailsToServer(token, details, numericAppId);
        //@ts-ignore
        return details;
      } catch (err) {
        //@ts-ignore
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
            const priceInitialNumeric = this.#parseGogPrice(priceEntry.basePrice ?? priceEntry.base_price ?? priceEntry.initial ?? priceEntry.price ?? priceEntry.amount ?? priceEntry);
            const priceFinalNumeric = this.#parseGogPrice(priceEntry.finalPrice ?? priceEntry.final_price ?? priceEntry.final ?? priceEntry.price ?? priceEntry.amount ?? priceEntry);
            payload.price = {
              initial: priceInitialNumeric ?? null,
              final: priceFinalNumeric ?? null,
              //@ts-ignore
              discount: this.#computeDiscountPercent(priceInitialNumeric, priceFinalNumeric),
            };
            break;
          }
        }
      } catch (err) {
        //@ts-ignore
        console.warn('Failed to parse GOG price entry:', { appId: appId, err: err?.message });
      }
  
      let cost = null;
      const finalPrice = payload?.price?.initial;
      if (finalPrice != null) {
        const parsed = Number.parseFloat(String(finalPrice));
        if (Number.isFinite(parsed)) cost = parsed;
      }
  
      const genres = this._normalizeGenreNames(
        Array.isArray(payload?.genres)
        //@ts-ignore
          ? payload.genres.map((g) => (typeof g === 'string' ? g : g?.name))
          : []
      );
  
      const cover_url = await this.#fetchGogCoverUrl(appId);
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
        //@ts-ignore
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
        //@ts-ignore
        is_free: Number.isFinite(cost) ? cost <= 0 : false,
        genres,
        url: `https://www.gog.com/en/game/${appId}`,
      };
      //@ts-ignore
      if (includeRaw) details.raw = payload;
      await this.#syncGogDetailsToServer(token, details, appId);
      //@ts-ignore
      return details;
    } catch (err) {
      //@ts-ignore
      console.warn('Failed to fetch GOG game details:', { appId: appId, err: err?.message });
      return null;
    }
  }
  // async getGameDetails(token, productId) {
  //   if (!token || !String(token).trim()) throw new Error('Auth token is required');
  //   const id = String(productId).trim();
  //   if (!id || !/^\d+$/.test(id)) throw new Error(`Invalid GOG product ID: ${String(productId)}`);

  //   // 1) Prefer DB data first.
  //   const dbUrl = joinUrl(this.#serverUrl, 'api', 'games', id, 'all');
  //   const dbRes = await fetchJsonSafe(dbUrl, {
  //     method: 'GET',
  //     headers: { 'Accept': 'application/json' },
  //   });

  //   if (dbRes.ok && dbRes.json && typeof dbRes.json === 'object') {
  //     const platformName = String(dbRes.json.platform_name ?? dbRes.json.platform ?? '').trim().toLowerCase();
  //     if (platformName === 'gog') {
  //       const genreNames = Array.isArray(dbRes.json.genres)
  //         ? dbRes.json.genres
  //             .map((/** @type {any} */ g) => (typeof g === 'string' ? g : g?.genre ?? g?.name))
  //             .filter((/** @type {any} */ v) => typeof v === 'string' && v.trim())
  //         : [];

  //       return {
  //         productId: id,
  //         title: dbRes.json.name ?? `gog:${id}`,
  //         bannerImg: dbRes.json.banner_img ?? null,
  //         description: dbRes.json.description ?? null,
  //         cost: typeof dbRes.json.cost === 'number' ? dbRes.json.cost : null,
  //         genreNames,
  //         raw: {
  //           ...dbRes.json,
  //           source: 'database',
  //         },
  //       };
  //     }
  //   }

  //   // 2) Fallback to scrape endpoint, which also uploads to DB when missing.
  //   const url = `${joinUrl(this.#serverUrl, 'api', 'gog', 'game', id)}?ensureUpload=true`;
  //   const { ok, status, json } = await fetchJsonSafe(url, {
  //     method: 'GET',
  //     headers: { 'Accept': 'application/json' },
  //   });

  //   if (!ok) {
  //     if (status === 401) {
  //       const msg = (json && typeof json === 'object' ? json.error : null) || 'Unauthorized';
  //       const e = new Error(`Unauthorized (token invalid/expired): ${String(msg).slice(0, 300)}`);
  //       // @ts-ignore
  //       e.code = 'WRECK_INVALID_TOKEN';
  //       throw e;
  //     }
  //     if (status === 404) return null;
  //     const msg = (json && typeof json === 'object' ? json.error : null) || `HTTP ${status}`;
  //     throw new Error(`GOG game fetch failed: ${String(msg).slice(0, 300)}`);
  //   }

  //   if (!json || typeof json !== 'object') return null;

  //   return {
  //     productId: id,
  //     title: typeof json.title === 'string' ? json.title : `gog:${id}`,
  //     bannerImg: json.bannerImg ?? json.banner_img ?? json.cover_url ?? null,
  //     description: json.description ?? null,
  //     cost: typeof json.cost === 'number' ? json.cost : (typeof json.min_price === 'number' ? json.min_price : null),
  //     genreNames: Array.isArray(json.genreNames) ? json.genreNames : (Array.isArray(json.genres) ? json.genres : []),
  //     raw: {
  //       ...json,
  //       source: 'scrape-endpoint',
  //     },
  //   };
  // }

  /**
   * Open GOG Galaxy for a game action via URL scheme.
   * Known GOG Galaxy protocol handlers:
   *   goggalaxy://openGameView/{productId}
   *   goggalaxy://runGame/{productId}
   *   goggalaxy://installGame/{productId}
   *   goggalaxy://openStoreUrl/{url}
   *
   * @param {string|number} productId  GOG numeric product ID
   * @param {'open'|'run'|'install'} action
   * @returns {Promise<{ ok: boolean, url: string }>}
   */
  async clientGameControlUtil(productId, action) {
    const id = String(productId).trim();
    if (!id || !/^\d+$/.test(id)) throw new Error(`Invalid GOG product ID: ${String(productId)}`);

    const schemeMap = {
      open: `goggalaxy://openGameView/${encodeURIComponent(id)}`,
      run: `goggalaxy://runGame/${encodeURIComponent(id)}`,
      install: `goggalaxy://installGame/${encodeURIComponent(id)}`,
    };

    const url = schemeMap[action] || schemeMap.open;

    try {
      await shell.openExternal(url);
      return { ok: true, url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to open GOG Galaxy URL (${url}): ${msg}`);
    }
  }
}

module.exports = GogController;
