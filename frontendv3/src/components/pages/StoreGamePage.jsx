import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useDownloadManager } from '../../context/DownloadManagerContext.jsx';

const STORE_GAME_DEBUG_STORAGE_KEY = 'wl:store-game-page-debug';

function parseDebugBool(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (!normalized) return null;
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return null;
}

function readStoreGameDebugOptions(search) {
	const defaults = { enabled: false, verbose: false, panel: false };
	const merged = { ...defaults };

	if (typeof window !== 'undefined') {
		try {
			const raw = window.localStorage.getItem(STORE_GAME_DEBUG_STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw);
				if (parsed && typeof parsed === 'object') {
					merged.enabled = Boolean(parsed.enabled);
					merged.verbose = Boolean(parsed.verbose);
					merged.panel = Boolean(parsed.panel);
				}
			}
		} catch {
			// ignore malformed localStorage payloads
		}
	}

	const params = new URLSearchParams(String(search || ''));
	const enabledParam = parseDebugBool(params.get('storeDebug'));
	const verboseParam = parseDebugBool(params.get('storeDebugVerbose'));
	const panelParam = parseDebugBool(params.get('storeDebugPanel'));

	if (enabledParam !== null) merged.enabled = enabledParam;
	if (verboseParam !== null) merged.verbose = verboseParam;
	if (panelParam !== null) merged.panel = panelParam;

	if (!merged.enabled) {
		merged.verbose = false;
		merged.panel = false;
	}

	return merged;
}

const fallback = {
	id: null,
	appid: null,
	title: 'Store Game',
	heroImage: '',
	coverImage: '',
	description: '',
	longDescription: '',
	tags: [],
	sites: [],
	screenshots: [],
	minimumRequirements: '',
	price: null,
	platform_name: 'steam',
};

