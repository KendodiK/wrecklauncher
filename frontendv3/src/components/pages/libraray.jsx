import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { launchers } from '../../data/mockLibraryData.js';
import LauncherTabs from '../library/LauncherTabs.jsx';
import LibraryGameStrip from '../library/LibraryGameStrip.jsx';
import AllGamesDrawer from '../library/AllGamesDrawer.jsx';

const LIBRARY_SORT_MODES = ['alphabetical', 'appid', 'platform', 'playtime'];
const MAX_LIBRARY_STRIP_GAMES = 180;
const STRIP_WINDOW_EDGE_BUFFER = 40;
const INSTALLED_SCAN_CACHE_TTL_MS = 60 * 60 * 1000;
const STEAM_IMAGE_PROBE_TIMEOUT_MS = 5500;
const STEAM_IMAGE_PROBE_CONCURRENCY = 4;
const STEAM_CDN_HOSTS = [
	'https://cdn.cloudflare.steamstatic.com',
	'https://cdn.akamai.steamstatic.com',
];

const installedScanCache = new Map();
const steamImageProbeCache = new Map();
const steamDbBannerSyncCache = new Set();

function normalizeInstalledScanCacheKey(platform = '') {
	return String(platform || '').trim().toLowerCase();
}

async function readInstalledScanCacheFromDisk(platform) {
	const key = normalizeInstalledScanCacheKey(platform);
	if (!key) return null;
	if (typeof window?.electronAPI?.invoke !== 'function') return null;

	try {
		const payload = await window.electronAPI.invoke('library-cache:get', key);
		if (!payload || !Array.isArray(payload?.value)) return null;
		return {
			value: payload.value,
			expiresAt: Number(payload.expiresAt) || 0,
		};
	} catch (error) {
		console.warn(`Failed to read installed ${key} cache from disk:`, error);
		return null;
	}
}

function writeInstalledScanCacheToDisk(platform, value, expiresAt) {
	const key = normalizeInstalledScanCacheKey(platform);
	if (!key) return;
	if (typeof window?.electronAPI?.invoke !== 'function') return;

	void window.electronAPI
		.invoke('library-cache:set', key, Array.isArray(value) ? value : [], Number(expiresAt) || 0)
		.catch((error) => {
			console.warn(`Failed to persist installed ${key} cache to disk:`, error);
		});
}

function invalidateInstalledScanCacheOnDisk(platform = '') {
	if (typeof window?.electronAPI?.invoke !== 'function') return;
	void window.electronAPI
		.invoke('library-cache:invalidate', normalizeInstalledScanCacheKey(platform))
		.catch((error) => {
			console.warn('Failed to invalidate installed cache on disk:', error);
		});
}

function invalidateInstalledScanCache(platform = '') {
	const normalized = normalizeInstalledScanCacheKey(platform);
	if (!normalized) {
		installedScanCache.clear();
		invalidateInstalledScanCacheOnDisk('');
		return;
	}
	installedScanCache.delete(normalized);
	invalidateInstalledScanCacheOnDisk(normalized);
}

async function readInstalledGamesWithCache(platform, fetcher, { force = false, ttlMs = INSTALLED_SCAN_CACHE_TTL_MS } = {}) {
	const key = normalizeInstalledScanCacheKey(platform);
	if (!key || typeof fetcher !== 'function') return [];

	const now = Date.now();
	const current = installedScanCache.get(key) || null;
	if (!force && current) {
		if (Array.isArray(current.value) && current.expiresAt > now) {
			return current.value;
		}
		if (current.promise) {
			return current.promise;
		}
	}

	if (!force && !current?.promise) {
		const diskEntry = await readInstalledScanCacheFromDisk(key);
		if (diskEntry && Array.isArray(diskEntry.value)) {
			const hydrated = {
				value: diskEntry.value,
				expiresAt: Number(diskEntry.expiresAt) || 0,
				promise: null,
			};
			installedScanCache.set(key, hydrated);
			if (hydrated.expiresAt > now) {
				return hydrated.value;
			}
		}
	}

	const promise = Promise.resolve()
		.then(fetcher)
		.then((payload) => {
			const normalized = Array.isArray(payload) ? payload : [];
			const expiresAt = Date.now() + Math.max(0, Number(ttlMs) || INSTALLED_SCAN_CACHE_TTL_MS);
			installedScanCache.set(key, {
				value: normalized,
				expiresAt,
				promise: null,
			});
			writeInstalledScanCacheToDisk(key, normalized, expiresAt);
			return normalized;
		})
		.catch((error) => {
			const entry = installedScanCache.get(key);
			if (entry?.promise === promise) {
				installedScanCache.delete(key);
			}
			throw error;
		});

	installedScanCache.set(key, {
		value: Array.isArray(current?.value) ? current.value : null,
		expiresAt: Number(current?.expiresAt) || 0,
		promise,
	});

	return promise;
}

async function readSteamInstalledGames({ force = false } = {}) {
	return readInstalledGamesWithCache(
		'steam',
		() => {
			if (typeof window?.electronAPI?.getSteamInstalledGames === 'function') {
				return window.electronAPI.getSteamInstalledGames();
			}
			return window?.electronAPI?.invoke?.('steam:get-installed-games');
		},
		{ force },
	);
}

async function readGogInstalledGames({ force = false } = {}) {
	return readInstalledGamesWithCache(
		'gog',
		() => {
			if (typeof window?.electronAPI?.getGogInstalledGames === 'function') {
				return window.electronAPI.getGogInstalledGames();
			}
			return window?.electronAPI?.invoke?.('gog:get-installed-games');
		},
		{ force },
	);
}

async function readItchInstalledGames({ force = false } = {}) {
	return readInstalledGamesWithCache(
		'itch',
		() => {
			if (typeof window?.electronAPI?.getItchInstalledGames === 'function') {
				return window.electronAPI.getItchInstalledGames();
			}
			return window?.electronAPI?.invoke?.('itch:get-installed-games');
		},
		{ force },
	);
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, Number(ms) || 0));
}

function getLibrarySortLabel(sortMode) {
	if (sortMode === 'appid') return 'App ID';
	if (sortMode === 'platform') return 'Platform';
	if (sortMode === 'playtime') return 'Playtime';
	return 'Alphabetical';
}

function getNextLibrarySortMode(currentMode) {
	const index = LIBRARY_SORT_MODES.indexOf(currentMode);
	if (index < 0) return LIBRARY_SORT_MODES[0];
	return LIBRARY_SORT_MODES[(index + 1) % LIBRARY_SORT_MODES.length];
}

function formatPlaytime(minutes) {
	const totalMinutes = Number(minutes) || 0;
	const hours = Math.floor(totalMinutes / 60);
	const remainingMinutes = totalMinutes % 60;
	if (hours <= 0) return `${remainingMinutes}m`;
	if (remainingMinutes <= 0) return `${hours}h`;
	return `${hours}h ${remainingMinutes}m`;
}

function extractSteamAppId(game) {
	const appId = Number(game?.appid ?? game?.app_id ?? game?.appId ?? game?.id);
	if (!Number.isFinite(appId) || appId <= 0) return null;
	return appId;
}

function buildSteamAssetCandidates(appId, fileNames) {
	const numericAppId = Number(appId);
	if (!Number.isFinite(numericAppId) || numericAppId <= 0) return [];

	const out = [];
	const seen = new Set();

	for (const host of STEAM_CDN_HOSTS) {
		for (const fileName of fileNames || []) {
			const name = String(fileName || '').trim();
			if (!name) continue;
			const href = `${host}/steam/apps/${Math.trunc(numericAppId)}/${name}`;
			const key = href.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(href);
		}
	}

	return out;
}

function buildSteamCoverCandidates(appId) {
	return buildSteamAssetCandidates(appId, [
		'library_600x900_2x.jpg',
		'library_600x900.jpg',
		'library_600x900_2x.png',
		'library_600x900.png',
		'header.jpg',
		'capsule_616x353.jpg',
	]);
}

function buildSteamHeroCandidates(appId) {
	return buildSteamAssetCandidates(appId, [
		'library_hero.jpg',
		'header.jpg',
		'capsule_616x353.jpg',
		'capsule_467x181.jpg',
	]);
}

function isHttpImageUrl(value) {
	return /^https?:\/\//i.test(String(value || '').trim());
}

function uniqueImageCandidates(values) {
	const out = [];
	const seen = new Set();

	for (const value of Array.isArray(values) ? values : []) {
		const href = String(value || '').trim();
		if (!href) continue;
		if (!isHttpImageUrl(href) && !href.startsWith('data:image/')) continue;
		const key = href.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(href);
	}

	return out;
}

async function probeImageUrlReachable(url, timeoutMs = STEAM_IMAGE_PROBE_TIMEOUT_MS) {
	const href = String(url || '').trim();
	if (!isHttpImageUrl(href)) return false;
	if (typeof Image === 'undefined') return false;

	const cacheKey = href.toLowerCase();
	const cached = steamImageProbeCache.get(cacheKey);
	if (cached === true) return true;
	if (cached && typeof cached.then === 'function') {
		const result = await cached;
		return result === true;
	}

	const probePromise = new Promise((resolve) => {
		let settled = false;
		const image = new Image();

		const finish = (ok) => {
			if (settled) return;
			settled = true;
			image.onload = null;
			image.onerror = null;
			resolve(ok === true);
		};

		const timer = window.setTimeout(() => {
			finish(false);
		}, Math.max(1200, Number(timeoutMs) || STEAM_IMAGE_PROBE_TIMEOUT_MS));

		image.onload = () => {
			window.clearTimeout(timer);
			finish(true);
		};
		image.onerror = () => {
			window.clearTimeout(timer);
			finish(false);
		};

		image.decoding = 'async';
		image.loading = 'eager';
		image.src = href;
	});

	steamImageProbeCache.set(cacheKey, probePromise);
	const reachable = await probePromise;

	if (reachable) {
		steamImageProbeCache.set(cacheKey, true);
	} else {
		steamImageProbeCache.delete(cacheKey);
	}

	return reachable;
}

async function resolveFirstLoadableImageUrl(candidates) {
	for (const candidate of uniqueImageCandidates(candidates)) {
		if (candidate.startsWith('data:image/')) return candidate;
		// eslint-disable-next-line no-await-in-loop
		const reachable = await probeImageUrlReachable(candidate);
		if (reachable) return candidate;
	}
	return '';
}

