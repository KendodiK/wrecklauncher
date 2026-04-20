import { normalizeStorePlatformStrict } from './storeRouting.js';

function extractMetadataLabel(value) {
	if (value == null) return '';

	if (typeof value === 'object') {
		const fields = [
			value.name,
			value.genre,
			value.description,
			value.tag,
			value.title,
			value.label,
		];
		for (const field of fields) {
			if (typeof field === 'string' && field.trim()) {
				return field.trim();
			}
		}
		return '';
	}

	if (typeof value === 'string') return value.trim();
	return '';
}

function normalizeMetadataList(input) {
	const source = Array.isArray(input) ? input : [input];
	const out = [];
	const seen = new Set();

	for (const entry of source) {
		const label = extractMetadataLabel(entry);
		if (!label) continue;

		const parts = label.includes(',')
			? label.split(',').map((part) => part.trim()).filter(Boolean)
			: [label];

		for (const part of parts) {
			if (!part || /^\d+$/.test(part)) continue;
			const key = part.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(part);
		}
	}

	return out;
}

function steamPoster(appid) {
	const id = Number(appid);
	if (!Number.isFinite(id) || id <= 0) return null;
	return `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
}

function normalizePriceValue(raw, platformHint = '') {
	const numeric = Number(raw);
	if (!Number.isFinite(numeric) || numeric <= 0) return 0;

	const normalizedPlatform = String(platformHint || '').trim().toLowerCase();
	const looksLikeMinorUnits = Number.isInteger(numeric)
		&& (
			(normalizedPlatform === 'gog' || normalizedPlatform === 'gog.com')
				? numeric >= 100
				: numeric >= 1000
		);

	if (looksLikeMinorUnits) {
		return Number((numeric / 100).toFixed(2));
	}

	return Number(numeric.toFixed(2));
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
	const dbIdCandidate = Number(game.id);
	const dbId = Number.isFinite(dbIdCandidate) && dbIdCandidate > 0 ? dbIdCandidate : null;
	const title = String(game.name ?? game.title ?? '').trim();
	if (!title) return null;

	const normalizedPrice = normalizePriceValue(game.cost ?? game.price, platform);
	const genres = normalizeMetadataList(game.genre_names ?? game.genreNames ?? game.genres);
	const tags = normalizeMetadataList(game.tag_names ?? game.tagNames ?? game.tags);

	return {
		id: dbId ?? appId,
		db_id: dbId,
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
		genres,
		tags: tags.length > 0 ? tags : genres,
		discountPercent: Number(game.discount_percent ?? game.discountPercentage ?? game.discount ?? 0) || 0,
	};
}

function mapSteamDetails(details) {
	if (!details || typeof details !== 'object') return null;
	const appId = Number(details.appid ?? details.app_id ?? details.id ?? details.raw?.search_match?.appid ?? null);
	const title = String(details.name ?? details.title ?? '').trim();
	if (!title) return null;
	const genres = normalizeMetadataList(details.genre_names ?? details.genreNames ?? details.genres);
	const tags = normalizeMetadataList(details.tag_names ?? details.tagNames ?? details.tags);

	return {
		id: Number.isFinite(appId) && appId > 0 ? appId : `steam:${title.toLowerCase()}`,
		app_id: Number.isFinite(appId) && appId > 0 ? appId : null,
		appid: Number.isFinite(appId) && appId > 0 ? appId : null,
		title,
		name: title,
		image: details.banner_img || details.coverUrl || steamPoster(appId),
		banner_img: details.banner_img || details.coverUrl || null,
		price: normalizePriceValue(details.cost ?? details.price, 'steam'),
		cost: normalizePriceValue(details.cost ?? details.price, 'steam'),
		description: details.description || details.short_description || '',
		platform_name: 'steam',
		platform: 'steam',
		genres,
		tags: tags.length > 0 ? tags : genres,
	};
}

function mapGogDetails(details) {
	if (!details || typeof details !== 'object') return null;
	const appId = Number(
		details.productId
		?? details.product_id
		?? details.app_id
		?? details.id
		?? details.raw?.search_match?.appId
		?? details.raw?.search_match?.productId
		?? null
	);
	const title = String(details.title ?? details.name ?? '').trim();
	if (!title) return null;
	const genres = normalizeMetadataList(details.genre_names ?? details.genreNames ?? details.genres);
	const tags = normalizeMetadataList(details.tag_names ?? details.tagNames ?? details.tags);

	return {
		id: Number.isFinite(appId) && appId > 0 ? appId : `gog:${title.toLowerCase()}`,
		app_id: Number.isFinite(appId) && appId > 0 ? appId : null,
		appid: Number.isFinite(appId) && appId > 0 ? appId : null,
		title,
		name: title,
		image: details.banner_img || details.cover_url || details.coverUrl || null,
		banner_img: details.banner_img || details.cover_url || details.coverUrl || null,
		price: normalizePriceValue(details.cost ?? details.min_price ?? details.minPrice ?? details.price, 'gog'),
		cost: normalizePriceValue(details.cost ?? details.min_price ?? details.minPrice ?? details.price, 'gog'),
		description: details.description || '',
		platform_name: 'gog',
		platform: 'gog',
		genres,
		tags: tags.length > 0 ? tags : genres,
	};
}

function mapItchDetails(details) {
	if (!details || typeof details !== 'object') return null;
	const appId = Number(details.gameId ?? details.app_id ?? details.id ?? details.raw?.search_match?.gameId ?? null);
	const title = String(details.title ?? details.name ?? '').trim();
	if (!title) return null;
	const genres = normalizeMetadataList(details.genre_names ?? details.genreNames ?? details.genres);
	const tags = normalizeMetadataList(details.tag_names ?? details.tagNames ?? details.tags);

	return {
		id: Number.isFinite(appId) && appId > 0 ? appId : `itchio:${title.toLowerCase()}`,
		app_id: Number.isFinite(appId) && appId > 0 ? appId : null,
		appid: Number.isFinite(appId) && appId > 0 ? appId : null,
		title,
		name: title,
		image: details.coverUrl || details.cover_url || details.banner_img || null,
		banner_img: details.coverUrl || details.cover_url || details.banner_img || null,
		price: normalizePriceValue(details.minPrice ?? details.cost ?? details.price, 'itchio'),
		cost: normalizePriceValue(details.minPrice ?? details.cost ?? details.price, 'itchio'),
		description: details.shortText || details.description || '',
		platform_name: 'itchio',
		platform: 'itchio',
		genres,
		tags: tags.length > 0 ? tags : genres,
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

export async function searchGamesFromSources(api, query, selectedPlatforms = [], selectedTags = []) {
	const normalizedQuery = String(query || '').trim();
	const normalizedTags = Array.isArray(selectedTags)
		? selectedTags.map((tag) => String(tag || '').trim()).filter(Boolean)
		: [];
	const shouldSearchBackend = normalizedQuery.length > 0 || normalizedTags.length > 0;
	const shouldProbePlatformsByTitle = normalizedQuery.length > 0;

	if (!shouldSearchBackend && !shouldProbePlatformsByTitle) return [];
	if (!api || typeof api !== 'object') return [];

	const platforms = normalizePlatformCandidates(selectedPlatforms);
	const tasks = [];

	if (shouldSearchBackend && typeof api.searchGames === 'function') {
		tasks.push(
			api.searchGames(normalizedQuery, normalizedTags)
				.then((rows) => ({ source: 'server', rows }))
				.catch(() => ({ source: 'server', rows: [] })),
		);
	}

	if (shouldProbePlatformsByTitle && platforms.includes('steam') && typeof api.getSteamGameDetailsByTitle === 'function') {
		tasks.push(
			api.getSteamGameDetailsByTitle(normalizedQuery).then((row) => ({ source: 'steam', row })).catch(() => ({ source: 'steam', row: null })),
		);
	}

	if (shouldProbePlatformsByTitle && platforms.includes('gog') && typeof api.getGogGameDetailsByTitle === 'function') {
		tasks.push(
			api.getGogGameDetailsByTitle(normalizedQuery).then((row) => ({ source: 'gog', row })).catch(() => ({ source: 'gog', row: null })),
		);
	}

	if (shouldProbePlatformsByTitle && platforms.includes('itchio') && typeof api.getItchGameDetailsByTitle === 'function') {
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
