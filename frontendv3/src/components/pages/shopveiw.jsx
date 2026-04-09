import React, { useEffect, useMemo, useRef, useState } from 'react';
import Storeslider from '../store/Storeslider.jsx';
import GameGrid from '../store/GameGrid.jsx';
import FilteredGamesSection from '../store/FilteredGamesSection.jsx';
import LauncherSelector from '../store/LauncherSelector.jsx';
import { combineFilters, hasActiveFilters as checkActiveFilters } from '../../utils/gameUtils.js';
//import { runSmokeControllers } from '../../smokeControllers.js';

/**
 * Shop View Component
 * 
 * Data Flow:
 * 1. On mount: Fetches all games from backend database via Electron IPC
 *    which maps to GET /api/games/list/:from on the backend.
 *    - Returns basic game info: id, app_id, name, banner_img, cost, description, etc.
 * 
 * 2. When user clicks a game in the shop: Navigates to StoreGamePage (/store/game/:platform/:id)
 *    - StoreGamePage then uses window.electronAPI.getSteamGameDetails(appID, cc) to fetch
 *      detailed scraped data from Steam (or from cached database)
 *    - Or uses window.electronAPI.getAllDetailsByID(id) to fetch from database
 * 
 * This approach ensures:
 * - Fast initial load (only basic data)
 * - Detailed data loaded on-demand
 * - Uses scraped Steam data for accurate game information
 */