async function runTasksWithConcurrency(items, concurrency, worker) {
	const source = Array.isArray(items) ? items : [];
	if (source.length < 1 || typeof worker !== 'function') return;

	let cursor = 0;
	const limit = Math.max(1, Math.min(Number(concurrency) || 1, source.length));

	const runners = Array.from({ length: limit }, async () => {
		while (cursor < source.length) {
			const currentIndex = cursor;
			cursor += 1;
			// eslint-disable-next-line no-await-in-loop
			await worker(source[currentIndex], currentIndex);
		}
	});

	await Promise.all(runners);
}

async function maybeSyncSteamBannerImage(api, game, resolvedCoverUrl) {
	if (!api || typeof api.syncScrapedGameDetailsByAppIdAndPlatform !== 'function') return;

	const appId = Number(game?.appid);
	if (!Number.isFinite(appId) || appId <= 0) return;

	const bannerUrl = String(resolvedCoverUrl || '').trim();
	if (!isHttpImageUrl(bannerUrl)) return;

	const syncKey = `${Math.trunc(appId)}|${bannerUrl.toLowerCase()}`;
	if (steamDbBannerSyncCache.has(syncKey)) return;
	steamDbBannerSyncCache.add(syncKey);

	try {
		if (typeof api.getAllDetailsByAppIDAndPlatform === 'function') {
			const existing = await api.getAllDetailsByAppIDAndPlatform(Math.trunc(appId), 'steam');
			const dbBanner = extractDbLibraryCoverUrl(existing);
			if (dbBanner && dbBanner.toLowerCase() === bannerUrl.toLowerCase()) {
				return;
			}
		}

		await api.syncScrapedGameDetailsByAppIdAndPlatform({
			appId: Math.trunc(appId),
			platform: 'steam',
			name: String(game?.title || `steam:${Math.trunc(appId)}`).trim() || `steam:${Math.trunc(appId)}`,
			banner_img: bannerUrl,
		});
	} catch (error) {
		console.warn(`Failed to sync Steam banner image for app ${Math.trunc(appId)}:`, error);
	}
}

async function enrichSteamLibraryGamesWithFallbackAndDbSync(games) {
	const list = Array.isArray(games) ? games : [];
	if (list.length < 1) return list;

	const api = typeof window !== 'undefined' ? window.electronAPI : null;
	if (typeof window === 'undefined' || typeof Image === 'undefined') return list;

	const steamGames = list.filter((game) => {
		const launcher = String(game?.launcherId || game?.platform_name || '').trim().toLowerCase();
		const appId = Number(game?.appid);
		if (!Number.isFinite(appId) || appId <= 0) return false;
		return launcher === 'steam';
	});

	if (steamGames.length < 1) return list;

	const updatesById = new Map();

	await runTasksWithConcurrency(steamGames, STEAM_IMAGE_PROBE_CONCURRENCY, async (game) => {
		const appId = Number(game?.appid);
		if (!Number.isFinite(appId) || appId <= 0) return;

		const coverCandidates = uniqueImageCandidates([
			...(Array.isArray(game?.coverFallbacks) ? game.coverFallbacks : []),
			game?.coverUrl,
			...buildSteamCoverCandidates(appId),
		]);
		const heroCandidates = uniqueImageCandidates([
			...(Array.isArray(game?.heroFallbacks) ? game.heroFallbacks : []),
			game?.heroUrl,
			...buildSteamHeroCandidates(appId),
		]);

		const resolvedCover = await resolveFirstLoadableImageUrl(coverCandidates);
		const resolvedHero = await resolveFirstLoadableImageUrl([
			resolvedCover,
			...heroCandidates,
		]);

		const finalCover = resolvedCover || resolveLibraryCoverUrl(null, game?.title, 'Steam');
		const finalHero = resolvedHero || finalCover;

		const currentCover = String(game?.coverUrl || '').trim();
		const currentHero = String(game?.heroUrl || '').trim();
		const coverChanged = finalCover && finalCover !== currentCover;
		const heroChanged = finalHero && finalHero !== currentHero;

		if (coverChanged || heroChanged) {
			updatesById.set(game.id, {
				coverUrl: coverChanged ? finalCover : currentCover,
				heroUrl: heroChanged ? finalHero : currentHero,
				coverFallbacks: coverCandidates,
				heroFallbacks: heroCandidates,
			});
		}

		if (coverChanged && isHttpImageUrl(finalCover)) {
			await maybeSyncSteamBannerImage(api, game, finalCover);
		}
	});

	if (updatesById.size < 1) return list;

	return list.map((game) => {
		const next = updatesById.get(game.id);
		if (!next) return game;
		return {
			...game,
			...next,
		};
	});
}

function toSteamLibraryGame(game, installedAppIds) {
	const appId = extractSteamAppId(game);
	if (appId == null) return null;
	const coverFallbacks = buildSteamCoverCandidates(appId);
	const heroFallbacks = buildSteamHeroCandidates(appId);

	const playtimeMinutes = Number(game?.playtime_forever) || 0;
	const isInstalled = installedAppIds instanceof Set ? installedAppIds.has(appId) : false;
	const tags = ['Owned'];
	if (isInstalled) {
		tags.push('Installed');
	} else {
		tags.push('Ready to install');
	}
	if (playtimeMinutes > 0) {
		tags.push('Played');
	}
	const rawTitle =
		typeof game?.name === 'string' && game.name.trim()
			? game.name.trim()
			: typeof game?.title === 'string' && game.title.trim()
				? game.title.trim()
				: typeof game?.game_name === 'string' && game.game_name.trim()
					? game.game_name.trim()
					: '';
	const title = rawTitle || 'Unknown Steam title';
	return {
		id: String(appId),
		appid: appId,
		title,
		launcherId: 'steam',
		coverUrl: resolveLibraryCoverUrl(coverFallbacks[0] || null, title, 'Steam'),
		heroUrl: resolveLibraryCoverUrl(heroFallbacks[0] || coverFallbacks[0] || null, title, 'Steam'),
		coverFallbacks,
		heroFallbacks,
		genres: ['Steam'],
		tags,
		cracked: false,
		installedSize: isInstalled ? 'Installed on this PC' : `App ID ${appId}`,
		playtime: formatPlaytime(playtimeMinutes),
		playtimeMinutes,
		progress: Math.max(0, Math.min(Math.round(playtimeMinutes / 120), 100)),
		installed: isInstalled,
		owned: true,
	};
}

function normalizeItchGameId(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return null;
	const numeric = Number(raw);
	if (Number.isFinite(numeric) && numeric > 0) {
		return String(Math.trunc(numeric));
	}
	return raw.toLowerCase();
}

function extractItchOwnedGameId(ownedKey) {
	return normalizeItchGameId(
		ownedKey?.game_id ?? ownedKey?.game?.id ?? ownedKey?.download_key_id ?? ownedKey?.id,
	);
}

function extractItchInstalledGameId(installed) {
	return normalizeItchGameId(installed?.gameId ?? installed?.id);
}

