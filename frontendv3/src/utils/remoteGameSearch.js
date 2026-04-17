import { normalizeStorePlatformStrict } from './storeRouting.js';

function steamPoster(appid) {
	const id = Number(appid);
	if (!Number.isFinite(id) || id <= 0) return null;
	return `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
}

function normalizePriceValue(raw) {
	const numeric = Number(raw);
	if (!Number.isFinite(numeric) || numeric <= 0) return 0;
	if (Number.isInteger(numeric) && numeric >= 1000) {
		return Number((numeric / 100).toFixed(2));
	}
	return numeric;
}

function normalizePlatformCandidates(selectedPlatforms) {
	const source = Array.isArray(selectedPlatforms) ? selectedPlatforms : [];
	const normalized = source
		.map((platform) => normalizeStorePlatformStrict(platform))
		.filter(Boolean);
	if (normalized.length > 0) return Array.from(new Set(normalized));
	return ['steam', 'gog', 'itchio'];
}

function mapServerGame(game) {
	if (!game || typeof game !== 'object') return null;

	const platform = normalizeStorePlatformStrict(game.platform_name ?? game.platform ?? game.platformName) || 'steam';
	const appId = Number(game.app_id ?? game.appid ?? game.id);
	const title = String(game.name ?? game.title ?? '').trim();
	if (!title) return null;

	const normalizedPrice = normalizePriceValue(game.cost ?? game.price);

	return {
		id: game.id ?? appId,
		app_id: Number.isFinite(appId) && appId > 0 ? appId : null,
		appid: Number.isFinite(appId) && appId > 0 ? appId : null,
		title,
		name: title,
		image: game.banner_img || game.image || steamPoster(appId),
		banner_img: game.banner_img || game.image || null,
		price: normalizedPrice,
		cost: normalizedPrice,
		description: game.description || '',
		platform_name: platform,
		platform: platform,
		genres: Array.isArray(game.genres) ? game.genres : [],
		tags: Array.isArray(game.tags) ? game.tags : [],
		discountPercent: Number(game.discount_percent ?? game.discountPercentage ?? game.discount ?? 0) || 0,
	};
}

function mapSteamDetails(details) {
	if (!details || typeof details !== 'object') return null;
	const appId = Number(details.appid ?? details.app_id ?? details.id ?? details.raw?.search_match?.appid ?? null);
	const title = String(details.name ?? details.title ?? '').trim();
	if (!title) return null;

	return {
		id: Number.isFinite(appId) && appId > 0 ? appId : `steam:${title.toLowerCase()}`,
		app_id: Number.isFinite(appId) && appId > 0 ? appId : null,
		appid: Number.isFinite(appId) && appId > 0 ? appId : null,
		title,
		name: title,
		image: details.banner_img || details.coverUrl || steamPoster(appId),
		banner_img: details.banner_img || details.coverUrl || null,
		price: normalizePriceValue(details.cost ?? details.price),
		cost: normalizePriceValue(details.cost ?? details.price),
		description: details.description || details.short_description || '',
		platform_name: 'steam',
		platform: 'steam',
		tags: Array.isArray(details.genreNames) ? details.genreNames : [],
	};
}

function mapGogDetails(details) {
	if (!details || typeof details !== 'object') return null;
	const appId = Number(details.app_id ?? details.id ?? details.raw?.search_match?.appId ?? null);
	const title = String(details.title ?? details.name ?? '').trim();
	if (!title) return null;

	return {
		id: Number.isFinite(appId) && appId > 0 ? appId : `gog:${title.toLowerCase()}`,
		app_id: Number.isFinite(appId) && appId > 0 ? appId : null,
		appid: Number.isFinite(appId) && appId > 0 ? appId : null,
		title,
		name: title,
		image: details.banner_img || details.cover_url || details.coverUrl || null,
		banner_img: details.banner_img || details.cover_url || details.coverUrl || null,
		price: normalizePriceValue(details.cost ?? details.price),
		cost: normalizePriceValue(details.cost ?? details.price),
		description: details.description || '',
		platform_name: 'gog',
		platform: 'gog',
		tags: Array.isArray(details.genre_names) ? details.genre_names : [],
	};
}

function mapItchDetails(details) {
	if (!details || typeof details !== 'object') return null;
	const appId = Number(details.gameId ?? details.app_id ?? details.id ?? details.raw?.search_match?.gameId ?? null);
	const title = String(details.title ?? details.name ?? '').trim();
	if (!title) return null;

	return {
		id: Number.isFinite(appId) && appId > 0 ? appId : `itchio:${title.toLowerCase()}`,
		app_id: Number.isFinite(appId) && appId > 0 ? appId : null,
		appid: Number.isFinite(appId) && appId > 0 ? appId : null,
		title,
		name: title,
		image: details.coverUrl || details.cover_url || details.banner_img || null,
		banner_img: details.coverUrl || details.cover_url || details.banner_img || null,
		price: normalizePriceValue(details.minPrice ?? details.cost ?? details.price),
		cost: normalizePriceValue(details.minPrice ?? details.cost ?? details.price),
		description: details.shortText || details.description || '',
		platform_name: 'itchio',
		platform: 'itchio',
		tags: Array.isArray(details.genreNames) ? details.genreNames : [],
	};
}

function gameKey(game) {
	if (!game || typeof game !== 'object') return '';
	const platform = normalizeStorePlatformStrict(game.platform_name ?? game.platform ?? game.platformName) || 'steam';
	const appId = String(game.appid ?? game.app_id ?? game.id ?? '').trim();
	if (appId) return `${platform}:${appId}`;
	const normalizedTitle = String(game.title ?? game.name ?? '').trim().toLowerCase();
	if (!normalizedTitle) return '';
	return `${platform}:${normalizedTitle}`;
}

export function mergeUniqueGames(baseGames, incomingGames) {
	const base = Array.isArray(baseGames) ? baseGames : [];
	const incoming = Array.isArray(incomingGames) ? incomingGames : [];

	const merged = [...base];
	const seen = new Set(base.map((game) => gameKey(game)).filter(Boolean));

	for (const game of incoming) {
		const key = gameKey(game);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		merged.push(game);
	}

	return merged;
}

export async function searchGamesFromSources(api, query, selectedPlatforms = []) {
	const normalizedQuery = String(query || '').trim();
	if (!normalizedQuery) return [];
	if (!api || typeof api !== 'object') return [];

	const platforms = normalizePlatformCandidates(selectedPlatforms);
	const tasks = [];

	if (typeof api.searchGames === 'function') {
		tasks.push(
			api.searchGames(normalizedQuery, []).then((rows) => ({ source: 'server', rows })).catch(() => ({ source: 'server', rows: [] })),
		);
	}

	if (platforms.includes('steam') && typeof api.getSteamGameDetailsByTitle === 'function') {
		tasks.push(
			api.getSteamGameDetailsByTitle(normalizedQuery, 'us').then((row) => ({ source: 'steam', row })).catch(() => ({ source: 'steam', row: null })),
		);
	}

	if (platforms.includes('gog') && typeof api.getGogGameDetailsByTitle === 'function') {
		tasks.push(
			api.getGogGameDetailsByTitle(normalizedQuery).then((row) => ({ source: 'gog', row })).catch(() => ({ source: 'gog', row: null })),
		);
	}

	if (platforms.includes('itchio') && typeof api.getItchGameDetailsByTitle === 'function') {
		tasks.push(
			api.getItchGameDetailsByTitle(normalizedQuery).then((row) => ({ source: 'itchio', row })).catch(() => ({ source: 'itchio', row: null })),
		);
	}

	const settled = await Promise.all(tasks);
	const serverRows = settled.find((entry) => entry.source === 'server')?.rows;
	const mappedServerRows = Array.isArray(serverRows)
		? serverRows.map((row) => mapServerGame(row)).filter(Boolean)
		: [];

	const steamRow = settled.find((entry) => entry.source === 'steam')?.row;
	const gogRow = settled.find((entry) => entry.source === 'gog')?.row;
	const itchRow = settled.find((entry) => entry.source === 'itchio')?.row;

	const mappedPlatformRows = [
		mapSteamDetails(steamRow),
		mapGogDetails(gogRow),
		mapItchDetails(itchRow),
	].filter(Boolean);

	return mergeUniqueGames(mappedServerRows, mappedPlatformRows);
}