function steamPoster(appid) {
	const id = Number(appid);
	if (!Number.isFinite(id) || id <= 0) return null;
	return `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
}

const BATCH_SIZE = 20;
const INITIAL_PAGES = 2;
const INITIAL_LOAD_COUNT = BATCH_SIZE * INITIAL_PAGES;
const CAROUSEL_INITIAL_ITEMS = INITIAL_LOAD_COUNT;
const CAROUSEL_CHUNK_SIZE = BATCH_SIZE;

async function fetchGamesPage(api, from) {
	const batch = await api.getGames(from);
	console.log(`Fetched games page from offset ${from}:`, batch);
	return Array.isArray(batch) ? batch : [];
}

async function fetchSpecialsChunk(apiCall, from, take = CAROUSEL_CHUNK_SIZE) {
	const payload = await apiCall(from);
	const items = pickSpecialsArray(payload);
	const pageItems = items.slice(0, take);
	return {
		items: pageItems,
		nextFrom: from + take,
		hasMore: pageItems.length >= BATCH_SIZE,
	};
}

function getGameIdentity(game) {
	const raw = game?.appid ?? game?.app_id ?? game?.id;
	return String(raw ?? '').trim();
}

function appendUniqueGames(prev, incoming) {
	if (!Array.isArray(incoming) || incoming.length === 0) return prev;
	const seen = new Set(prev.map((game) => getGameIdentity(game)).filter(Boolean));
	const next = [...prev];
	for (const game of incoming) {
		const key = getGameIdentity(game);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		next.push(game);
	}
	return next;
}

function pickSpecialsArray(payload) {
	if (Array.isArray(payload)) return payload;
	if (!payload || typeof payload !== 'object') return [];
	const candidates = [payload.items, payload.games, payload.data, payload.results];
	for (const candidate of candidates) {
		if (Array.isArray(candidate)) return candidate;
	}
	return [];
}

function parseDiscountPercent(game) {
	const rawCandidates = [
		game.discount_percent,
		game.discountPercentage,
		game.discount_percentage,
		game.discount,
		game.percentage,
		game.sale_percentage,
	];

	for (const raw of rawCandidates) {
		const value = Number(raw);
		if (!Number.isFinite(value)) continue;
		if (value <= 0) continue;
		if (value <= 1) return Math.round(value * 100);
		return Math.round(value);
	}

	return 0;
}

function extractPlatformIdFromGame(game) {
	const candidates = [
		game?.platform_id,
		game?.platformId,
		game?.platformID,
		game?.platform?.id,
		game?.platform?.platform_id,
	];
	for (const candidate of candidates) {
		const parsed = Number(candidate);
		if (Number.isFinite(parsed)) return parsed;
	}
	return null;
}

function extractPlatformNameFromGame(game) {
	const candidates = [
		game?.platform_name,
		game?.platform,
		game?.launcherId,
		game?.platform?.platform_name,
		game?.platform?.name,
		game?.store,
		game?.store_name,
	];
	for (const candidate of candidates) {
		if (typeof candidate === 'string' && candidate.trim()) return candidate;
	}
	return '';
}

function normalizePlatformForStoreCard(platformValue, platformId) {
	const numericPlatformId = Number(platformId ?? platformValue);
	if (Number.isFinite(numericPlatformId)) {
		if (numericPlatformId === 1) return 'steam';
		if (numericPlatformId === 2) return 'gog';
		if (numericPlatformId === 3) return 'itchio';
		if (numericPlatformId === 4) return 'epic';
	}

	const normalized = String(platformValue || '').trim().toLowerCase();
	if (normalized === '1') return 'steam';
	if (normalized === '2') return 'gog';
	if (normalized === '3') return 'itchio';
	if (normalized === '4') return 'epic';
	if (!normalized) return '';
	if (normalized === 'itch' || normalized === 'itch.io' || normalized === 'itchio') return 'itchio';
	if (normalized === 'gog.com' || normalized === 'gog galaxy' || normalized === 'gog_galaxy') return 'gog';
	if (normalized === 'epic games' || normalized === 'epic_games') return 'epic';
	return normalized;
}

function mapGameCard(game, fallbackTag = '') {
	const rawPlatformId = extractPlatformIdFromGame(game);
	const rawPlatformName = extractPlatformNameFromGame(game);
	const resolvedPlatformName = normalizePlatformForStoreCard(rawPlatformName, rawPlatformId) || 'steam';

	return {
		id: game.app_id || game.appid || game.id,
		app_id: game.app_id || game.appid || game.id,
		appid: game.app_id || game.appid || game.id,
		name: game.name,
		title: game.name || game.title,
		image: game.banner_img || game.image || steamPoster(game.app_id || game.appid || game.id),
		banner_img: game.banner_img || game.image || null,
		cost: game.cost || game.price || 0,
		price: game.cost || game.price || 0,
		discountPercent: parseDiscountPercent(game),
		description: game.description || '',
		platform_name: resolvedPlatformName,
		platform_id: Number.isFinite(rawPlatformId) ? rawPlatformId : null,
		minimum_requirements: game.minimum_requirements || '',
		genres: Array.isArray(game.genres) ? game.genres : [],
		tags: [
			...(Array.isArray(game.tags) ? game.tags : []),
			...(fallbackTag ? [fallbackTag] : []),
		],
	};
}

function buildPlatformLookup(games) {
	const lookup = new Map();
	const titleLookup = new Map();
	const normalizeTitle = (value) => String(value || '').trim().toLowerCase();
	for (const game of games || []) {
		const key = getGameIdentity(game);
		const normalizedTitle = normalizeTitle(game?.title || game?.name);
		const entry = {
			appid: game?.appid ?? game?.app_id ?? null,
			app_id: game?.app_id ?? game?.appid ?? null,
			platform_name: game?.platform_name || game?.platform || 'steam',
			platform_id: extractPlatformIdFromGame(game),
		};
		if (key) lookup.set(key, entry);
		if (normalizedTitle && !titleLookup.has(normalizedTitle)) {
			titleLookup.set(normalizedTitle, entry);
		}
	}
	return { lookup, titleLookup };
}

function enrichCardsWithKnownPlatforms(cards, knownGames) {
	const { lookup, titleLookup } = buildPlatformLookup(knownGames);
	const normalizeTitle = (value) => String(value || '').trim().toLowerCase();
	return (cards || []).map((card) => {
		const key = getGameIdentity(card);
		const byKey = key ? lookup.get(key) : null;
		const byTitle = titleLookup.get(normalizeTitle(card?.title || card?.name));
		const known = byKey || byTitle;
		if (!known) return card;

		const cardPlatformName = normalizePlatformForStoreCard(card?.platform_name || card?.platform, card?.platform_id);
		const knownPlatformName = normalizePlatformForStoreCard(known.platform_name, known.platform_id);
		if (cardPlatformName && cardPlatformName !== 'steam') return card;
		if (!knownPlatformName) return card;

		return {
			...card,
			appid: known.appid ?? card?.appid ?? card?.app_id ?? null,
			app_id: known.app_id ?? card?.app_id ?? card?.appid ?? null,
			platform_name: knownPlatformName,
			platform_id: Number.isFinite(Number(known.platform_id)) ? Number(known.platform_id) : card?.platform_id ?? null,
		};
	});
}

function buildFeaturedDiversityPool(games) {
	const buckets = {
		gog: [],
		itchio: [],
		epic: [],
		steam: [],
		other: [],
	};

	for (const game of games || []) {
		const card = mapGameCard(game, 'featured');
		const platform = normalizePlatformForStoreCard(card?.platform_name, card?.platform_id);
		if (platform === 'gog') buckets.gog.push(card);
		else if (platform === 'itchio') buckets.itchio.push(card);
		else if (platform === 'epic') buckets.epic.push(card);
		else if (platform === 'steam') buckets.steam.push(card);
		else buckets.other.push(card);
	}

	const ordered = [];
	const order = ['gog', 'itchio', 'epic', 'steam', 'other'];
	let added = true;
	while (added) {
		added = false;
		for (const key of order) {
			if (!buckets[key].length) continue;
			ordered.push(buckets[key].shift());
			added = true;
		}
	}

	return ordered;
}

function blendFeaturedCards(primaryCards, diversityCards, limit) {
	if (!Number.isFinite(limit) || limit <= 0) return [];
	const result = [];
	const seen = new Set();

	const addCard = (card) => {
		if (!card || result.length >= limit) return;
		const key = getGameIdentity(card);
		if (!key || seen.has(key)) return;
		seen.add(key);
		result.push(card);
	};

	let i = 0;
	let j = 0;
	while (result.length < limit && (j < diversityCards.length || i < primaryCards.length)) {
		if (j < diversityCards.length) addCard(diversityCards[j++]);
		if (i < primaryCards.length) addCard(primaryCards[i++]);
	}

	return result;
}

const Shopveiw = ({ items }) => {
	const didRunSmokeRef = useRef(false);
// useEffect(() => {
//         // React.StrictMode runs effects twice in dev; guard so smoke runs once.
//         if (didRunSmokeRef.current) return;
//         didRunSmokeRef.current = true;
//         runSmokeControllers().catch((e) => {
//             console.warn('[smoke] runSmokeControllers failed:', e);
//         });
//     }, []);
	const [allGames, setAllGames] = useState([]);
	const [filters, setFilters] = useState({
		query: '',
		genres: [],
		priceRange: { min: 0, max: 100 },
	});
	const [isLoading, setIsLoading] = useState(true);
	const [featuredGames, setFeaturedGames] = useState([]);
	const [discountedGames, setDiscountedGames] = useState([]);
	const [upcomingGames, setUpcomingGames] = useState([]);
	const [featuredOffset, setFeaturedOffset] = useState(CAROUSEL_INITIAL_ITEMS);
	const [discountedOffset, setDiscountedOffset] = useState(CAROUSEL_INITIAL_ITEMS);
	const [upcomingOffset, setUpcomingOffset] = useState(CAROUSEL_INITIAL_ITEMS);
	const [hasMoreFeatured, setHasMoreFeatured] = useState(true);
	const [hasMoreDiscounted, setHasMoreDiscounted] = useState(true);
	const [hasMoreUpcoming, setHasMoreUpcoming] = useState(true);
	const [isLoadingFeaturedMore, setIsLoadingFeaturedMore] = useState(false);
	const [isLoadingDiscountedMore, setIsLoadingDiscountedMore] = useState(false);
	const [isLoadingUpcomingMore, setIsLoadingUpcomingMore] = useState(false);
	const [featuredDiversityOffset, setFeaturedDiversityOffset] = useState(0);
	const [browseOffset, setBrowseOffset] = useState(0);
	const [hasMoreBrowse, setHasMoreBrowse] = useState(true);
	const [isLoadingMoreBrowse, setIsLoadingMoreBrowse] = useState(false);
	const featuredDiversityPool = useMemo(() => buildFeaturedDiversityPool(allGames), [allGames]);

	// Refs for carousel sections for scroll-into-view behavior
	const featuredRef = useRef(null);
	const discountedRef = useRef(null);
	const upcomingRef = useRef(null);
	const lastFetchStats = useRef(null);
	// Calculate filtered games
	const browseSectionGames = useMemo(() => {
		// Show all games, including those in carousels
		return allGames;
	}, [allGames, featuredGames, discountedGames, upcomingGames]);

	const filteredGames = useMemo(() => {
		return combineFilters(browseSectionGames, filters);
	}, [browseSectionGames, filters]);

	// Check if any filters are active
	const hasFilters = useMemo(() => {
		return checkActiveFilters(filters);
	}, [filters]);

	// Handle filter changes from sidebar
	const handleFiltersChange = (newFilters) => {
		setFilters(newFilters);
	};
const ensureFullBrowsePages = async () => {
	if (isLoadingMoreBrowse || !hasMoreBrowse) return;

	// 🔹 Build exclusion set (same as your filter)
	const carouselIds = new Set(
		[...upcomingGames]
			.map(g => Number(g?.appid ?? g?.app_id ?? g?.id))
			.filter(v => Number.isFinite(v) && v > 0)
	);

	// 🔹 Current usable browse count
	const currentBrowseCount = allGames.filter(game => {
		const id = Number(game?.appid ?? game?.app_id ?? game?.id);
		if (!Number.isFinite(id) || id <= 0) return true;
		return !carouselIds.has(id);
	}).length;

	const remainder = currentBrowseCount % BATCH_SIZE;
	if (remainder === 0) return;

	const needed = BATCH_SIZE - remainder;

	// 🔥 Estimate yield ratio (fallback to 0.7 if unknown)
	let estimatedRatio = 0.7;

	// OPTIONAL: improve estimate using last fetch
	if (lastFetchStats.current) {
		const { added, fetched } = lastFetchStats.current;
		if (fetched > 0) {
			estimatedRatio = added / fetched;
		}
	}

	const estimatedPerPage = Math.max(1, Math.floor(BATCH_SIZE * estimatedRatio));

	const pagesNeeded = Math.ceil(needed / estimatedPerPage);

	console.log('[ensureFullBrowsePages]', {
		currentBrowseCount,
		needed,
		estimatedRatio,
		pagesNeeded
	});

	// 🔁 Fetch predicted number of pages
	for (let i = 0; i < pagesNeeded; i++) {
		if (!hasMoreBrowse) break;

		const added = await loadNextBrowsePage();
		if (!added || added === 0) break;
	}	
};
	// const ensureFullBrowsePages = async () => {
	// 	if (isLoadingMoreBrowse || !hasMoreBrowse) return;

	// 	let safety = 5;

	// 	while (safety > 0) {
	// 		const carouselIds = new Set(
	// 			[...upcomingGames]
	// 				.map(g => Number(g?.appid ?? g?.app_id ?? g?.id))
	// 				.filter(v => Number.isFinite(v) && v > 0)
	// 		);

	// 		const currentBrowseCount = allGames.filter(game => {
	// 			const id = Number(game?.appid ?? game?.app_id ?? game?.id);
	// 			if (!Number.isFinite(id) || id <= 0) return true;
	// 			return !carouselIds.has(id);
	// 		}).length;

	// 		if (currentBrowseCount % BATCH_SIZE === 0) break;

	// 		const gotNew = await loadNextBrowsePage();
	// 		if (gotNew === 0) break;

	// 		safety--;
	// 	}
	// };
	// Scroll carousel section into view when clicked
	const scrollToCarousel = (sectionRef) => {
		if (!sectionRef?.current) return;
		sectionRef.current.scrollIntoView({
			behavior: 'smooth',
			block: 'center',
		});
	};

	const loadNextBrowsePage = async () => {
		if (isLoadingMoreBrowse || !hasMoreBrowse) return false;

		setIsLoadingMoreBrowse(true);
		try {
			const batch = await fetchGamesPage(window.electronAPI, browseOffset);
			console.log(`[loadNextBrowsePage] Fetched next browse page from offset ${browseOffset}:`, batch);
			setBrowseOffset((prev) => prev + batch.length);
			const mapped = batch.map(mapGameCard);

			let addedCount = 0;

			setAllGames((prev) => {
				const next = appendUniqueGames(prev, mapped);
				addedCount = next.length - prev.length;
				return next;
			});


			if (batch.length <= 1) {
				setHasMoreBrowse(false);
			}

			// 🔥 store stats for prediction
			lastFetchStats.current = {
				added: addedCount,
				fetched: batch.length
			};

			return addedCount;		
		} catch (error) {
			console.error('Failed to load next browse page:', error);
			setHasMoreBrowse(false);
			return false;
		} finally {
			setIsLoadingMoreBrowse(false);
		}
	};

	const loadMoreFeatured = async () => {
		if (isLoadingFeaturedMore || !hasMoreFeatured) return;
		setIsLoadingFeaturedMore(true);
		try {
			const chunk = await fetchSpecialsChunk((from) => window.electronAPI.FeaturedGames(from), featuredOffset, CAROUSEL_CHUNK_SIZE);
			const mappedSpecials = enrichCardsWithKnownPlatforms(
				chunk.items.map((game) => mapGameCard(game, 'featured')),
				allGames
			);
			const diversitySlice = featuredDiversityPool.slice(featuredDiversityOffset, featuredDiversityOffset + CAROUSEL_CHUNK_SIZE);
			const incoming = blendFeaturedCards(mappedSpecials, diversitySlice, CAROUSEL_CHUNK_SIZE);
			setFeaturedGames((prev) => appendUniqueGames(prev, incoming));
			setFeaturedDiversityOffset((prev) => prev + diversitySlice.length);
			setFeaturedOffset(chunk.nextFrom);
			setHasMoreFeatured(chunk.hasMore);
		} catch (error) {
			console.error('Failed to load more featured games:', error);
			setHasMoreFeatured(false);
		} finally {
			setIsLoadingFeaturedMore(false);
		}
	};

	const loadMoreDiscounted = async () => {
		if (isLoadingDiscountedMore || !hasMoreDiscounted) return;
		setIsLoadingDiscountedMore(true);
		try {
			const chunk = await fetchSpecialsChunk((from) => window.electronAPI.DiscountedGames(from), discountedOffset, CAROUSEL_CHUNK_SIZE);
			const mapped = enrichCardsWithKnownPlatforms(
				chunk.items.map((game) => mapGameCard(game, 'discount')),
				allGames
			);
			setDiscountedGames((prev) => appendUniqueGames(prev, mapped));
			setDiscountedOffset(chunk.nextFrom);
			setHasMoreDiscounted(chunk.hasMore);
		} catch (error) {
			console.error('Failed to load more discounted games:', error);
			setHasMoreDiscounted(false);
		} finally {
			setIsLoadingDiscountedMore(false);
		}
	};

	const loadMoreUpcoming = async () => {
		if (isLoadingUpcomingMore || !hasMoreUpcoming) return;
		setIsLoadingUpcomingMore(true);
		try {
			const chunk = await fetchSpecialsChunk((from) => window.electronAPI.ComingSoonGames(from), upcomingOffset, CAROUSEL_CHUNK_SIZE);
			const mapped = enrichCardsWithKnownPlatforms(
				chunk.items.map((game) => mapGameCard(game, 'upcoming')),
				allGames
			);
			setUpcomingGames((prev) => appendUniqueGames(prev, mapped));
			setUpcomingOffset(chunk.nextFrom);
			setHasMoreUpcoming(chunk.hasMore);
		} catch (error) {
			console.error('Failed to load more upcoming games:', error);
			setHasMoreUpcoming(false);
		} finally {
			setIsLoadingUpcomingMore(false);
		}
	};
	
	useEffect(() => {
		if (!isLoading && allGames.length > 0) {
			ensureFullBrowsePages();
		}
	}, [isLoading]);
	
	useEffect(() => {
		const fetchData = async () => {
			setIsLoading(true);
			try {
				const [
					firstGamesPage,
					featuredPage1,
					featuredPage2,
					discountedPage1,
					discountedPage2,
					upcomingPage1,
					upcomingPage2,
				] = await Promise.allSettled([
					fetchGamesPage(window.electronAPI, 0),
					fetchSpecialsChunk((from) => window.electronAPI.FeaturedGames(from), 0, BATCH_SIZE),
					fetchSpecialsChunk((from) => window.electronAPI.FeaturedGames(from), BATCH_SIZE, BATCH_SIZE),
					fetchSpecialsChunk((from) => window.electronAPI.DiscountedGames(from), 0, BATCH_SIZE),
					fetchSpecialsChunk((from) => window.electronAPI.DiscountedGames(from), BATCH_SIZE, BATCH_SIZE),
					fetchSpecialsChunk((from) => window.electronAPI.ComingSoonGames(from), 0, BATCH_SIZE),
					fetchSpecialsChunk((from) => window.electronAPI.ComingSoonGames(from), BATCH_SIZE, BATCH_SIZE),
				]);

				if (firstGamesPage.status !== 'fulfilled') {
					throw firstGamesPage.reason;
				}

				const gamesData = [
					...(Array.isArray(firstGamesPage.value) ? firstGamesPage.value : []),
				];
				console.log('Fetched initial games data:', gamesData);
				const featuredChunk1 = featuredPage1.status === 'fulfilled' ? featuredPage1.value : { items: [], nextFrom: BATCH_SIZE, hasMore: false };
				const featuredChunk2 = featuredPage2.status === 'fulfilled' ? featuredPage2.value : { items: [], nextFrom: CAROUSEL_INITIAL_ITEMS, hasMore: false };
				const discountedChunk1 = discountedPage1.status === 'fulfilled' ? discountedPage1.value : { items: [], nextFrom: BATCH_SIZE, hasMore: false };
				const discountedChunk2 = discountedPage2.status === 'fulfilled' ? discountedPage2.value : { items: [], nextFrom: CAROUSEL_INITIAL_ITEMS, hasMore: false };
				const upcomingChunk1 = upcomingPage1.status === 'fulfilled' ? upcomingPage1.value : { items: [], nextFrom: BATCH_SIZE, hasMore: false };
				const upcomingChunk2 = upcomingPage2.status === 'fulfilled' ? upcomingPage2.value : { items: [], nextFrom: CAROUSEL_INITIAL_ITEMS, hasMore: false };
				const canLoadMore = firstGamesPage.status === 'fulfilled' && Array.isArray(firstGamesPage.value) && firstGamesPage.value.length === BATCH_SIZE;
				
				
				// Transform the data to match our component's expected format
				// Note: For detailed game data (when user clicks a game), the GamePage 
				// component will use window.electronAPI.getSteamGameDetails(appID) or 
				// window.electronAPI.getAllDetailsByID(id) to fetch full scraped data
				const transformedGames = (gamesData || []).map((game) => mapGameCard(game));
				const prioritizedGames = transformedGames;

				let featuredCards = [...featuredChunk1.items, ...featuredChunk2.items]
					.map((game) => mapGameCard(game, 'featured'))
					.slice(0, CAROUSEL_INITIAL_ITEMS);
				let discountedCards = [...discountedChunk1.items, ...discountedChunk2.items]
					.map((game) => mapGameCard(game, 'discount'))
					.slice(0, CAROUSEL_INITIAL_ITEMS);
				let upcomingCards = [...upcomingChunk1.items, ...upcomingChunk2.items]
					.map((game) => mapGameCard(game, 'upcoming'))
					.slice(0, CAROUSEL_INITIAL_ITEMS);

				featuredCards = enrichCardsWithKnownPlatforms(featuredCards, transformedGames);
				const featuredDiversity = buildFeaturedDiversityPool(transformedGames).slice(0, CAROUSEL_INITIAL_ITEMS);
				featuredCards = blendFeaturedCards(featuredCards, featuredDiversity, CAROUSEL_INITIAL_ITEMS);
				discountedCards = enrichCardsWithKnownPlatforms(discountedCards, transformedGames);
				upcomingCards = enrichCardsWithKnownPlatforms(upcomingCards, transformedGames);

				// Put Left 4 Dead (app_id 500) first in shop lists.
				// const prioritizedGames = transformedGames.sort((a, b) => {
				// 	const aIsL4D = Number(a?.app_id ?? a?.appid ?? a?.id) === 500;
				// 	const bIsL4D = Number(b?.app_id ?? b?.appid ?? b?.id) === 500;
				// 	if (aIsL4D && !bIsL4D) return -1;
				// 	if (bIsL4D && !aIsL4D) return 1;
				// 	return 0;
				// });

				if (!featuredCards.length) {
					featuredCards = prioritizedGames.slice(0, CAROUSEL_INITIAL_ITEMS).map((game) => mapGameCard(game, 'featured'));
				}

				if (!discountedCards.length) {
					discountedCards = prioritizedGames
						.filter((game) => Number(game.discountPercent) > 0)
						.slice(0, CAROUSEL_INITIAL_ITEMS)
						.map((game) => mapGameCard(game, 'discount'));
				}

				if (!discountedCards.length) {
					discountedCards = prioritizedGames.slice(5, 5 + CAROUSEL_INITIAL_ITEMS).map((game) => mapGameCard(game, 'discount'));
				}

				if (!upcomingCards.length) {
					upcomingCards = prioritizedGames.slice(10, 10 + CAROUSEL_INITIAL_ITEMS).map((game) => mapGameCard(game, 'upcoming'));
				}

				console.log('Setting all games:', transformedGames);
				setAllGames(transformedGames);
				setBrowseOffset(gamesData.length);
				setHasMoreBrowse(canLoadMore);
				setFeaturedGames(featuredCards);
				setDiscountedGames(discountedCards);
				setUpcomingGames(upcomingCards);
				setFeaturedOffset(CAROUSEL_INITIAL_ITEMS);
				setDiscountedOffset(CAROUSEL_INITIAL_ITEMS);
				setUpcomingOffset(CAROUSEL_INITIAL_ITEMS);
				setFeaturedDiversityOffset(Math.min(CAROUSEL_INITIAL_ITEMS, featuredDiversity.length));
				setHasMoreFeatured(featuredChunk2.hasMore);
				setHasMoreDiscounted(discountedChunk2.hasMore);
				setHasMoreUpcoming(upcomingChunk2.hasMore);
			} catch (error) {
				console.error('Failed to fetch games data:', error);
				setAllGames([]);
				setBrowseOffset(0);
				setHasMoreBrowse(false);
				setFeaturedGames([]);
				setDiscountedGames([]);
				setUpcomingGames([]);
				setFeaturedOffset(CAROUSEL_INITIAL_ITEMS);
				setDiscountedOffset(CAROUSEL_INITIAL_ITEMS);
				setUpcomingOffset(CAROUSEL_INITIAL_ITEMS);
				setFeaturedDiversityOffset(0);
				setHasMoreFeatured(false);
				setHasMoreDiscounted(false);
				setHasMoreUpcoming(false);
			} finally {
				setIsLoading(false);
			}
		};
		fetchData();
	}, []);

	
	

	return (

		
		<div className="flex-1">
			{/* Main content area */}
			<div className="h-full px-3 py-4 overflow-y-auto">
				<h1 className="text-2xl font-semibold mb-6 text-slate-100 text-center">Store</h1>

				{/* Show carousels when no filters are active */}
				{!hasFilters && (
				<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
					{/* Featured Games */}
					{featuredGames.length > 0 && (
						<section ref={featuredRef}>
							<h2 className="text-2xl font-semibold mb-4 text-slate-100 text-center">Featured</h2>
							<Storeslider 
								items={featuredGames} 
								onNearEnd={loadMoreFeatured}
								onCardClick={() => scrollToCarousel(featuredRef)}
							/>
						</section>
					)}

					{/* Discounted Games */}
					{discountedGames.length > 0 && (
						<section ref={discountedRef}>
							<h2 className="text-2xl font-semibold mb-4 text-slate-100 text-center">Deals & Discounts</h2>
							<Storeslider 
								items={discountedGames}
								onNearEnd={loadMoreDiscounted}
								onCardClick={() => scrollToCarousel(discountedRef)}
							/>
						</section>
					)}

					{/* Upcoming Games */}
					{upcomingGames.length > 0 && (
						<section ref={upcomingRef}>
							<h2 className="text-2xl font-semibold mb-4 text-slate-100 text-center">Coming Soon</h2>
							<Storeslider 
								items={upcomingGames}
								onNearEnd={loadMoreUpcoming}
								onCardClick={() => scrollToCarousel(upcomingRef)}
							/>
						</section>
					)}

					{/* Launcher Selection */}
					<section>
						<LauncherSelector />
					</section>
				</div>
			)}

			{/* Show grid when filters are active */}
			{hasFilters && (
				<section className="animate-in fade-in slide-in-from-top-4 duration-500">
					<h2 className="text-2xl font-semibold mb-4 text-slate-100">
						Search Results ({filteredGames.length})
					</h2>
					<GameGrid 
						games={filteredGames} 
						isLoading={isLoading}
						emptyMessage="No games found matching your filters"
					/>
				</section>
			)}

			{/* Filtered games section with compact filters sidebar */}
			<section className="mt-8 mb-6">
				<FilteredGamesSection 
					games={browseSectionGames} 
					title="Browse Games"
					onRequestNextPage={loadNextBrowsePage}
					canLoadMore={hasMoreBrowse}
					isLoadingMore={isLoadingMoreBrowse}
				/>
			</section>
		</div>
	</div>
	);
};

export default Shopveiw;