function steamImages(appid) {
	const id = Number(appid);
	if (!Number.isFinite(id) || id <= 0) return null;
	return {
		hero: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_hero.jpg`,
		cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
		header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`,
		capsule: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/capsule_616x353.jpg`,
	};
}

function normalizePlatformName(value, platformId) {
	const numericPlatformId = Number(platformId ?? value);
	if (Number.isFinite(numericPlatformId)) {
		if (numericPlatformId === 1) return 'steam';
		if (numericPlatformId === 2) return 'gog';
		if (numericPlatformId === 3) return 'itchio';
		if (numericPlatformId === 4) return 'epic';
	}

	const normalized = String(value || '').trim().toLowerCase();
	if (!normalized) return 'steam';
	if (normalized === 'itch' || normalized === 'itchio' || normalized === 'itch.io') return 'itchio';
	if (normalized === 'epic games' || normalized === 'epic_games') return 'epic';
	return normalized;
}

function normalizeScraperPlatform(value, platformId) {
	const normalized = normalizePlatformName(value, platformId);
	if (normalized === 'gog') return 'gog';
	if (normalized === 'itchio') return 'itchio';
	if (normalized === 'steam') return 'steam';
	if (normalized === 'epic') return 'steam';
	return 'steam';
}

function buildScraperPlatformPriority({
	prefetchedPlatform,
	requestedPlatform,
	routeStatePlatform,
	dbPlatform,
}) {
	const ordered = [
		prefetchedPlatform,
		requestedPlatform,
		routeStatePlatform,
		dbPlatform,
		'gog',
		'itchio',
		'steam',
	];
	const unique = [];
	for (const item of ordered) {
		const normalized = normalizeScraperPlatform(item);
		if (!unique.includes(normalized)) unique.push(normalized);
	}
	return unique;
}

function normalizeSiteLinksFromAny(value) {
	const hasSupportedProtocol = (href) => /^(https?:\/\/|magnet:\?)/i.test(String(href || '').trim());

	if (!value) return [];
	if (Array.isArray(value)) {
		return value
			.map((entry, index) => {
				if (!entry) return null;
				if (typeof entry === 'string') {
					if (!hasSupportedProtocol(entry)) return null;
					return { id: `site-${index}`, label: 'Store', href: entry };
				}
				const href = String(entry.href || entry.url || entry.link || '').trim();
				if (!hasSupportedProtocol(href)) return null;
				return {
					id: String(entry.id || entry.label || entry.site_name || entry.name || `site-${index}`),
					label: String(entry.label || entry.site_name || entry.name || entry.platform || 'Store'),
					href,
				};
			})
			.filter(Boolean);
	}
	if (typeof value === 'object') {
		return Object.entries(value)
			.map(([key, entry], index) => {
				if (typeof entry === 'string') {
					if (!hasSupportedProtocol(entry)) return null;
					return { id: key, label: key, href: entry };
				}
				if (!entry || typeof entry !== 'object') return null;
				const href = String(entry.href || entry.url || entry.link || '').trim();
				if (!hasSupportedProtocol(href)) return null;
				return {
					id: String(entry.id || key || `site-${index}`),
					label: String(entry.label || entry.site_name || entry.name || key || 'Store'),
					href,
				};
			})
			.filter(Boolean);
	}
	return [];
}

function isMagnetUri(value) {
	return /^magnet:\?/i.test(String(value || '').trim());
}

function isDownloadableTorrentSource(value) {
	const href = String(value || '').trim();
	if (!href) return false;
	if (/^magnet:\?/i.test(href)) return true;
	return /^https?:\/\//i.test(href) && /\.torrent(?:$|[?#])/i.test(href);
}

function extractDimensionsFromUrl(url) {
	const match = String(url || '').match(/(\d{2,4})x(\d{2,4})/i);
	if (!match) return null;
	const width = Number(match[1]);
	const height = Number(match[2]);
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
	return { width, height };
}

function pickBestThumbImage(candidates) {
	const unique = [];
	for (const candidate of candidates) {
		const url = String(candidate || '').trim();
		if (!url) continue;
		if (!/^https?:\/\//i.test(url)) continue;
		if (!unique.includes(url)) unique.push(url);
	}
	if (!unique.length) return '';

	const targetSize = 160;
	let best = unique[0];
	let bestScore = Number.POSITIVE_INFINITY;

	for (const url of unique) {
		const dims = extractDimensionsFromUrl(url);
		if (!dims) {
			if (bestScore === Number.POSITIVE_INFINITY) {
				best = url;
			}
			continue;
		}
		const ratio = dims.width / dims.height;
		const ratioPenalty = Math.abs(ratio - 1) * 120;
		const area = dims.width * dims.height;
		const targetArea = targetSize * targetSize;
		const areaPenalty = Math.abs(area - targetArea) / targetArea;
		const score = ratioPenalty + areaPenalty;
		if (score < bestScore) {
			bestScore = score;
			best = url;
		}
	}

	return best;
}

function defaultSiteForPlatform(platform, appId) {
	if (!appId) return [];
	if (platform === 'gog') {
		return [{ id: 'gog', label: 'GOG Store', href: `https://www.gog.com/game/${appId}` }];
	}
	if (platform === 'itchio') {
		return [{ id: 'itchio', label: 'Itch.io', href: 'https://itch.io/' }];
	}
	return [{ id: 'steam', label: 'Steam Store', href: `https://store.steampowered.com/app/${appId}` }];
}

function parseSteamDetails(details) {
	if (!details || typeof details !== 'object') return null;
	const appid = Number(details.appid);
	if (!Number.isFinite(appid) || appid <= 0) return null;

	const raw = details.raw && typeof details.raw === 'object' ? details.raw : {};
	const tags = Array.isArray(details.genres)
		? details.genres
			.map((genre) => (genre && typeof genre === 'object' ? genre.description : null))
			.filter((value) => typeof value === 'string' && value.trim())
		: [];
	const screenshots = Array.isArray(raw.screenshots)
		? raw.screenshots
			.map((shot) => (shot && typeof shot === 'object' ? shot.path_full || shot.path_thumbnail : null))
			.filter((value) => typeof value === 'string' && value.trim())
		: [];

	return {
		id: appid,
		appid,
		platform_name: 'steam',
		platform_id: 1,
		title: details.name || fallback.title,
		description: raw.short_description || '',
		longDescription: raw.detailed_description || raw.about_the_game || raw.short_description || '',
		tags,
		screenshots,
		minimumRequirements: details.minimum_requirements || '',
		price: typeof details.price_overview === 'number' ? details.price_overview / 100 : null,
	};
}