function buildInlineLibraryPlaceholder(title, fallbackLabel = 'Game') {
	const rawLabel = String(title || fallbackLabel || 'Game').trim() || fallbackLabel;
	const normalizedLabel = rawLabel.replace(/\s+/g, ' ').slice(0, 28);

	const safeLabel = normalizedLabel
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

	const safeFallback = String(fallbackLabel || 'Game')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

	const svg = [
		'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420">',
		'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
		'<stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/>',
		'</linearGradient></defs>',
		'<rect width="300" height="420" fill="url(#g)"/>',
		'<rect x="18" y="18" width="264" height="384" rx="16" fill="none" stroke="#334155" stroke-width="2"/>',
		`<text x="150" y="190" text-anchor="middle" fill="#e2e8f0" font-size="26" font-family="Segoe UI, Arial, sans-serif" font-weight="700">${safeFallback}</text>`,
		`<text x="150" y="236" text-anchor="middle" fill="#94a3b8" font-size="16" font-family="Segoe UI, Arial, sans-serif">${safeLabel}</text>`,
		'</svg>',
	].join('');

	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function resolveLibraryCoverUrl(coverUrl, title, fallbackLabel = 'Game') {
	if (typeof coverUrl === 'string' && coverUrl.trim()) return coverUrl.trim();
	return buildInlineLibraryPlaceholder(title, fallbackLabel);
}

function isInlineLibraryPlaceholderCover(coverUrl) {
	const raw = String(coverUrl || '').trim().toLowerCase();
	if (!raw) return true;
	return raw.startsWith('data:image/svg+xml');
}

function extractDbLibraryCoverUrl(details) {
	const candidates = [
		details?.banner_img,
		details?.bannerImg,
		details?.db_banner_img,
		details?.cover_url,
		details?.coverUrl,
		details?.heroImage,
		details?.image,
		details?.image_url,
		details?.thumbnail,
	];

	for (const candidate of candidates) {
		const value = String(candidate || '').trim();
		if (!value) continue;
		return value;
	}

	return '';
}

function normalizeLibraryTitleForMatch(value) {
	return String(value || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function toItchLibraryGame(ownedKey, installedById, normalizedItchId) {
	if (!normalizedItchId) return null;

	const game = ownedKey?.game && typeof ownedKey.game === 'object' ? ownedKey.game : {};
	const installed = installedById.get(normalizedItchId) || null;
	const numericAppId = Number(normalizedItchId);
	const appId = Number.isFinite(numericAppId) && numericAppId > 0 ? numericAppId : null;

	const title =
		typeof game?.title === 'string' && game.title.trim()
			? game.title.trim()
			: typeof installed?.title === 'string' && installed.title.trim()
				? installed.title.trim()
				: `itch:${normalizedItchId}`;

	const url =
		typeof game?.url === 'string' && game.url.trim()
			? game.url.trim()
			: typeof installed?.url === 'string' && installed.url.trim()
				? installed.url.trim()
				: null;

	const coverUrl = resolveLibraryCoverUrl(
		game?.cover_url
		?? game?.coverUrl
		?? game?.banner_img
		?? game?.bannerImg
		?? installed?.coverUrl
		?? installed?.cover_url
		?? null,
		title,
		'Itch'
	);
	const isInstalled = !!installed;
	const tags = ['Owned'];
	if (isInstalled) {
		tags.push('Installed');
	} else {
		tags.push('Ready to install');
	}

	return {
		id: `itch:${normalizedItchId}`,
		appid: appId,
		title,
		launcherId: 'itch',
		installLocation: typeof installed?.installLocation === 'string' && installed.installLocation.trim() ? installed.installLocation.trim() : null,
		coverUrl,
		heroUrl: coverUrl,
		genres: ['Itch.io'],
		tags,
		cracked: false,
		installedSize: isInstalled ? 'Installed on this PC' : `Game ID ${normalizedItchId}`,
		playtime: '0m',
		playtimeMinutes: 0,
		progress: isInstalled ? 100 : 0,
		installed: isInstalled,
		owned: true,
		platform_name: 'itchio',
		url,
	};
}

function toItchInstalledOnlyLibraryGame(installed, normalizedItchId) {
	if (!normalizedItchId) return null;

	const numericAppId = Number(normalizedItchId);
	const appId = Number.isFinite(numericAppId) && numericAppId > 0 ? numericAppId : null;
	const title =
		typeof installed?.title === 'string' && installed.title.trim()
			? installed.title.trim()
			: `itch:${normalizedItchId}`;
	const coverUrl = resolveLibraryCoverUrl(installed?.coverUrl ?? installed?.cover_url ?? null, title, 'Itch');

	return {
		id: `itch:${normalizedItchId}`,
		appid: appId,
		title,
		launcherId: 'itch',
		installLocation: typeof installed?.installLocation === 'string' && installed.installLocation.trim() ? installed.installLocation.trim() : null,
		coverUrl,
		heroUrl: coverUrl,
		genres: ['Itch.io'],
		tags: ['Installed', 'Local'],
		cracked: false,
		installedSize: 'Installed on this PC',
		playtime: '0m',
		playtimeMinutes: 0,
		progress: 100,
		installed: true,
		owned: true,
		platform_name: 'itchio',
		url: typeof installed?.url === 'string' && installed.url.trim() ? installed.url.trim() : null,
	};
}

async function enrichItchLibraryGamesWithDbCover(games) {
	const list = Array.isArray(games) ? games : [];
	if (list.length < 1) return list;

	const api = typeof window !== 'undefined' ? window.electronAPI : null;
	if (!api || typeof api.getAllDetailsByAppIDAndPlatform !== 'function') return list;

	const pendingAppIds = [];
	const seen = new Set();

	for (const game of list) {
		const appId = Number(game?.appid);
		if (!Number.isFinite(appId) || appId <= 0) continue;

		const coverUrl = String(game?.coverUrl || '').trim();
		if (coverUrl && !isInlineLibraryPlaceholderCover(coverUrl)) continue;

		const key = String(Math.trunc(appId));
		if (seen.has(key)) continue;
		seen.add(key);
		pendingAppIds.push(Math.trunc(appId));
	}

	if (pendingAppIds.length < 1) return list;

	const coverByAppId = new Map();

	await Promise.all(
		pendingAppIds.map(async (appId) => {
			try {
				const dbDetails = await api.getAllDetailsByAppIDAndPlatform(appId, 'itchio');
				const dbCoverUrl = extractDbLibraryCoverUrl(dbDetails);
				if (dbCoverUrl) {
					coverByAppId.set(appId, dbCoverUrl);
				}
			} catch (error) {
				console.warn(`Failed to load DB cover for itch app ${appId}:`, error);
			}
		}),
	);

	if (coverByAppId.size < 1) return list;

	return list.map((game) => {
		const appId = Number(game?.appid);
		if (!Number.isFinite(appId) || appId <= 0) return game;

		const dbCoverUrl = coverByAppId.get(Math.trunc(appId));
		if (!dbCoverUrl) return game;

		const currentCover = String(game?.coverUrl || '').trim();
		if (currentCover && !isInlineLibraryPlaceholderCover(currentCover)) return game;

		return {
			...game,
			coverUrl: dbCoverUrl,
			heroUrl: dbCoverUrl,
		};
	});
}

function normalizeGogProductId(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return null;
	const numeric = Number(raw);
	if (Number.isFinite(numeric) && numeric > 0) {
		return String(Math.trunc(numeric));
	}
	return raw.toLowerCase();
}

function extractGogOwnedProductId(product) {
	return normalizeGogProductId(product?.product_id ?? product?.id);
}

function extractGogInstalledProductId(installed) {
	return normalizeGogProductId(installed?.productId ?? installed?.id);
}

function resolveGogStoreUrl(value) {
	const raw = String(value || '').trim();
	if (!raw) return null;
	if (/^https?:\/\//i.test(raw)) return raw;
	if (raw.startsWith('//')) return `https:${raw}`;
	if (raw.startsWith('/')) return `https://www.gog.com${raw}`;
	return `https://www.gog.com/${raw.replace(/^\/+/, '')}`;
}

function resolveGogCoverUrl(value, title) {
	const raw = String(value || '').trim();
	if (!raw) return resolveLibraryCoverUrl(null, title, 'GOG');

	let normalized = raw
		.replace(/%7Bformatter%7D/gi, '{formatter}')
		.replace(/%7Bext%7D/gi, '{ext}');

	if (/^https?:\/\//i.test(normalized)) {
		// already absolute
	} else if (normalized.startsWith('//')) {
		normalized = `https:${normalized}`;
	} else if (normalized.startsWith('/')) {
		normalized = `https://images.gog-statics.com${normalized}`;
	} else if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(normalized)) {
		normalized = `https://${normalized.replace(/^\/+/, '')}`;
	} else {
		normalized = `https://images.gog-statics.com/${normalized.replace(/^\/+/, '')}`;
	}

	normalized = normalized
		.replace(/\{formatter\}/gi, 'glx_vertical_cover')
		.replace(/\{ext\}/gi, 'webp');

	return normalized;
}

function toGogLibraryGame(product, installed, normalizedGogId) {
	if (!normalizedGogId) return null;
	const numericAppId = Number(normalizedGogId);
	const appId = Number.isFinite(numericAppId) && numericAppId > 0 ? numericAppId : null;

	const title =
		typeof product?.title === 'string' && product.title.trim()
			? product.title.trim()
			: typeof installed?.gameName === 'string' && installed.gameName.trim()
				? installed.gameName.trim()
				: `gog:${normalizedGogId}`;

	const isInstalled = !!installed;
	const tags = ['Owned'];
	if (isInstalled) {
		tags.push('Installed');
	} else {
		tags.push('Ready to install');
	}

	return {
		id: `gog:${normalizedGogId}`,
		appid: appId,
		title,
		launcherId: 'gog',
		installLocation: typeof installed?.installPath === 'string' && installed.installPath.trim() ? installed.installPath.trim() : null,
		coverUrl: resolveGogCoverUrl(product?.image ?? null, title),
		heroUrl: resolveGogCoverUrl(product?.image ?? null, title),
		genres: ['GOG'],
		tags,
		cracked: false,
		installedSize: isInstalled ? 'Installed on this PC' : `Product ID ${normalizedGogId}`,
		playtime: '0m',
		playtimeMinutes: 0,
		progress: isInstalled ? 100 : 0,
		installed: isInstalled,
		owned: true,
		platform_name: 'gog',
		url: resolveGogStoreUrl(product?.url ?? null),
	};
}

function toGogInstalledOnlyLibraryGame(installed, normalizedGogId) {
	if (!normalizedGogId) return null;

	const numericAppId = Number(normalizedGogId);
	const appId = Number.isFinite(numericAppId) && numericAppId > 0 ? numericAppId : null;
	const title =
		typeof installed?.gameName === 'string' && installed.gameName.trim()
			? installed.gameName.trim()
			: `gog:${normalizedGogId}`;

	return {
		id: `gog:${normalizedGogId}`,
		appid: appId,
		title,
		launcherId: 'gog',
		installLocation: typeof installed?.installPath === 'string' && installed.installPath.trim() ? installed.installPath.trim() : null,
		coverUrl: resolveLibraryCoverUrl(null, title, 'GOG'),
		heroUrl: resolveLibraryCoverUrl(null, title, 'GOG'),
		genres: ['GOG'],
		tags: ['Installed', 'Local'],
		cracked: false,
		installedSize: 'Installed on this PC',
		playtime: '0m',
		playtimeMinutes: 0,
		progress: 100,
		installed: true,
		owned: true,
		platform_name: 'gog',
		url: null,
	};
}

function normalizeLocalLibraryId(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return null;
	return raw.toLowerCase();
}

function toLocalLibraryGame(entry) {
	const normalizedLocalId = normalizeLocalLibraryId(entry?.id ?? entry?.gameId ?? entry?.executablePath);
	if (!normalizedLocalId) return null;

	const executablePath =
		typeof entry?.executablePath === 'string' && entry.executablePath.trim()
			? entry.executablePath.trim()
			: typeof entry?.path === 'string' && entry.path.trim()
				? entry.path.trim()
				: null;

	const installLocation =
		typeof entry?.installLocation === 'string' && entry.installLocation.trim()
			? entry.installLocation.trim()
			: executablePath
				? executablePath.replace(/[\\/][^\\/]+$/, '')
				: null;

	const titleFromExecutable = executablePath
		? executablePath.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').trim()
		: '';

	const title =
		typeof entry?.title === 'string' && entry.title.trim()
			? entry.title.trim()
			: titleFromExecutable || `local:${normalizedLocalId}`;

	const coverUrl = resolveLibraryCoverUrl(entry?.coverUrl ?? null, title, 'Local');

	return {
		id: `pirate:${normalizedLocalId}`,
		appid: null,
		title,
		launcherId: 'pirate',
		executablePath,
		installLocation,
		coverUrl,
		heroUrl: coverUrl,
		genres: ['Local'],
		tags: ['Installed', 'Local'],
		cracked: true,
		installedSize: installLocation ? `Installed at ${installLocation}` : 'Local executable',
		playtime: '0m',
		playtimeMinutes: 0,
		progress: 100,
		installed: true,
		owned: true,
		platform_name: 'pirate',
	};
}

function getLibraryGameKey(game) {
	if (!game || typeof game !== 'object') return null;
	const launcherId = String(game.launcherId || '').trim().toLowerCase();
	const appId = Number(game.appid);
	if (launcherId && Number.isFinite(appId) && appId > 0) {
		return `${launcherId}:${appId}`;
	}
	const id = String(game.id || '').trim();
	if (id) return `id:${id}`;
	const title = String(game.title || '').trim().toLowerCase();
	if (launcherId && title) return `${launcherId}:title:${title}`;
	return null;
}

function dedupeLibraryGames(games) {
	if (!Array.isArray(games)) return [];
	const seen = new Set();
	const out = [];
	for (const game of games) {
		if (!game) continue;
		const key = getLibraryGameKey(game) || `fallback:${out.length}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(game);
	}
	return out;
}

function createEmptyPlatformConnectionState() {
	return {
		steam: { connected: false, username: '' },
		gog: { connected: false, username: '' },
		itch: { connected: false, username: '' },
	};
}

function normalizePlatformUsersPayload(payload) {
	if (Array.isArray(payload)) return payload;
	if (Array.isArray(payload?.items)) return payload.items;
	if (Array.isArray(payload?.data)) return payload.data;
	return [];
}

function normalizePlatformIdentifier(raw) {
	return String(raw ?? '').trim().toLowerCase();
}

function normalizeLauncherFilterId(raw) {
	const normalized = normalizePlatformIdentifier(raw);
	if (!normalized) return '';
	if (normalized === 'gog.com') return 'gog';
	if (normalized === 'itchio' || normalized === 'itch.io') return 'itch';
	if (normalized === 'local') return 'pirate';
	return normalized;
}

function formatLibraryLauncherLabel(raw) {
	const normalized = normalizePlatformIdentifier(raw);
	if (!normalized) return '';
	if (normalized === 'pirate') return 'Local';
	if (normalized === 'steam') return 'Steam';
	if (normalized === 'gog' || normalized === 'gog.com') return 'GOG';
	if (normalized === 'itch' || normalized === 'itchio' || normalized === 'itch.io') return 'Itch.io';
	return normalized;
}

async function fetchRuntimePlatformConnections(electronAPI) {
	const empty = createEmptyPlatformConnectionState();
	if (!electronAPI || typeof electronAPI.getPlatformUsers !== 'function') {
		return empty;
	}

	const [usersPayload, steamPlatform, gogPlatform, itchPlatform] = await Promise.all([
		electronAPI.getPlatformUsers(),
		typeof electronAPI.getPlatform === 'function' ? electronAPI.getPlatform('steam').catch(() => null) : Promise.resolve(null),
		typeof electronAPI.getPlatform === 'function' ? electronAPI.getPlatform('gog').catch(() => null) : Promise.resolve(null),
		typeof electronAPI.getPlatform === 'function' ? electronAPI.getPlatform('itch').catch(() => null) : Promise.resolve(null),
	]);

	const users = normalizePlatformUsersPayload(usersPayload);
	const platformIds = {
		steam: normalizePlatformIdentifier(steamPlatform?.id ?? steamPlatform?.platform_id ?? steamPlatform?.platformId ?? 'steam'),
		gog: normalizePlatformIdentifier(gogPlatform?.id ?? gogPlatform?.platform_id ?? gogPlatform?.platformId ?? 'gog'),
		itch: normalizePlatformIdentifier(itchPlatform?.id ?? itchPlatform?.platform_id ?? itchPlatform?.platformId ?? 'itch'),
	};

	const resolvePlatformName = (row) => {
		const raw = normalizePlatformIdentifier(
			row?.platform_id ?? row?.platformId ?? row?.platform ?? row?.platform_name ?? row?.platformName,
		);
		if (!raw) return '';
		if (raw === platformIds.steam || raw === 'steam') return 'steam';
		if (raw === platformIds.gog || raw === 'gog' || raw === 'gog.com') return 'gog';
		if (raw === platformIds.itch || raw === 'itch' || raw === 'itchio' || raw === 'itch.io') return 'itch';
		return '';
	};

	const next = createEmptyPlatformConnectionState();
	for (const row of users) {
		if (!row || typeof row !== 'object') continue;
		const platformName = resolvePlatformName(row);
		if (!platformName) continue;

		next[platformName].connected = true;
		if (!next[platformName].username) {
			next[platformName].username = String(row?.platform_user_name ?? row?.platformUserName ?? row?.username ?? '').trim();
		}
	}

	return next;
}

const LibraryPage = () => {
	const navigate = useNavigate();
	const [libraryGames, setLibraryGames] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState('');

	const [activeLauncherId, setActiveLauncherId] = useState('all');
	const [activeGameId, setActiveGameId] = useState('');
	const [scope, setScope] = useState('all');
	const [search, setSearch] = useState('');
	const deferredSearch = useDeferredValue(search);
	const [sortBy, setSortBy] = useState('alphabetical');
	const [sortDirection, setSortDirection] = useState('asc');
	const [hideZeroPlaytime, setHideZeroPlaytime] = useState(false);
	const [showAllGames, setShowAllGames] = useState(false);
	const [stripWindowStart, setStripWindowStart] = useState(0);
	const [actionState, setActionState] = useState({ busyAction: '', text: '', type: '' });
	const launcherOptions = useMemo(
		() => (Array.isArray(launchers)
			? launchers.map((entry) => {
				const id = normalizeLauncherFilterId(entry?.id);
				if (id !== 'pirate') return entry;
				return { ...entry, name: 'Local' };
			})
			: []),
		[],
	);

	const sortLabel = useMemo(() => getLibrarySortLabel(sortBy), [sortBy]);
	const sortDirectionLabel = sortDirection === 'asc' ? 'Ascending' : 'Descending';

	const cycleSortMode = useCallback(() => {
		setSortBy((previous) => getNextLibrarySortMode(previous));
	}, []);

	const toggleSortDirection = useCallback(() => {
		setSortDirection((previous) => (previous === 'asc' ? 'desc' : 'asc'));
	}, []);

	const ownedGames = useMemo(() => {
		return dedupeLibraryGames(libraryGames.filter((g) => g.owned === true));
	}, [libraryGames]);

	useEffect(() => {
		let cancelled = false;

		const loadLibrary = async () => {
			setIsLoading(true);
			setErrorMessage('');

			try {
				if (typeof window?.electronAPI?.getSettings === 'function') {
					await window.electronAPI.getSettings();
				}
				const runtimePlatforms = await fetchRuntimePlatformConnections(window.electronAPI).catch((error) => {
					console.warn('Failed to load runtime platform connections for library:', error);
					return createEmptyPlatformConnectionState();
				});
				const steamSettings = runtimePlatforms.steam;
				const gogSettings = runtimePlatforms.gog;
				const itchSettings = runtimePlatforms.itch;

				/** @type {any[]} */
				const mergedLibraryGames = [];
				const loadErrors = [];
				const platformTasks = [];

				if (steamSettings?.connected) {
					platformTasks.push((async () => {
						try {
							const installedSteamGamesPromise = readSteamInstalledGames({ force: true });

							const [ownedSteamGames, installedSteamGames] = await Promise.all([
								window.electronAPI.getOwnedGamesFromSteam(),
								installedSteamGamesPromise.catch((error) => {
									console.warn('Failed to load installed Steam games:', error);
									return [];
								}),
							]);

							const installedAppIds = new Set(
								(Array.isArray(installedSteamGames) ? installedSteamGames : [])
									.map((game) => extractSteamAppId(game))
									.filter((appId) => appId != null),
							);

							const normalizedSteamGames = (ownedSteamGames || [])
								.map((game) => toSteamLibraryGame(game, installedAppIds))
								.filter(Boolean);
							const enrichedSteamGames = await enrichSteamLibraryGamesWithFallbackAndDbSync(normalizedSteamGames);

							return { games: enrichedSteamGames, error: '' };
						} catch (error) {
							console.error('Failed to load Steam library:', error);
							return {
								games: [],
								error: error instanceof Error ? error.message : 'Failed to load Steam library',
							};
						}
					})());
				}

				if (itchSettings?.connected) {
					platformTasks.push((async () => {
						try {
							const installedItchGamesPromise = readItchInstalledGames({ force: true });

							const itchLibraryPromise =
								typeof window.electronAPI.getItchLibrary === 'function'
									? window.electronAPI.getItchLibrary()
									: window.electronAPI.invoke('itch:get-library');

							const [itchLibraryPayload, installedItchGames] = await Promise.all([
								itchLibraryPromise.catch((error) => {
									console.warn('Failed to load itch owned library:', error);
									return null;
								}),
								installedItchGamesPromise.catch((error) => {
									console.warn('Failed to load installed itch games:', error);
									return [];
								}),
							]);

							const installedList = Array.isArray(installedItchGames) ? installedItchGames : [];
							const installedById = new Map();
							for (const installed of installedList) {
								const id = extractItchInstalledGameId(installed);
								if (!id || installedById.has(id)) continue;
								installedById.set(id, installed);
							}

							const ownedKeys = Array.isArray(itchLibraryPayload?.owned_keys) ? itchLibraryPayload.owned_keys : [];
							const ownedMapped = [];
							const usedInstalledIds = new Set();

							for (const ownedKey of ownedKeys) {
								const id = extractItchOwnedGameId(ownedKey);
								const mapped = toItchLibraryGame(ownedKey, installedById, id);
								if (!mapped) continue;
								ownedMapped.push(mapped);
								if (id) usedInstalledIds.add(id);
							}

							const installedOnlyMapped = [];
							for (const installed of installedList) {
								const id = extractItchInstalledGameId(installed);
								if (!id || usedInstalledIds.has(id)) continue;
								const mapped = toItchInstalledOnlyLibraryGame(installed, id);
								if (!mapped) continue;
								installedOnlyMapped.push(mapped);
							}

							const itchGames = [...ownedMapped, ...installedOnlyMapped];
							const enrichedItchGames = await enrichItchLibraryGamesWithDbCover(itchGames);

							return { games: enrichedItchGames, error: '' };
						} catch (error) {
							console.error('Failed to load itch library:', error);
							return {
								games: [],
								error: error instanceof Error ? error.message : 'Failed to load itch library',
							};
						}
					})());
				}

				if (gogSettings?.connected) {
					platformTasks.push((async () => {
						try {
							const installedGogGamesPromise = readGogInstalledGames({ force: true });

							const gogLibraryPromise =
								typeof window.electronAPI.getGogLibrary === 'function'
									? window.electronAPI.getGogLibrary()
									: window.electronAPI.invoke('gog:get-library');

							const [gogLibraryPayload, installedGogGames] = await Promise.all([
								gogLibraryPromise.catch((error) => {
									console.warn('Failed to load GOG owned library:', error);
									return null;
								}),
								installedGogGamesPromise.catch((error) => {
									console.warn('Failed to load installed GOG games:', error);
									return [];
								}),
							]);

							const installedList = Array.isArray(installedGogGames) ? installedGogGames : [];
							const installedById = new Map();
							const installedByTitle = new Map();
							for (const installed of installedList) {
								const id = extractGogInstalledProductId(installed);
								if (id && !installedById.has(id)) {
									installedById.set(id, installed);
								}

								const normalizedTitle = normalizeLibraryTitleForMatch(installed?.gameName);
								if (normalizedTitle && !installedByTitle.has(normalizedTitle)) {
									installedByTitle.set(normalizedTitle, installed);
								}
							}

							const ownedProducts = Array.isArray(gogLibraryPayload?.products) ? gogLibraryPayload.products : [];
							const ownedMapped = [];
							const usedInstalledIds = new Set();

							for (const product of ownedProducts) {
								const id = extractGogOwnedProductId(product);
								const normalizedTitle = normalizeLibraryTitleForMatch(product?.title);
								const installedMatch =
									(id ? installedById.get(id) : null)
									|| (normalizedTitle ? installedByTitle.get(normalizedTitle) : null)
									|| null;
								const mapped = toGogLibraryGame(product, installedMatch, id);
								if (!mapped) continue;
								ownedMapped.push(mapped);

								const matchedInstalledId = extractGogInstalledProductId(installedMatch);
								if (matchedInstalledId) usedInstalledIds.add(matchedInstalledId);
								if (id) usedInstalledIds.add(id);
							}

							const installedOnlyMapped = [];
							for (const installed of installedList) {
								const id = extractGogInstalledProductId(installed);
								if (!id || usedInstalledIds.has(id)) continue;
								const mapped = toGogInstalledOnlyLibraryGame(installed, id);
								if (!mapped) continue;
								installedOnlyMapped.push(mapped);
							}

							return { games: [...ownedMapped, ...installedOnlyMapped], error: '' };
						} catch (error) {
							console.error('Failed to load GOG library:', error);
							return {
								games: [],
								error: error instanceof Error ? error.message : 'Failed to load GOG library',
							};
						}
					})());
				}

				platformTasks.push((async () => {
					try {
						const localLibraryPayload =
							typeof window.electronAPI.getPirateLibraryGames === 'function'
								? await window.electronAPI.getPirateLibraryGames()
								: await window.electronAPI.invoke('pirate-library:get-games');

						const localLibraryEntries = Array.isArray(localLibraryPayload) ? localLibraryPayload : [];
						const normalizedLocalGames = localLibraryEntries
							.map((entry) => toLocalLibraryGame(entry))
							.filter(Boolean);

						return { games: normalizedLocalGames, error: '' };
					} catch (error) {
						console.warn('Failed to load local library:', error);
						return { games: [], error: '' };
					}
				})());

				const platformResults = await Promise.all(platformTasks);
				for (const result of platformResults) {
					if (Array.isArray(result?.games) && result.games.length > 0) {
						mergedLibraryGames.push(...result.games);
					}
					if (typeof result?.error === 'string' && result.error.trim()) {
						loadErrors.push(result.error.trim());
					}
				}

				const uniqueGames = dedupeLibraryGames(mergedLibraryGames);

				if (!cancelled) {
					setLibraryGames(uniqueGames);
					setScope('all');
					setActiveLauncherId('all');
					setActiveGameId(uniqueGames[0]?.id ?? '');
					if (!uniqueGames.length && loadErrors.length) {
						setErrorMessage(loadErrors.join(' | '));
					}
				}
			} catch (error) {
				console.error('Failed to load library:', error);
				if (!cancelled) {
					setLibraryGames([]);
					setActiveGameId('');
					setErrorMessage(error instanceof Error ? error.message : 'Failed to load library');
				}
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		};

		loadLibrary();

		return () => {
			cancelled = true;
		};
	}, []);

	const searchPool = useMemo(() => {
		if (scope === 'all' || String(activeLauncherId || '').trim().toLowerCase() === 'all') return ownedGames;
		const launcherId = normalizeLauncherFilterId(activeLauncherId);
		if (!launcherId) return ownedGames;
		return ownedGames.filter((g) => normalizeLauncherFilterId(g.launcherId) === launcherId);
	}, [activeLauncherId, scope, ownedGames]);

	const handleLauncherTabChange = (launcherId) => {
		const normalized = normalizeLauncherFilterId(launcherId);
		if (!normalized) return;
		if (normalized === 'all') {
			setScope('all');
			setActiveLauncherId('all');
			return;
		}
		setScope('launcher');
		setActiveLauncherId(normalized);
	};

	const isAllLauncherSelected = scope === 'all' || String(activeLauncherId || '').trim().toLowerCase() === 'all';

	const activeLauncherLabel = useMemo(() => {
		if (isAllLauncherSelected) return 'all platforms';
		const normalizedActiveLauncherId = String(activeLauncherId || '').trim().toLowerCase();
		const launcher = Array.isArray(launcherOptions)
			? launcherOptions.find((entry) => String(entry?.id || '').trim().toLowerCase() === normalizedActiveLauncherId)
			: null;
		return launcher?.name || formatLibraryLauncherLabel(normalizedActiveLauncherId) || 'selected platform';
	}, [activeLauncherId, isAllLauncherSelected, launcherOptions]);

	const emptyFilteredMessage = useMemo(() => {
		const q = deferredSearch.trim();

		if (isAllLauncherSelected) {
			if (q) return `No games match "${q}".`;
			return 'No games are available right now.';
		}

		if (searchPool.length < 1) {
			return `No games found for ${activeLauncherLabel}.`;
		}

		if (q) {
			return `No ${activeLauncherLabel} games match "${q}".`;
		}

		return `No games found for ${activeLauncherLabel}.`;
	}, [activeLauncherLabel, deferredSearch, isAllLauncherSelected, searchPool.length]);

	const filteredGames = useMemo(() => {
		let result = [...searchPool];

		if (hideZeroPlaytime) {
			result = result.filter((g) => Number(g.playtimeMinutes) > 0);
		}

		const q = deferredSearch.trim().toLowerCase();
		if (q) {
			result = result.filter((g) => {
				const text = [g.title, g.genres.join(' '), g.tags.join(' ')].join(' ').toLowerCase();
				return text.includes(q);
			});
		}

		result.sort((left, right) => {
			const titleCompare = String(left.title || '').localeCompare(String(right.title || ''));
			let comparison = titleCompare;

			if (sortBy === 'playtime') {
				comparison = Number(left.playtimeMinutes || 0) - Number(right.playtimeMinutes || 0);
				if (comparison === 0) comparison = titleCompare;
			}

			if (sortBy === 'appid') {
				const leftAppId = Number(left.appid);
				const rightAppId = Number(right.appid);
				const leftHasAppId = Number.isFinite(leftAppId) && leftAppId > 0;
				const rightHasAppId = Number.isFinite(rightAppId) && rightAppId > 0;

				if (leftHasAppId && rightHasAppId && leftAppId !== rightAppId) {
					comparison = leftAppId - rightAppId;
				} else if (leftHasAppId !== rightHasAppId) {
					comparison = leftHasAppId ? -1 : 1;
				} else {
					comparison = titleCompare;
				}
			}

			if (sortBy === 'platform') {
				const leftPlatform = String(left.launcherId || left.platform_name || '').trim().toLowerCase();
				const rightPlatform = String(right.launcherId || right.platform_name || '').trim().toLowerCase();
				comparison = leftPlatform.localeCompare(rightPlatform);
				if (comparison === 0) comparison = titleCompare;
			}

			return sortDirection === 'asc' ? comparison : -comparison;
		});

		return dedupeLibraryGames(result);
	}, [deferredSearch, hideZeroPlaytime, searchPool, sortBy, sortDirection]);

	const filteredGamesById = useMemo(
		() => new Map(filteredGames.map((game) => [game.id, game])),
		[filteredGames],
	);

	const activeGame = useMemo(() => {
		if (!filteredGames.length) return null;
		return filteredGamesById.get(activeGameId) ?? filteredGames[0] ?? null;
	}, [activeGameId, filteredGames, filteredGamesById]);

	useEffect(() => {
		if (!filteredGames.length) {
			if (activeGameId !== '') setActiveGameId('');
			return;
		}
		if (!filteredGamesById.has(activeGameId)) {
			setActiveGameId(filteredGames[0].id);
		}
	}, [activeGameId, filteredGames, filteredGamesById]);

	useEffect(() => {
		if (filteredGames.length <= MAX_LIBRARY_STRIP_GAMES) {
			if (stripWindowStart !== 0) setStripWindowStart(0);
			return;
		}

		const activeIndex = filteredGames.findIndex((game) => game.id === activeGameId);
		if (activeIndex < 0) {
			if (stripWindowStart !== 0) setStripWindowStart(0);
			return;
		}

		const maxStart = Math.max(0, filteredGames.length - MAX_LIBRARY_STRIP_GAMES);
		const clampedStart = Math.min(Math.max(stripWindowStart, 0), maxStart);
		if (clampedStart !== stripWindowStart) {
			setStripWindowStart(clampedStart);
			return;
		}

		const windowEnd = clampedStart + MAX_LIBRARY_STRIP_GAMES;
		const isOutsideWindow = activeIndex < clampedStart || activeIndex >= windowEnd;
		const nearWindowStart = activeIndex < clampedStart + STRIP_WINDOW_EDGE_BUFFER;
		const nearWindowEnd = activeIndex >= windowEnd - STRIP_WINDOW_EDGE_BUFFER;

		if (isOutsideWindow || nearWindowStart || nearWindowEnd) {
			let nextStart = Math.max(0, activeIndex - Math.floor(MAX_LIBRARY_STRIP_GAMES / 2));
			nextStart = Math.min(nextStart, maxStart);
			if (nextStart !== stripWindowStart) {
				setStripWindowStart(nextStart);
			}
		}
	}, [activeGameId, filteredGames, stripWindowStart]);

	const stripGames = useMemo(() => {
		if (filteredGames.length <= MAX_LIBRARY_STRIP_GAMES) return filteredGames;

		const maxStart = Math.max(0, filteredGames.length - MAX_LIBRARY_STRIP_GAMES);
		let start = Math.min(Math.max(stripWindowStart, 0), maxStart);
		return filteredGames.slice(start, start + MAX_LIBRARY_STRIP_GAMES);
	}, [filteredGames, stripWindowStart]);

	const activeGameAppId = Number(activeGame?.appid);
	const activeGogProductId = normalizeGogProductId(
		Number.isFinite(activeGameAppId) && activeGameAppId > 0
			? activeGameAppId
			: String(activeGame?.id || '').replace(/^gog:/i, ''),
	);
	const normalizedLauncherId = String(activeGame?.launcherId || '').trim().toLowerCase();
	const activeItchGameUrl = typeof activeGame?.url === 'string' ? activeGame.url.trim() : '';
	const activeItchInstallLocation = typeof activeGame?.installLocation === 'string' ? activeGame.installLocation.trim() : '';
	const activeLocalExecutablePath = typeof activeGame?.executablePath === 'string' ? activeGame.executablePath.trim() : '';
	const activeLocalLibraryId = String(activeGame?.id || '').replace(/^pirate:/i, '').trim();
	const hasActiveItchGameUrl = /^https?:\/\//i.test(activeItchGameUrl);
	const hasActiveItchInstallLocation = activeItchInstallLocation.length > 0;
	const hasActiveLocalExecutablePath = activeLocalExecutablePath.length > 0;
	const isSteamLauncher = normalizedLauncherId === 'steam';
	const isGogLauncher = normalizedLauncherId === 'gog' || normalizedLauncherId === 'gog.com';
	const isItchLauncher = normalizedLauncherId === 'itch' || normalizedLauncherId === 'itchio' || normalizedLauncherId === 'itch.io';
	const isLocalLauncher = normalizedLauncherId === 'pirate';
	const canUseSteamActions = Number.isFinite(activeGameAppId) && activeGameAppId > 0 && isSteamLauncher;
	const canUseGogActions = isGogLauncher && !!activeGogProductId;
	const canUseLocalActions = isLocalLauncher && hasActiveLocalExecutablePath;
	const canExecuteItchAction =
		isItchLauncher
		&& ((Number.isFinite(activeGameAppId) && activeGameAppId > 0) || hasActiveItchGameUrl || hasActiveItchInstallLocation);
	const canUsePrimaryAction = canUseSteamActions || canUseGogActions || canExecuteItchAction || canUseLocalActions;
	const isActiveGameInstalled = activeGame?.installed === true;
	const canUseRemoveAction =
		isActiveGameInstalled
		&& (canUseSteamActions || canUseGogActions || canExecuteItchAction || canUseLocalActions);
	const primaryAction = isActiveGameInstalled ? 'open' : 'install';
	const primaryActionLabel = isActiveGameInstalled ? 'OPEN' : 'INSTALL';
	const primaryActionBusyLabel = isActiveGameInstalled ? 'OPENING' : 'INSTALLING';
	const primaryActionUsesDownloadStyle = !isActiveGameInstalled;

	const markLibraryGameAsNotInstalled = (gameId) => {
		setLibraryGames((previous) =>
			previous.map((game) => {
				if (game?.id !== gameId) return game;

				const launcher = String(game?.launcherId || game?.platform_name || '').trim().toLowerCase();
				const baseTags = Array.isArray(game?.tags)
					? game.tags.filter((tag) => {
						const normalizedTag = String(tag || '').trim().toLowerCase();
						return normalizedTag !== 'installed' && normalizedTag !== 'local';
					})
					: [];

				if (launcher !== 'pirate' && !baseTags.some((tag) => String(tag || '').trim().toLowerCase() === 'ready to install')) {
					baseTags.push('Ready to install');
				}

				const numericAppId = Number(game?.appid);
				let installedSize = game?.installedSize;
				if (launcher === 'steam' && Number.isFinite(numericAppId) && numericAppId > 0) {
					installedSize = `App ID ${numericAppId}`;
				} else if ((launcher === 'gog' || launcher === 'gog.com')) {
					const normalizedGogId = normalizeGogProductId(
						game?.appid ?? String(game?.id || '').replace(/^gog:/i, ''),
					);
					if (normalizedGogId) installedSize = `Product ID ${normalizedGogId}`;
				} else if (launcher === 'itch' || launcher === 'itchio' || launcher === 'itch.io') {
					const normalizedItchId = normalizeItchGameId(
						game?.appid ?? String(game?.id || '').replace(/^itch:/i, ''),
					);
					if (normalizedItchId) installedSize = `Game ID ${normalizedItchId}`;
				}

				return {
					...game,
					installed: false,
					progress: 0,
					tags: baseTags,
					installedSize,
				};
			}),
		);
	};

	const refreshGogInstalledState = async ({
		targetProductId = null,
		targetTitle = '',
		targetExpectedInstalled = null,
		attempts = 1,
		intervalMs = 0,
	} = {}) => {
		const normalizedTargetProductId = normalizeGogProductId(targetProductId);
		const normalizedTargetTitle = normalizeLibraryTitleForMatch(targetTitle);

		for (let attempt = 0; attempt < attempts; attempt += 1) {
			try {
				const installedList = await readGogInstalledGames({ force: true });
				const installedIds = new Set(
					installedList
						.map((entry) => extractGogInstalledProductId(entry))
						.filter((id) => !!id),
				);
				const installedTitles = new Set(
					installedList
						.map((entry) => normalizeLibraryTitleForMatch(entry?.gameName))
						.filter((title) => !!title),
				);

				let targetIsInstalled = false;
				setLibraryGames((previous) =>
					previous.map((game) => {
						const launcher = String(game?.launcherId || game?.platform_name || '').trim().toLowerCase();
						if (launcher !== 'gog' && launcher !== 'gog.com') return game;

						const normalizedId = normalizeGogProductId(
							game?.appid ?? String(game?.id || '').replace(/^gog:/i, ''),
						);
						const titleKey = normalizeLibraryTitleForMatch(game?.title);
						const actualInstalled = !!(
							(normalizedId && installedIds.has(normalizedId))
							|| (titleKey && installedTitles.has(titleKey))
						);

						const matchesTarget = !!(
							(normalizedTargetProductId && normalizedId === normalizedTargetProductId)
							|| (normalizedTargetTitle && titleKey === normalizedTargetTitle)
						);
						if (matchesTarget) {
							targetIsInstalled = actualInstalled;
						}

						const keepOptimisticNotInstalled = matchesTarget && targetExpectedInstalled === false && actualInstalled;
						const isInstalled = keepOptimisticNotInstalled ? false : actualInstalled;

						if ((game?.installed === true) === isInstalled) return game;

						const baseTags = Array.isArray(game?.tags)
							? game.tags.filter((tag) => {
								const normalizedTag = String(tag || '').trim().toLowerCase();
								return normalizedTag !== 'installed' && normalizedTag !== 'ready to install';
							})
							: [];

						return {
							...game,
							installed: isInstalled,
							progress: isInstalled ? 100 : 0,
							installedSize: isInstalled
								? 'Installed on this PC'
								: (normalizedId ? `Product ID ${normalizedId}` : game?.installedSize),
							tags: [...baseTags, isInstalled ? 'Installed' : 'Ready to install'],
						};
					}),
				);

				const hasTarget = !!(normalizedTargetProductId || normalizedTargetTitle);
				if (!hasTarget) {
					return targetIsInstalled;
				}

				if (targetExpectedInstalled == null || targetIsInstalled === targetExpectedInstalled) {
					return targetIsInstalled;
				}
			} catch (error) {
				console.warn('Failed to refresh GOG installed state:', error);
				return false;
			}

			if (attempt + 1 < attempts && intervalMs > 0) {
				await delay(intervalMs);
			}
		}

		return false;
	};

	const refreshSteamInstalledState = async ({ targetAppId = null, attempts = 1, intervalMs = 0 } = {}) => {
		const normalizedTargetAppId = extractSteamAppId({ appid: targetAppId });

		for (let attempt = 0; attempt < attempts; attempt += 1) {
			try {
				const installedIds = new Set(
					(await readSteamInstalledGames({ force: true }))
						.map((entry) => extractSteamAppId(entry))
						.filter((id) => id != null),
				);

				let targetIsInstalled = false;
				setLibraryGames((previous) =>
					previous.map((game) => {
						const launcher = String(game?.launcherId || game?.platform_name || '').trim().toLowerCase();
						if (launcher !== 'steam') return game;

						const appId = extractSteamAppId(game);
						const isInstalled = appId != null && installedIds.has(appId);

						if (normalizedTargetAppId != null && appId === normalizedTargetAppId && isInstalled) {
							targetIsInstalled = true;
						}

						if ((game?.installed === true) === isInstalled) return game;

						const baseTags = Array.isArray(game?.tags)
							? game.tags.filter((tag) => {
								const normalizedTag = String(tag || '').trim().toLowerCase();
								return normalizedTag !== 'installed' && normalizedTag !== 'ready to install';
							})
							: [];

						return {
							...game,
							installed: isInstalled,
							progress: isInstalled ? 100 : 0,
							installedSize: isInstalled
								? 'Installed on this PC'
								: (appId != null ? `App ID ${appId}` : game?.installedSize),
							tags: [...baseTags, isInstalled ? 'Installed' : 'Ready to install'],
						};
					}),
				);

				if (normalizedTargetAppId == null || targetIsInstalled) {
					return targetIsInstalled;
				}
			} catch (error) {
				console.warn('Failed to refresh Steam installed state:', error);
				return false;
			}

			if (attempt + 1 < attempts && intervalMs > 0) {
				await delay(intervalMs);
			}
		}

		return false;
	};

	const refreshItchInstalledState = async ({ targetGameId = null, targetGameUrl = '', targetTitle = '', attempts = 1, intervalMs = 0 } = {}) => {
		const normalizedTargetGameId = normalizeItchGameId(targetGameId);
		const normalizedTargetGameUrl = String(targetGameUrl || '').trim().toLowerCase();
		const normalizedTargetTitle = normalizeLibraryTitleForMatch(targetTitle);

		for (let attempt = 0; attempt < attempts; attempt += 1) {
			try {
				const installedList = await readItchInstalledGames({ force: true });
				const installedById = new Map();
				const installedByUrl = new Map();
				const installedByTitle = new Map();

				for (const installed of installedList) {
					const normalizedId = extractItchInstalledGameId(installed);
					if (normalizedId && !installedById.has(normalizedId)) {
						installedById.set(normalizedId, installed);
					}

					const normalizedUrl = String(installed?.url || '').trim().toLowerCase();
					if (normalizedUrl && !installedByUrl.has(normalizedUrl)) {
						installedByUrl.set(normalizedUrl, installed);
					}

					const normalizedTitle = normalizeLibraryTitleForMatch(installed?.title);
					if (normalizedTitle && !installedByTitle.has(normalizedTitle)) {
						installedByTitle.set(normalizedTitle, installed);
					}
				}

				let targetIsInstalled = false;
				setLibraryGames((previous) =>
					previous.map((game) => {
						const launcher = String(game?.launcherId || game?.platform_name || '').trim().toLowerCase();
						if (launcher !== 'itch' && launcher !== 'itchio' && launcher !== 'itch.io') return game;

						const normalizedId = normalizeItchGameId(
							game?.appid ?? String(game?.id || '').replace(/^itch:/i, ''),
						);
						const normalizedUrl = String(game?.url || '').trim().toLowerCase();
						const normalizedTitle = normalizeLibraryTitleForMatch(game?.title);

						const installedMatch =
							(normalizedId ? installedById.get(normalizedId) : null)
							|| (normalizedUrl ? installedByUrl.get(normalizedUrl) : null)
							|| (normalizedTitle ? installedByTitle.get(normalizedTitle) : null)
							|| null;

						const isInstalled = !!installedMatch;
						const matchesTarget = !!(
							(normalizedTargetGameId && normalizedId === normalizedTargetGameId)
							|| (normalizedTargetGameUrl && normalizedUrl === normalizedTargetGameUrl)
							|| (normalizedTargetTitle && normalizedTitle === normalizedTargetTitle)
						);

						if (matchesTarget && isInstalled) {
							targetIsInstalled = true;
						}

						if ((game?.installed === true) === isInstalled) return game;

						const baseTags = Array.isArray(game?.tags)
							? game.tags.filter((tag) => {
								const normalizedTag = String(tag || '').trim().toLowerCase();
								return normalizedTag !== 'installed' && normalizedTag !== 'ready to install';
							})
							: [];

						return {
							...game,
							installed: isInstalled,
							progress: isInstalled ? 100 : 0,
							installLocation: isInstalled
								? (typeof installedMatch?.installLocation === 'string' && installedMatch.installLocation.trim()
									? installedMatch.installLocation.trim()
									: game?.installLocation)
								: game?.installLocation,
							installedSize: isInstalled
								? 'Installed on this PC'
								: (normalizedId ? `Game ID ${normalizedId}` : game?.installedSize),
							tags: [...baseTags, isInstalled ? 'Installed' : 'Ready to install'],
						};
					}),
				);

				if (!(normalizedTargetGameId || normalizedTargetGameUrl || normalizedTargetTitle) || targetIsInstalled) {
					return targetIsInstalled;
				}
			} catch (error) {
				console.warn('Failed to refresh Itch installed state:', error);
				return false;
			}

			if (attempt + 1 < attempts && intervalMs > 0) {
				await delay(intervalMs);
			}
		}

		return false;
	};

	const handleLibraryAction = async (action) => {
		if (!canUsePrimaryAction) {
			setActionState({
				busyAction: '',
				text: 'Open/Install actions are available for Steam, GOG, Itch, and local items.',
				type: 'error',
			});
			return;
		}

		const actions = {
			open: {
				fn: () => {
					if (canUseSteamActions) {
						return window.electronAPI.runSteamGame(activeGameAppId);
					}
					if (canUseGogActions) {
						return window.electronAPI.runGogGame(activeGogProductId);
					}
					if (canUseLocalActions) {
						return window.electronAPI.runPirateLibraryGame(activeLocalExecutablePath);
					}
					if (canExecuteItchAction) {
						return window.electronAPI.runItchGame(
							Number.isFinite(activeGameAppId) && activeGameAppId > 0 ? activeGameAppId : null,
							activeItchGameUrl || null,
							activeItchInstallLocation || null,
						);
					}
					throw new Error('No valid launch target is available for this game.');
				},
				success: `${activeGame?.title || 'Game'} launched via ${canUseSteamActions ? 'Steam' : (canUseGogActions ? 'GOG Galaxy' : (canUseLocalActions ? 'local executable' : 'Itch.io'))}.`,
			},
			install: {
				fn: () => {
					if (canUseSteamActions) {
						return window.electronAPI.installSteamGame(activeGameAppId);
					}
					if (canUseGogActions) {
						return window.electronAPI.installGogGame(activeGogProductId);
					}
					if (canExecuteItchAction) {
						return window.electronAPI.installItchGame(
							Number.isFinite(activeGameAppId) && activeGameAppId > 0 ? activeGameAppId : null,
							activeItchGameUrl || null,
						);
					}
					throw new Error('This itch game has no valid game ID or URL for install action.');
				},
				success: `Opened ${canUseSteamActions ? 'Steam' : (canUseGogActions ? 'GOG Galaxy' : 'Itch.io')} install flow for ${activeGame?.title || 'game'}.`,
			},
		};

		const selectedAction = actions[action];
		if (!selectedAction) return;

		try {
			setActionState({ busyAction: action, text: '', type: '' });
			await selectedAction.fn();
			const activeTitle = activeGame?.title || 'Game';

			if (action === 'install' && canUseSteamActions) {
				setActionState({ busyAction: '', text: selectedAction.success, type: 'success' });
				invalidateInstalledScanCache('steam');

				void (async () => {
					const installed = await refreshSteamInstalledState({
						targetAppId: activeGameAppId,
						attempts: 30,
						intervalMs: 4_000,
					});
					if (installed) {
						setActionState({
							busyAction: '',
							text: `${activeTitle} is installed and ready to launch.`,
							type: 'success',
						});
					}
				})();
				return;
			}

			if (action === 'install' && canExecuteItchAction) {
				setActionState({ busyAction: '', text: selectedAction.success, type: 'success' });
				invalidateInstalledScanCache('itch');

				const targetGameId = normalizeItchGameId(
					Number.isFinite(activeGameAppId) && activeGameAppId > 0
						? activeGameAppId
						: String(activeGame?.id || '').replace(/^itch:/i, ''),
				);

				void (async () => {
					const installed = await refreshItchInstalledState({
						targetGameId,
						targetGameUrl: activeItchGameUrl || '',
						targetTitle: activeTitle,
						attempts: 30,
						intervalMs: 4_000,
					});
					if (installed) {
						setActionState({
							busyAction: '',
							text: `${activeTitle} is installed and ready to launch.`,
							type: 'success',
						});
					}
				})();
				return;
			}

			if (action === 'install' && canUseGogActions) {
				setActionState({ busyAction: '', text: selectedAction.success, type: 'success' });
				invalidateInstalledScanCache('gog');

				const targetProductId = activeGogProductId;
				void (async () => {
					const installed = await refreshGogInstalledState({
						targetProductId,
						targetTitle: activeTitle,
						targetExpectedInstalled: true,
						attempts: 30,
						intervalMs: 4_000,
					});
					if (installed) {
						setActionState({
							busyAction: '',
							text: `${activeGame?.title || 'Game'} is installed and ready to launch.`,
							type: 'success',
						});
					}
				})();
				return;
			}

			if (action === 'open' && canUseSteamActions) {
				void refreshSteamInstalledState({ attempts: 1 });
			}

			if (action === 'open' && canExecuteItchAction) {
				void refreshItchInstalledState({ attempts: 1 });
			}

			if (action === 'open' && canUseGogActions) {
				void refreshGogInstalledState({ attempts: 1 });
			}

			setActionState({ busyAction: '', text: selectedAction.success, type: 'success' });
		} catch (error) {
			console.error(`Failed to ${action} library game:`, error);
			setActionState({
				busyAction: '',
				text: error instanceof Error ? error.message : `Failed to ${action} library game.`,
				type: 'error',
			});
		}
	};

	const handleAddLocalLibraryGame = async () => {
		try {
			setActionState({ busyAction: 'add-local', text: '', type: '' });

			const localPayload =
				typeof window.electronAPI.addPirateLibraryGameFromDialog === 'function'
					? await window.electronAPI.addPirateLibraryGameFromDialog()
					: await window.electronAPI.invoke('pirate-library:add-game-from-dialog');

			if (!localPayload) {
				setActionState({ busyAction: '', text: '', type: '' });
				return;
			}

			const mapped = toLocalLibraryGame(localPayload);
			if (!mapped) throw new Error('Selected executable could not be added to local library.');

			setLibraryGames((previous) => dedupeLibraryGames([mapped, ...previous]));
			setActiveLauncherId('pirate');
			setActiveGameId(mapped.id);
			setActionState({ busyAction: '', text: `Added ${mapped.title} to local library.`, type: 'success' });
		} catch (error) {
			console.error('Failed to add local library game:', error);
			setActionState({
				busyAction: '',
				text: error instanceof Error ? error.message : 'Failed to add local game.',
				type: 'error',
			});
		}
	};

	const handleRemoveInstalledGame = async () => {
		if (!activeGame || !canUseRemoveAction) return;

		try {
			setActionState({ busyAction: 'remove', text: '', type: '' });

			if (canUseLocalActions) {
				if (!activeLocalLibraryId) throw new Error('Local game id is missing.');
				if (typeof window.electronAPI.removePirateLibraryGame === 'function') {
					await window.electronAPI.removePirateLibraryGame(activeLocalLibraryId);
				} else {
					await window.electronAPI.invoke('pirate-library:remove-game', activeLocalLibraryId);
				}

				setLibraryGames((previous) => previous.filter((game) => game?.id !== activeGame.id));
				setActionState({
					busyAction: '',
					text: `${activeGame.title || 'Game'} removed from local library.`,
					type: 'success',
				});
				return;
			}

			if (canUseSteamActions) {
				await window.electronAPI.deleteSteamGame(activeGameAppId);
				markLibraryGameAsNotInstalled(activeGame.id);
				invalidateInstalledScanCache('steam');
				setActionState({
					busyAction: '',
					text: `Opened Steam uninstall flow for ${activeGame.title || 'game'}.`,
					type: 'success',
				});
				return;
			}

			if (canUseGogActions) {
				if (typeof window.electronAPI.deleteGogGame === 'function') {
					await window.electronAPI.deleteGogGame(activeGogProductId);
				} else {
					await window.electronAPI.invoke('gog:delete-game', activeGogProductId);
				}
				markLibraryGameAsNotInstalled(activeGame.id);
				invalidateInstalledScanCache('gog');
				setActionState({
					busyAction: '',
					text: `Opened GOG uninstall flow for ${activeGame.title || 'game'}.`,
					type: 'success',
				});
				void refreshGogInstalledState({
					targetProductId: activeGogProductId,
					targetTitle: activeGame?.title || '',
					targetExpectedInstalled: false,
					attempts: 30,
					intervalMs: 4_000,
				});
				return;
			}

			if (canExecuteItchAction) {
				if (typeof window.electronAPI.deleteItchGame === 'function') {
					await window.electronAPI.deleteItchGame(
						Number.isFinite(activeGameAppId) && activeGameAppId > 0 ? activeGameAppId : null,
						activeItchGameUrl || null,
						activeItchInstallLocation || null,
					);
				} else {
					await window.electronAPI.invoke(
						'itch:delete-game',
						Number.isFinite(activeGameAppId) && activeGameAppId > 0 ? activeGameAppId : null,
						activeItchGameUrl || null,
						activeItchInstallLocation || null,
					);
				}
				markLibraryGameAsNotInstalled(activeGame.id);
				invalidateInstalledScanCache('itch');
				setActionState({
					busyAction: '',
					text: `Opened Itch uninstall flow for ${activeGame.title || 'game'}.`,
					type: 'success',
				});
				return;
			}

			throw new Error('Remove action is not available for this game.');
		} catch (error) {
			console.error('Failed to remove installed game:', error);
			setActionState({
				busyAction: '',
				text: error instanceof Error ? error.message : 'Failed to remove installed game.',
				type: 'error',
			});
		}
	};

	const handleOpenStorePage = useCallback((game) => {
		const appId = Number(game?.appid ?? game?.id);
		if (!Number.isFinite(appId) || appId <= 0) return;
		const numericPlatformId = Number(game?.platform_id ?? game?.platformId);
		let routePlatform = 'steam';
		if (Number.isFinite(numericPlatformId)) {
			if (numericPlatformId === 2) routePlatform = 'gog';
			else if (numericPlatformId === 3) routePlatform = 'itchio';
			else if (numericPlatformId === 4) routePlatform = 'epic';
		} else {
			const rawPlatform = String(game?.launcherId || game?.platform_name || game?.platform || 'steam').trim().toLowerCase();
			if (rawPlatform === 'itch' || rawPlatform === 'itch.io' || rawPlatform === 'itchio') routePlatform = 'itchio';
			else if (rawPlatform === 'gog' || rawPlatform === 'gog.com') routePlatform = 'gog';
			else if (rawPlatform === 'epic games' || rawPlatform === 'epic_games' || rawPlatform === 'epic') routePlatform = 'epic';
			else routePlatform = rawPlatform || 'steam';
		}
		navigate(`/store/game/${encodeURIComponent(routePlatform)}/${appId}`, {
			state: {
				game,
			},
		});
	}, [navigate]);

	if (isLoading) {
		return (
			<main className="library-page flex items-center justify-center">
				<div className="text-center text-white">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
					<p>Loading your library...</p>
				</div>
			</main>
		);
	}

	return (
		<main className="library-page">
			{/* Dynamic hero background */}
			<div
				className="library-hero-bg"
				style={{ backgroundImage: `url(${activeGame?.heroUrl ?? ''})` }}
			/>
			<div className="library-hero-overlay" />

			{/* Library header with owned games count */}
			<div className="absolute top-4 left-6 z-10">
				
				<p className="text-sm text-slate-300">
					{ownedGames.length} {ownedGames.length === 1 ? 'game' : 'games'} owned
					{scope === 'launcher' && String(activeLauncherId || '').trim().toLowerCase() !== 'all' && searchPool.length > 0 && ` • ${searchPool.length} on ${formatLibraryLauncherLabel(activeLauncherId)}`}
				</p>
			</div>

			{/* Empty state when no owned games */}
			{ownedGames.length === 0 ? (
				<div className="flex items-center justify-center h-full">
					<div className="text-center text-white">
						<svg className="w-24 h-24 mx-auto mb-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
						</svg>
						<h2 className="text-2xl font-semibold mb-2">No games in your library</h2>
						<p className="text-slate-400 mb-2">
							{errorMessage || 'Connect Steam, GOG, or Itch.io on the settings page, or add a local EXE.'}
						</p>
						<p className="text-slate-500 mb-6">Start by connecting your gaming platforms or browse the store</p>
						<div className="flex gap-3 justify-center">
							<button
								onClick={() => window.location.hash = '/settings'}
								className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
							>
								Connect Platforms
							</button>
							<button
								onClick={handleAddLocalLibraryGame}
								className="px-6 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg font-medium transition-colors"
								disabled={actionState.busyAction !== ''}
							>
								{actionState.busyAction === 'add-local' ? 'Adding EXE...' : 'Add Local EXE'}
							</button>
							<button
								onClick={() => window.location.hash = '/store'}
								className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
							>
								Browse Store
							</button>
						</div>
					</div>
				</div>
			) : (
				<>
					{/* Control board: search + launcher tabs */}
			<section className="library-control-board">
				<header className="library-control-header">
					<label className="library-search-label">
						<span className="library-search-hint">Search</span>
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="title, genre, tag"
							className="library-search-input"
						/>
					</label>

					<button
						type="button"
						className="library-menu-btn"
						onClick={toggleSortDirection}
						title={`Sort direction: ${sortDirectionLabel}`}
						aria-label={`Toggle sort direction (${sortDirectionLabel})`}
					>
						{sortDirection === 'asc' ? '↑' : '↓'}
					</button>

					<button
						type="button"
						className="library-menu-btn"
						onClick={cycleSortMode}
						title="Cycle sort mode"
					>
						{`Sort: ${sortLabel}`}
					</button>

					<button
						type="button"
						className="library-add-local-btn"
						onClick={handleAddLocalLibraryGame}
						disabled={actionState.busyAction !== ''}
					>
						{actionState.busyAction === 'add-local' ? 'Adding EXE...' : 'Add Local EXE'}
					</button>

				</header>

				<LauncherTabs
					launchers={launcherOptions}
					activeLauncherId={activeLauncherId}
					showAllOption
					isAllActive={scope === 'all' || String(activeLauncherId || '').trim().toLowerCase() === 'all'}
					onChange={handleLauncherTabChange}
				/>
				{actionState.text ? (
					<p className={`library-action-notice ${actionState.type === 'error' ? 'library-action-notice-error' : ''}`}>
						{actionState.text}
					</p>
				) : null}
			</section>

			{/* Bottom dock: game strip + status bar */}
			<div className="library-bottom-dock">
				<div className="library-dock-inner">
					{filteredGames.length > 0 ? (
						<>
							<div className="library-dock-strip-area group">
								<LibraryGameStrip
									games={stripGames}
									activeGameId={activeGame?.id ?? ''}
									onSelect={setActiveGameId}
									onOpenStore={handleOpenStorePage}
								/>
							</div>

							{/* Status bar */}
							<div className="library-status-bar group">
								<div className="library-status-left">
									<h2 className="library-status-title">{activeGame?.title ?? 'No game'}</h2>
									<p className="library-status-launcher">{formatLibraryLauncherLabel(activeGame?.launcherId ?? '')}</p>
									<div className="library-status-tags">
										{(activeGame?.tags ?? []).slice(0, 3).map((tag) => (
											<span key={tag} className="library-status-tag">{tag}</span>
										))}
									</div>
								</div>

								<div className="library-status-right">
									<p className="library-status-size">{activeGame?.installedSize ?? '0 MB'}</p>
									<div className="library-status-actions">
										<button
											type="button"
											className={`library-play-btn ${primaryActionUsesDownloadStyle ? 'library-play-btn-download' : ''}`}
											onClick={() => handleLibraryAction(primaryAction)}
											disabled={!canUsePrimaryAction || actionState.busyAction !== ''}
										>
											{actionState.busyAction === primaryAction ? primaryActionBusyLabel : primaryActionLabel}
											{isActiveGameInstalled ? (
												<svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
													<path d="m8 5 11 7-11 7V5z" />
												</svg>
											) : (
												<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
													<path d="M12 4v10m0 0 4-4m-4 4-4-4M4 19h16" />
												</svg>
											)}
										</button>

										{isActiveGameInstalled ? (
											<button
												type="button"
												className="library-secondary-btn library-remove-btn"
												onClick={handleRemoveInstalledGame}
												disabled={!canUseRemoveAction || actionState.busyAction !== ''}
											>
												{actionState.busyAction === 'remove' ? 'REMOVING' : 'REMOVE'}
											</button>
										) : null}
									</div>
								</div>

								<div className="library-status-meta">
									<span>{activeGame?.playtime ?? '0h'}</span>
								</div>
							</div>
						</>
					) : (
						<div className="library-status-bar group">
							<div className="library-status-left">
								<h2 className="library-status-title">No games to show</h2>
								<p className="library-status-launcher">{emptyFilteredMessage}</p>
							</div>
							{!isAllLauncherSelected ? (
								<div className="library-status-right">
									<div className="library-status-actions">
										<button
											type="button"
											className="library-secondary-btn"
											onClick={() => handleLauncherTabChange('all')}
										>
											SHOW ALL
										</button>
									</div>
								</div>
							) : null}
						</div>
					)}
				</div>
			</div>

			{/* All games drawer */}
			<AllGamesDrawer
				open={showAllGames}
				games={filteredGames}
				launchers={launcherOptions}
				activeGameId={activeGame?.id ?? ''}
				onClose={() => setShowAllGames(false)}
				onSelectGame={setActiveGameId}
			/>
				</>
			)}
		</main>
	);
};

export default LibraryPage;

