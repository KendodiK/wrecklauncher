const PLATFORM_ID_TO_NAME = Object.freeze({
	1: 'steam',
	3: 'itchio',
	4: 'gog',
});

function toCanonicalStorePlatform(value) {
	if (value === null || value === undefined) return null;

	const raw = String(value).trim().toLowerCase();
	if (!raw) return null;

	if (/^\d+$/.test(raw)) {
		return PLATFORM_ID_TO_NAME[Number(raw)] || null;
	}

	if (raw === 'steam') return 'steam';
	if (raw === 'gog' || raw === 'gog.com') return 'gog';
	if (raw === 'itch' || raw === 'itchio' || raw === 'itch.io') return 'itchio';

	return null;
}

function toOptionalPositiveId(value) {
	if (value === null || value === undefined) return null;
	const num = Number(value);
	if (!Number.isFinite(num) || num <= 0) return null;
	return String(Math.trunc(num));
}

export function normalizeStorePlatform(value, fallback = 'steam') {
	const fallbackPlatform = String(fallback || 'steam').trim().toLowerCase() || 'steam';
	const canonical = toCanonicalStorePlatform(value);
	if (!canonical) return fallbackPlatform;
	return canonical;
}

export function normalizeStorePlatformStrict(value) {
	const canonical = toCanonicalStorePlatform(value);
	if (!canonical) return '';
	return canonical;
}

export function resolveStorePlatformFromGame(game, fallback = 'steam') {
	if (!game || typeof game !== 'object') return normalizeStorePlatform(fallback, 'steam');

	const byName = [game.platform_name, game.platform, game.platformName];
	for (const candidate of byName) {
		if (candidate === null || candidate === undefined) continue;
		if (!String(candidate).trim()) continue;
		return normalizeStorePlatform(candidate, fallback);
	}

	const byId = [game.platform_id, game.platformId];
	for (const candidate of byId) {
		if (candidate === null || candidate === undefined) continue;
		if (!String(candidate).trim()) continue;
		return normalizeStorePlatform(candidate, fallback);
	}

	return normalizeStorePlatform(fallback, 'steam');
}

export function resolveStorePlatformFromGameStrict(game) {
	if (!game || typeof game !== 'object') return '';

	const byName = [game.platform_name, game.platform, game.platformName];
	for (const candidate of byName) {
		const normalized = normalizeStorePlatformStrict(candidate);
		if (normalized) return normalized;
	}

	const byId = [game.platform_id, game.platformId];
	for (const candidate of byId) {
		const normalized = normalizeStorePlatformStrict(candidate);
		if (normalized) return normalized;
	}

	return '';
}

export function resolveStoreGameRouteId(game) {
	if (!game || typeof game !== 'object') return null;

	const candidates = [game.appid, game.app_id, game.appId, game.id, game.game_id, game.gameId];
	for (const candidate of candidates) {
		const id = toOptionalPositiveId(candidate);
		if (id) return id;
	}

	return null;
}

export function buildStoreGameRoute(game, fallbackPlatform = 'steam') {
	const routeId = resolveStoreGameRouteId(game);
	if (!routeId) return '';
	const platform = resolveStorePlatformFromGame(game, fallbackPlatform);
	return `/store/game/${encodeURIComponent(platform)}/${encodeURIComponent(routeId)}`;
}

export function getStorePlatformLabel(platform) {
	const normalized = normalizeStorePlatform(platform, 'steam');
	if (normalized === 'gog') return 'GOG';
	if (normalized === 'itchio') return 'Itch.io';
	return 'Steam';
}