function parsePlatformDetails(platform, details, appId) {
	if (!details || typeof details !== 'object') return null;

	if (platform === 'steam') {
		return parseSteamDetails(details);
	}

	if (platform === 'gog') {
		const genres = Array.isArray(details.genreNames) ? details.genreNames : [];
		const siteLinks = normalizeSiteLinksFromAny(details.url || details.store_url || details.storeUrl || details.links || details.sites);
		return {
			id: Number(appId) || null,
			appid: Number(appId) || null,
			platform_name: 'gog',
			platform_id: 2,
			title: details.title || fallback.title,
			description: details.description || '',
			longDescription: details.description || '',
			tags: genres,
			screenshots: [],
			minimumRequirements: '',
			price: typeof details.cost === 'number' ? details.cost : null,
			coverImage: details.bannerImg || '',
			heroImage: details.bannerImg || '',
			sites: siteLinks,
		};
	}

	if (platform === 'itchio') {
		const tags = Array.isArray(details.tags)
			? details.tags.filter((tag) => typeof tag === 'string' && tag.trim())
			: Array.isArray(details.genres)
				? details.genres.filter((tag) => typeof tag === 'string' && tag.trim())
				: Array.isArray(details.genreNames)
					? details.genreNames.filter((tag) => typeof tag === 'string' && tag.trim())
					: [];
		const siteLinks = normalizeSiteLinksFromAny(details.url || details.store_url || details.storeUrl || details.links || details.sites);
		return {
			id: Number(appId) || null,
			appid: Number(appId) || null,
			platform_name: 'itchio',
			platform_id: 3,
			title: details.title || fallback.title,
			description: details.shortText || '',
			longDescription: details.shortText || '',
			tags,
			screenshots: [],
			minimumRequirements: '',
			price: typeof details.minPrice === 'number' ? details.minPrice : null,
			coverImage: details.coverUrl || '',
			heroImage: details.coverUrl || '',
			sites: siteLinks,
		};
	}

	return null;
}

function normalizeLocationState(locationState) {
	const state = locationState ?? {};
	const game = state?.game && typeof state.game === 'object' ? state.game : state;
	return {
		...fallback,
		...game,
		title: game?.title || game?.name || fallback.title,
		coverImage: game?.coverImage || game?.coverUrl || game?.image || fallback.coverImage,
		heroImage: game?.heroImage || game?.heroUrl || fallback.heroImage,
		longDescription: game?.longDescription || fallback.longDescription,
		tags: Array.isArray(game?.tags) ? game.tags : fallback.tags,
		sites: normalizeSiteLinksFromAny(game?.sites),
		screenshots: Array.isArray(game?.screenshots) ? game.screenshots : fallback.screenshots,
		price: typeof game?.price === 'number' ? game.price : fallback.price,
		platform_name: normalizePlatformName(game?.platform_name || game?.platform || fallback.platform_name, game?.platform_id || game?.platformId),
		platform_id: Number(game?.platform_id ?? game?.platformId) || null,
	};
}

const StoreGamePage = () => {
	const { id, platform } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const { startDownload } = useDownloadManager();
	const [platformDetails, setPlatformDetails] = useState(null);
	const [detailsPlatform, setDetailsPlatform] = useState(null);
	const [dbDetails, setDbDetails] = useState(null);
	const [errorMessage, setErrorMessage] = useState('');
	const [currentScreenshot, setCurrentScreenshot] = useState(0);
	const [loading, setLoading] = useState(true);
	const [debugOptions, setDebugOptions] = useState(() => readStoreGameDebugOptions(''));

	const routeState = useMemo(() => normalizeLocationState(location?.state), [location?.state]);
	const requestedPlatform = useMemo(() => normalizePlatformName(platform || routeState.platform_name, routeState.platform_id), [platform, routeState.platform_id, routeState.platform_name]);

	const debugLog = (...args) => {
		if (!debugOptions.enabled) return;
		console.log('[StoreGamePage:debug]', ...args);
	};

	const debugVerboseLog = (...args) => {
		if (!debugOptions.enabled || !debugOptions.verbose) return;
		console.log('[StoreGamePage:verbose]', ...args);
	};

	const sendTerminalDebug = async (scope, payload) => {
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.debugLog !== 'function') return;
		try {
			await api.debugLog(scope, payload);
		} catch {
			// avoid blocking page flow if debug bridge is unavailable
		}
	};

	const appId = useMemo(() => {
		const routeId = Number(id);
		if (Number.isFinite(routeId) && routeId > 0) return routeId;
		const stateCandidates = [Number(routeState?.appid), Number(routeState?.id)];
		return stateCandidates.find((value) => Number.isFinite(value) && value > 0) ?? null;
	}, [id, routeState]);

	useEffect(() => {
		setDebugOptions(readStoreGameDebugOptions(location?.search || ''));
	}, [location?.search]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		window.localStorage.setItem(STORE_GAME_DEBUG_STORAGE_KEY, JSON.stringify(debugOptions));
	}, [debugOptions]);

	useEffect(() => {
		if (typeof window === 'undefined') return;

		window.WLStoreGameDebug = {
			enable() {
				setDebugOptions((prev) => ({ ...prev, enabled: true }));
			},
			disable() {
				setDebugOptions({ enabled: false, verbose: false, panel: false });
			},
			verboseOn() {
				setDebugOptions((prev) => ({ ...prev, enabled: true, verbose: true }));
			},
			verboseOff() {
				setDebugOptions((prev) => ({ ...prev, verbose: false }));
			},
			panelOn() {
				setDebugOptions((prev) => ({ ...prev, enabled: true, panel: true }));
			},
			panelOff() {
				setDebugOptions((prev) => ({ ...prev, panel: false }));
			},
			set(next) {
				setDebugOptions((prev) => {
					const enabled = typeof next?.enabled === 'boolean' ? next.enabled : prev.enabled;
					const verbose = enabled && typeof next?.verbose === 'boolean' ? next.verbose : enabled ? prev.verbose : false;
					const panel = enabled && typeof next?.panel === 'boolean' ? next.panel : enabled ? prev.panel : false;
					return { enabled, verbose, panel };
				});
			},
			get() {
				return { ...debugOptions };
			},
			help() {
				console.info('WLStoreGameDebug.enable()');
				console.info('WLStoreGameDebug.disable()');
				console.info('WLStoreGameDebug.verboseOn() / verboseOff()');
				console.info('WLStoreGameDebug.panelOn() / panelOff()');
				console.info('WLStoreGameDebug.set({ enabled: true, verbose: true, panel: true })');
				console.info('URL params: ?storeDebug=1&storeDebugVerbose=1&storeDebugPanel=1');
			},
		};

		return () => {
			if (window.WLStoreGameDebug) {
				delete window.WLStoreGameDebug;
			}
		};
	}, [debugOptions]);

	useEffect(() => {
		setCurrentScreenshot(0);
	}, [appId]);

	useEffect(() => {
		const routePlatformParam = normalizePlatformName(platform || '', undefined);
		const routeStatePlatform = normalizePlatformName(routeState?.platform_name || routeState?.platform || '', routeState?.platform_id);
		const requested = normalizePlatformName(requestedPlatform || '', undefined);
		const mismatchRouteParamVsState = Boolean(platform) && routePlatformParam !== routeStatePlatform;
		const mismatchRequestedVsState = requested !== routeStatePlatform;

		const openPayload = {
			type: 'store-game-open',
			timestamp: new Date().toISOString(),
			route: {
				platformParam: platform || null,
				platformParamNormalized: routePlatformParam,
				idParam: id || null,
			},
			receivedStateRaw: location?.state ?? null,
			receivedState: {
				id: routeState?.id ?? null,
				appid: routeState?.appid ?? null,
				title: routeState?.title ?? null,
				platform_name: routeState?.platform_name ?? null,
				platform_id: routeState?.platform_id ?? null,
				sitesCount: Array.isArray(routeState?.sites) ? routeState.sites.length : 0,
			},
			resolved: {
				appId,
				routeStatePlatform,
				requestedPlatform: requested,
			},
			flags: {
				mismatchRouteParamVsState,
				mismatchRequestedVsState,
			},
		};

		console.log('[StoreGamePage] Open payload', openPayload);
		sendTerminalDebug('store-game-open', openPayload);
	}, [appId, id, location?.state, platform, requestedPlatform, routeState]);

	useEffect(() => {
		let cancelled = false;
		debugVerboseLog('Loading store game details', {
			requestedPlatform,
			appId,
			routeState,
		});
		setPlatformDetails(null);
		setDetailsPlatform(null);
		setDbDetails(null);
		setErrorMessage('');
		setLoading(true);

		(async () => {
			if (!appId) {
				setErrorMessage('Missing store game ID');
				setLoading(false);
				return;
			}

			const api = typeof window !== 'undefined' ? window.electronAPI : null;
			if (!api) {
				setErrorMessage('electronAPI is not available');
				setLoading(false);
				return;
			}

			let effectivePlatform = requestedPlatform;
			let dbResolvedPlatform = null;
			const prefetchedDetails = routeState?.prefetchedDetails && typeof routeState.prefetchedDetails === 'object'
				? routeState.prefetchedDetails
				: null;
			const prefetchedPlatform = normalizeScraperPlatform(
				routeState?.prefetchedDetailsPlatform || routeState?.platform_name,
				routeState?.platform_id
			);
			const routeStatePlatform = normalizeScraperPlatform(routeState?.platform_name || routeState?.platform, routeState?.platform_id);
			console.log('[StoreGamePage] Start load', {
				appId,
				requestedPlatform,
				prefetchedPlatform,
				routePlatform: platform,
				routeStatePlatform: routeState?.platform_name,
				routeStatePlatformId: routeState?.platform_id,
			});

			try {
				let dbData = null;
				try {
					const shouldTryPlatformLookup = Boolean(
						effectivePlatform &&
						effectivePlatform !== 'steam' &&
						typeof api.getAllDetailsByAppIDAndPlatform === 'function'
					);

					if (shouldTryPlatformLookup) {
						debugLog('DB lookup by platform+appId', {
							effectivePlatform,
							appId,
							hasApiMethod: true,
						});
						dbData = await api.getAllDetailsByAppIDAndPlatform(effectivePlatform, appId);
						debugVerboseLog('DB details fetched by platform+appID', dbData);
					} else {
						dbData = await api.getAllDetailsByID(appId);
						debugVerboseLog('DB details fetched by ID (primary lookup)', dbData);
					}
				} catch (error) {
					debugLog('platform+appId lookup failed, falling back to getAllDetailsByID', {
						effectivePlatform,
						appId,
						error,
					});
					dbData = await api.getAllDetailsByID(appId);
					debugVerboseLog('DB details fetched by ID fallback', dbData);
				}

				if (!dbData && appId && typeof api.getAllDetailsByAppIDAndPlatform === 'function') {
					const probePlatforms = ['gog', 'itchio', 'epic', 'steam'];
					for (const candidate of probePlatforms) {
						try {
							const candidateData = await api.getAllDetailsByAppIDAndPlatform(candidate, appId);
							if (candidateData && (candidateData.app_id || candidateData.name)) {
								dbData = candidateData;
								effectivePlatform = normalizePlatformName(candidateData.platform_name || candidate, candidateData.platform_id);
								console.log('[StoreGamePage] Platform probe matched DB game', {
									appId,
									candidate,
									matchedPlatform: effectivePlatform,
									dbPlatform: candidateData.platform_name,
									dbPlatformId: candidateData.platform_id,
								});
								break;
							}
						} catch {
							// try next platform candidate
						}
					}
				}
				if (dbData) {
					effectivePlatform = normalizeScraperPlatform(dbData.platform_name || effectivePlatform, dbData.platform_id);
					dbResolvedPlatform = effectivePlatform;
					console.log('[StoreGamePage] DB resolved platform', {
						appId,
						dbPlatform: dbData.platform_name,
						dbPlatformId: dbData.platform_id,
						effectivePlatform,
					});
				}
				if (!cancelled && dbData) setDbDetails(dbData);
			} catch (error) {
				const enrichmentMessage = error instanceof Error ? error.message : String(error);
				const isNotFound = /\b404\b|not\s+found/i.test(enrichmentMessage);
				const logFn = isNotFound ? console.debug : console.warn;
				logFn('[StoreGamePage] DB enrichment failed', {
					appId,
					requestedPlatform,
					error,
				});
				// optional enrichment only
			}

			try {
				const fetchDetailsForPlatform = async (targetPlatform) => {
					const scraperPlatform = normalizeScraperPlatform(targetPlatform);
					console.log('[StoreGamePage] Fetching platform details', { appId, targetPlatform: scraperPlatform });
					if (scraperPlatform === 'gog') {
						return api.getGogGameDetails(String(appId));
					}
					if (scraperPlatform === 'itchio') {
						return api.getItchGameDetails(Number(appId));
					}
					return api.getSteamGameDetails(appId, 'us');
				};

				let details = null;
				let resolvedDetailsPlatform = null;

				if (prefetchedDetails) {
					const parsedPrefetched = parsePlatformDetails(prefetchedPlatform, prefetchedDetails, appId);
					if (parsedPrefetched) {
						details = prefetchedDetails;
						resolvedDetailsPlatform = prefetchedPlatform;
						console.log('[StoreGamePage] Using prefetched scraper details', {
							appId,
							resolvedDetailsPlatform,
						});
					}
				}

				if (!details) {
					const priority = buildScraperPlatformPriority({
						prefetchedPlatform,
						requestedPlatform: effectivePlatform || requestedPlatform,
						routeStatePlatform,
						dbPlatform: dbResolvedPlatform,
					});

					let lastError = null;
					for (const candidate of priority) {
						try {
							details = await fetchDetailsForPlatform(candidate);
							resolvedDetailsPlatform = candidate;
							console.log('[StoreGamePage] Scraper resolved details', {
								appId,
								candidate,
								priority,
							});
							break;
						} catch (error) {
							lastError = error;
						}
					}

					if (!details && lastError) throw lastError;
				}

				if (!cancelled) {
					debugLog('Resolved details platform', {
						requestedPlatform,
						effectivePlatform,
						resolvedDetailsPlatform,
						appId,
					});
					console.log('[StoreGamePage] Final resolved details platform', {
						appId,
						requestedPlatform,
						effectivePlatform,
						resolvedDetailsPlatform,
					});
					setPlatformDetails(details);
					setDetailsPlatform(resolvedDetailsPlatform);
				}
			} catch (error) {
				if (!cancelled) setErrorMessage(error instanceof Error ? error.message : String(error));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [appId, debugOptions.enabled, debugOptions.verbose, requestedPlatform, routeState]);

	const model = useMemo(() => {
		const parsedPlatformKey = detailsPlatform || requestedPlatform;
		const parsedPlatform = parsePlatformDetails(parsedPlatformKey, platformDetails, appId);
		const scrapedTags = Array.isArray(parsedPlatform?.tags) ? parsedPlatform.tags : [];
		const dbSites = normalizeSiteLinksFromAny(
			dbDetails?.pirate_sites ||
			dbDetails?.sites ||
			dbDetails?.links ||
			dbDetails?.store_links ||
			dbDetails?.storeLinks ||
			dbDetails?.urls
		);
		const parsedDb = dbDetails
			? {
				id: Number(dbDetails.app_id) || null,
				appid: Number(dbDetails.app_id) || null,
				title: dbDetails.name || routeState.title,
				description: dbDetails.description || '',
				longDescription: dbDetails.description || routeState.longDescription,
				minimumRequirements: dbDetails.minimum_requirements || '',
				price: typeof dbDetails.cost === 'number' ? dbDetails.cost : routeState.price,
				platform_name: normalizePlatformName(dbDetails.platform_name || routeState.platform_name, dbDetails.platform_id || routeState.platform_id),
				platform_id: Number(dbDetails.platform_id ?? routeState.platform_id) || null,
				sites: dbSites,
			}
			: null;

		const steam = appId ? steamImages(appId) : null;
		const merged = {
			...routeState,
			...(parsedDb || {}),
			...(parsedPlatform || {}),
		};
		const resolvedPlatform = normalizePlatformName(detailsPlatform || merged.platform_name || parsedPlatformKey, merged.platform_id || routeState.platform_id);
		const links = Array.isArray(merged.sites) && merged.sites.length
			? normalizeSiteLinksFromAny(merged.sites)
			: defaultSiteForPlatform(resolvedPlatform, appId);

		return {
			...fallback,
			...merged,
			platform_name: resolvedPlatform,
			id: merged.id ?? appId ?? null,
			appid: merged.appid ?? appId ?? null,
			coverImage: merged.coverImage || merged.bannerImg || steam?.cover || steam?.capsule || fallback.coverImage,
			heroImage: merged.heroImage || merged.bannerImg || steam?.hero || steam?.header || fallback.heroImage,
			longDescription: merged.longDescription || merged.description || '',
			tags: scrapedTags,
			screenshots: Array.isArray(merged.screenshots) ? merged.screenshots : [],
			price: typeof merged.price === 'number' ? merged.price : null,
			sites: links,
		};
	}, [appId, dbDetails, detailsPlatform, platformDetails, requestedPlatform, routeState]);

	const screenshot = model.screenshots[currentScreenshot] || model.heroImage || model.coverImage;
	const activePlatform = normalizePlatformName(model.platform_name);
	const debugSnapshot = useMemo(() => ({
		appId,
		routePlatformParam: platform,
		requestedPlatform,
		detailsPlatform,
		activePlatform,
		modelPlatform: model.platform_name,
		modelPlatformId: model.platform_id,
		dbPlatform: dbDetails?.platform_name || null,
		dbPlatformId: dbDetails?.platform_id || null,
		errorMessage,
		loading,
	}), [activePlatform, appId, dbDetails?.platform_id, dbDetails?.platform_name, detailsPlatform, errorMessage, loading, model.platform_id, model.platform_name, platform, requestedPlatform]);
	const bestThumb = useMemo(() => pickBestThumbImage([
		model.coverImage,
		...(Array.isArray(model.screenshots) ? model.screenshots : []),
		model.heroImage,
	]), [model.coverImage, model.heroImage, model.screenshots]);
	const platformButtonLabel = activePlatform === 'gog'
		? 'Open In GOG'
		: activePlatform === 'itchio'
			? 'Open In Itch.io'
			: 'Open In Steam';

	const handleOpenExternalStore = async () => {
		if (!appId) return;
		try {
			console.log('[StoreGamePage] Open external store action', {
				appId,
				activePlatform,
				buttonLabel: platformButtonLabel,
			});
			if (activePlatform === 'gog') {
				await window.electronAPI.openGogGame(String(appId));
				return;
			}
			if (activePlatform === 'itchio') {
				await window.electronAPI.openItchGame(Number(appId));
				return;
			}
			await window.electronAPI.storePageSteam(appId);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : String(error));
		}
	};

	const handleStartSiteDownload = async (site) => {
		const href = String(site?.href || '').trim();
		if (!isDownloadableTorrentSource(href)) return;
		try {
			await startDownload({
				magnetUri: href,
				artwork: {
					thumbnailUrl: bestThumb,
					coverUrl: model.coverImage || '',
					imageUrl: model.heroImage || '',
				},
			});
			navigate('/downloads');
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : String(error));
		}
	};

	return (
		<div className="flex-1 overflow-y-auto text-slate-100">
			{debugOptions.enabled && debugOptions.panel ? (
				<div className="fixed bottom-3 right-3 z-[70] w-[360px] max-w-[92vw] rounded-xl border border-amber-500/60 bg-slate-950/95 p-3 text-[11px] text-amber-100 shadow-2xl shadow-black/50 backdrop-blur-sm">
					<div className="mb-2 flex items-center justify-between">
						<p className="font-semibold uppercase tracking-[0.12em] text-amber-300">Store Debug</p>
						<div className="flex items-center gap-2">
							<button type="button" onClick={() => setDebugOptions((prev) => ({ ...prev, verbose: !prev.verbose }))} className="rounded border border-amber-500/50 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-amber-200 hover:bg-amber-500/20">
								{debugOptions.verbose ? 'Verbose On' : 'Verbose Off'}
							</button>
							<button type="button" onClick={() => setDebugOptions((prev) => ({ ...prev, panel: false }))} className="rounded border border-amber-500/50 px-2 py-1 text-[10px] uppercase tracking-[0.1em] text-amber-200 hover:bg-amber-500/20">
								Hide
							</button>
						</div>
					</div>
					<pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-amber-500/20 bg-black/35 p-2 leading-5 text-amber-100">
						{JSON.stringify(debugSnapshot, null, 2)}
					</pre>
					<p className="mt-2 text-[10px] text-amber-300/90">Console: window.WLStoreGameDebug.help()</p>
				</div>
			) : null}
			<div className="relative min-h-full">
				<div className="absolute inset-x-0 top-0 h-[340px] bg-cover bg-center opacity-30" style={{ backgroundImage: screenshot ? `url(${screenshot})` : undefined }} />
				<div className="absolute inset-x-0 top-0 h-[340px] bg-gradient-to-b from-slate-950/10 via-slate-950/75 to-slate-950" />

				<div className="relative px-4 py-5 md:px-8 md:py-6">
					<div className="mb-6 flex items-center justify-between gap-4">
						<button
							type="button"
							onClick={() => navigate(-1)}
							className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-800/70"
						>
							Back To Store
						</button>
						<div className="text-right text-xs uppercase tracking-[0.18em] text-slate-400">Store Page</div>
					</div>

					<div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
						<div className="space-y-4">
							<div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/55 shadow-2xl shadow-black/25 backdrop-blur-sm">
								<div className="aspect-[3/4] bg-slate-800/40">
									{model.coverImage ? <img src={model.coverImage} alt={`${model.title} cover`} className="h-full w-full object-cover" /> : null}
								</div>
							</div>

							<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4 backdrop-blur-sm">
								<div className="flex flex-col gap-3">
									<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
										<p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Price</p>
										<p className="mt-2 text-3xl font-semibold text-white">
											{model.price === 0 ? 'Free' : typeof model.price === 'number' ? `$${model.price.toFixed(2)}` : 'Check Store'}
										</p>
									</div>
									<button
										type="button"
										onClick={handleOpenExternalStore}
										disabled={!appId}
										className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
									>
										{platformButtonLabel}
									</button>
								</div>
							</div>

							<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm">
								<h2 className="text-lg font-semibold text-white">Available At</h2>
								<div className="mt-3 flex flex-col gap-2">
									{model.sites.map((site, index) => (
										<div key={site.id ?? `${site.label}-${index}`} className="rounded-xl border border-slate-700/70 bg-slate-950/45 px-4 py-3 text-sm text-slate-200">
											<div className="flex flex-wrap items-center justify-between gap-2">
												<span>{site.label ?? 'Store'}</span>
												{isDownloadableTorrentSource(site.href) ? (
													<button
														type="button"
														onClick={() => handleStartSiteDownload(site)}
														className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-white transition-colors hover:bg-emerald-400"
													>
														Start Download
													</button>
												) : (
													<a href={site.href ?? '#'} target="_blank" rel="noreferrer" className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs uppercase tracking-[0.1em] text-slate-200 transition-colors hover:bg-slate-800/80">Open</a>
												)}
											</div>
										</div>
									))}
								</div>
							</div>

							{model.minimumRequirements ? (
								<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm">
									<h2 className="text-lg font-semibold text-white">Minimum Requirements</h2>
									<div className="mt-3 text-sm leading-6 text-slate-300 [&_ul]:ml-5 [&_ul]:list-disc [&_strong]:text-slate-100" dangerouslySetInnerHTML={{ __html: model.minimumRequirements }} />
								</div>
							) : null}
						</div>

						<div className="space-y-5">
							<div className="rounded-3xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm">
								<p className="text-xs uppercase tracking-[0.2em] text-sky-300">Store</p>
								<h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">{model.title}</h1>
								<p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
									{loading ? 'Loading store information...' : model.description || 'No store description available yet.'}
								</p>
								{errorMessage ? <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}
								{model.tags.length > 0 ? (
									<div className="mt-5 flex flex-wrap gap-2">
										{model.tags.map((tag) => (
											<span key={tag} className="rounded-full border border-slate-700/70 bg-slate-950/55 px-3 py-1 text-xs uppercase tracking-[0.14em] text-slate-200">{tag}</span>
										))}
									</div>
								) : null}
							</div>

							<div className="overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-900/45 backdrop-blur-sm">
								<div className="aspect-video bg-slate-800/30">
									{screenshot ? <img src={screenshot} alt={`${model.title} screenshot`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-500">No screenshot available</div>}
								</div>
								{model.screenshots.length > 1 ? (
									<div className="grid grid-cols-4 gap-2 border-t border-slate-800/80 p-3 md:grid-cols-6">
										{model.screenshots.slice(0, 6).map((shot, index) => (
											<button
												key={`${shot}-${index}`}
												type="button"
												onClick={() => setCurrentScreenshot(index)}
												className={`overflow-hidden rounded-xl border ${index === currentScreenshot ? 'border-sky-400' : 'border-slate-700/70'} bg-slate-950/40`}
											>
												<img src={shot} alt="" className="h-16 w-full object-cover" />
											</button>
										))}
									</div>
								) : null}
							</div>

							<div className="grid gap-5">
								<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm">
									<h2 className="text-lg font-semibold text-white">About This Store Listing</h2>
									<p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-300">{model.description || 'No description available.'}</p>
								</div>

								<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm xl:col-span-2">
									<h2 className="text-lg font-semibold text-white">Long Description</h2>
									<div
										className="mt-3 text-sm leading-7 text-slate-300 [&_ul]:ml-5 [&_ul]:list-disc [&_strong]:text-slate-100"
										dangerouslySetInnerHTML={{ __html: model.longDescription || model.description || 'No long description available.' }}
									/>
								</div>

							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default StoreGamePage;