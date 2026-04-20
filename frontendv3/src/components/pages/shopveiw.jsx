import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Storeslider from '../store/Storeslider.jsx';
import FilteredGamesSection from '../store/FilteredGamesSection.jsx';
import LauncherSelector from '../store/LauncherSelector.jsx';
import { resolveStorePlatformFromGame } from '../../utils/storeRouting.js';
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
	const nextFromCandidate = Number(
		payload?.nextFrom ??
		payload?.next_from ??
		payload?.nextOffset ??
		payload?.next_offset
	);
	const hasMoreCandidate = payload?.hasMore ?? payload?.has_more;
	return {
		items: pageItems,
		nextFrom: Number.isFinite(nextFromCandidate) && nextFromCandidate >= 0
			? nextFromCandidate
			: from + pageItems.length,
		hasMore: typeof hasMoreCandidate === 'boolean'
			? hasMoreCandidate
			: pageItems.length === take,
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

function hasUniqueIncoming(existing, incoming) {
	if (!Array.isArray(incoming) || incoming.length === 0) return false;
	const seen = new Set((existing || []).map((game) => getGameIdentity(game)).filter(Boolean));
	for (const game of incoming) {
		const key = getGameIdentity(game);
		if (key && !seen.has(key)) return true;
	}
	return false;
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

	// Some backends store cents; normalize to major currency unit for UI filters.
	if (looksLikeMinorUnits) {
		return Number((numeric / 100).toFixed(2));
	}

	return Number(numeric.toFixed(2));
}

function extractNamedValue(value) {
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

	if (typeof value === 'string') {
		return value.trim();
	}

	return '';
}

function normalizeNamedList(input) {
	const source = Array.isArray(input) ? input : [input];
	const seen = new Set();
	const out = [];

	for (const entry of source) {
		const label = extractNamedValue(entry);
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

function mapGameCard(game, fallbackTag = '') {
	const normalizedPlatform = resolveStorePlatformFromGame(game, 'steam');
	const resolvedImage = game.banner_img || game.image || steamPoster(game.app_id || game.appid || game.id);
	const normalizedPrice = normalizePriceValue(game.cost ?? game.price, normalizedPlatform);
	const normalizedGenres = normalizeNamedList(game.genre_names ?? game.genreNames ?? game.genres);
	const normalizedTags = normalizeNamedList(game.tag_names ?? game.tagNames ?? game.tags);
	const baseTags = normalizedTags.length > 0 ? normalizedTags : normalizedGenres;
	const tagSet = new Set(baseTags.map((tag) => String(tag).toLowerCase()));
	const dbGameId = Number(game?.id);
	const resolvedDbId = Number.isFinite(dbGameId) && dbGameId > 0 ? dbGameId : null;
	const appIdCandidate = Number(game?.app_id ?? game?.appid ?? game?.id);
	const resolvedAppId = Number.isFinite(appIdCandidate) && appIdCandidate > 0
		? appIdCandidate
		: resolvedDbId;
	if (fallbackTag && !tagSet.has(String(fallbackTag).toLowerCase())) {
		baseTags.push(fallbackTag);
	}

	return {
		id: resolvedDbId ?? resolvedAppId,
		db_id: resolvedDbId,
		app_id: resolvedAppId,
		appid: resolvedAppId,
		name: game.name,
		title: game.name || game.title,
		image: resolvedImage,
		banner_img: game.banner_img || game.image || null,
		preferContainImage: !game.banner_img,
		cost: normalizedPrice,
		price: normalizedPrice,
		discountPercent: parseDiscountPercent(game),
		description: game.description || '',
		platform_name: normalizedPlatform,
		minimum_requirements: game.minimum_requirements || '',
		genres: normalizedGenres,
		tags: baseTags,
	};
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
	const [browseOffset, setBrowseOffset] = useState(0);
	const [hasMoreBrowse, setHasMoreBrowse] = useState(true);
	const [isLoadingMoreBrowse, setIsLoadingMoreBrowse] = useState(false);

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


			if (batch.length < BATCH_SIZE) {
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

	const handleRemoteResultsUpdate = useCallback((rows) => {
		if (!Array.isArray(rows) || rows.length < 1) return;
		const mapped = rows.map((row) => mapGameCard(row)).filter(Boolean);
		if (mapped.length < 1) return;
		setAllGames((prev) => appendUniqueGames(prev, mapped));
	}, []);

	const loadMoreFeatured = async () => {
		if (isLoadingFeaturedMore || !hasMoreFeatured) return;
		setIsLoadingFeaturedMore(true);
		try {
			const chunk = await fetchSpecialsChunk((from) => window.electronAPI.FeaturedGames(from), featuredOffset, CAROUSEL_CHUNK_SIZE);
			const mapped = chunk.items.map((game) => mapGameCard(game, 'featured'));
			const hasNew = hasUniqueIncoming(featuredGames, mapped);
			setFeaturedGames((prev) => appendUniqueGames(prev, mapped));
			setFeaturedOffset(chunk.nextFrom);
			setHasMoreFeatured(chunk.hasMore && hasNew);
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
			const mapped = chunk.items.map((game) => mapGameCard(game, 'discount'));
			const hasNew = hasUniqueIncoming(discountedGames, mapped);
			setDiscountedGames((prev) => appendUniqueGames(prev, mapped));
			setDiscountedOffset(chunk.nextFrom);
			setHasMoreDiscounted(chunk.hasMore && hasNew);
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
			const mapped = chunk.items.map((game) => mapGameCard(game, 'upcoming'));
			const hasNew = hasUniqueIncoming(upcomingGames, mapped);
			setUpcomingGames((prev) => appendUniqueGames(prev, mapped));
			setUpcomingOffset(chunk.nextFrom);
			setHasMoreUpcoming(chunk.hasMore && hasNew);
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
					secondGamesPage,
					featuredPage1,
					featuredPage2,
					discountedPage1,
					discountedPage2,
					upcomingPage1,
					upcomingPage2,
				] = await Promise.allSettled([
					fetchGamesPage(window.electronAPI, 0),
					fetchGamesPage(window.electronAPI, BATCH_SIZE),
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

				const firstGames = Array.isArray(firstGamesPage.value) ? firstGamesPage.value : [];
				const secondGames = secondGamesPage.status === 'fulfilled' && Array.isArray(secondGamesPage.value)
					? secondGamesPage.value
					: [];
				const gamesData = [
					...firstGames,
					...secondGames,
				];
				console.log('Fetched initial games data:', gamesData);
				const featuredChunk1 = featuredPage1.status === 'fulfilled' ? featuredPage1.value : { items: [], nextFrom: BATCH_SIZE, hasMore: false };
				const featuredChunk2 = featuredPage2.status === 'fulfilled' ? featuredPage2.value : { items: [], nextFrom: CAROUSEL_INITIAL_ITEMS, hasMore: false };
				const discountedChunk1 = discountedPage1.status === 'fulfilled' ? discountedPage1.value : { items: [], nextFrom: BATCH_SIZE, hasMore: false };
				const discountedChunk2 = discountedPage2.status === 'fulfilled' ? discountedPage2.value : { items: [], nextFrom: CAROUSEL_INITIAL_ITEMS, hasMore: false };
				const upcomingChunk1 = upcomingPage1.status === 'fulfilled' ? upcomingPage1.value : { items: [], nextFrom: BATCH_SIZE, hasMore: false };
				const upcomingChunk2 = upcomingPage2.status === 'fulfilled' ? upcomingPage2.value : { items: [], nextFrom: CAROUSEL_INITIAL_ITEMS, hasMore: false };
				const canLoadMore =
					(secondGamesPage.status === 'fulfilled' && secondGames.length === BATCH_SIZE) ||
					(secondGamesPage.status !== 'fulfilled' && firstGames.length === BATCH_SIZE);
				
				
				// Transform the data to match our component's expected format
				// Note: For detailed game data (when user clicks a game), the GamePage 
				// component will use window.electronAPI.getSteamGameDetails(appID) or 
				// window.electronAPI.getAllDetailsByID(id) to fetch full scraped data
				const transformedGames = (gamesData || []).map((game) => mapGameCard(game));

				let featuredCards = appendUniqueGames(
					[],
					[...featuredChunk1.items, ...featuredChunk2.items]
						.map((game) => mapGameCard(game, 'featured'))
						.slice(0, CAROUSEL_INITIAL_ITEMS)
				);
				let discountedCards = appendUniqueGames(
					[],
					[...discountedChunk1.items, ...discountedChunk2.items]
						.map((game) => mapGameCard(game, 'discount'))
						.slice(0, CAROUSEL_INITIAL_ITEMS)
				);
				let upcomingCards = appendUniqueGames(
					[],
					[...upcomingChunk1.items, ...upcomingChunk2.items]
						.map((game) => mapGameCard(game, 'upcoming'))
						.slice(0, CAROUSEL_INITIAL_ITEMS)
				);

				const featuredNextOffset = featuredPage2.status === 'fulfilled'
					? featuredChunk2.nextFrom
					: (featuredPage1.status === 'fulfilled' ? featuredChunk1.nextFrom : 0);
				const discountedNextOffset = discountedPage2.status === 'fulfilled'
					? discountedChunk2.nextFrom
					: (discountedPage1.status === 'fulfilled' ? discountedChunk1.nextFrom : 0);
				const upcomingNextOffset = upcomingPage2.status === 'fulfilled'
					? upcomingChunk2.nextFrom
					: (upcomingPage1.status === 'fulfilled' ? upcomingChunk1.nextFrom : 0);

				let featuredHasMore = featuredPage2.status === 'fulfilled'
					? featuredChunk2.hasMore
					: (featuredPage1.status === 'fulfilled' ? featuredChunk1.hasMore : false);
				let discountedHasMore = discountedPage2.status === 'fulfilled'
					? discountedChunk2.hasMore
					: (discountedPage1.status === 'fulfilled' ? discountedChunk1.hasMore : false);
				let upcomingHasMore = upcomingPage2.status === 'fulfilled'
					? upcomingChunk2.hasMore
					: (upcomingPage1.status === 'fulfilled' ? upcomingChunk1.hasMore : false);

				if (featuredChunk1.items.length + featuredChunk2.items.length < 1) {
					featuredHasMore = false;
				}
				if (discountedChunk1.items.length + discountedChunk2.items.length < 1) {
					discountedHasMore = false;
				}
				if (upcomingChunk1.items.length + upcomingChunk2.items.length < 1) {
					upcomingHasMore = false;
				}

				console.log('Setting all games:', transformedGames);
				setAllGames(transformedGames);
				setBrowseOffset(gamesData.length);
				setHasMoreBrowse(canLoadMore);
				setFeaturedGames(featuredCards);
				setDiscountedGames(discountedCards);
				setUpcomingGames(upcomingCards);
				setFeaturedOffset(featuredNextOffset);
				setDiscountedOffset(discountedNextOffset);
				setUpcomingOffset(upcomingNextOffset);
				setHasMoreFeatured(featuredHasMore);
				setHasMoreDiscounted(discountedHasMore);
				setHasMoreUpcoming(upcomingHasMore);
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

				{/* Show carousels before browse selection */}
				<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
					{/* Featured Games */}
					<section ref={featuredRef}>
						<h2 className="text-2xl font-semibold mb-4 text-slate-100 text-center">Featured</h2>
						{featuredGames.length > 0 ? (
							<Storeslider 
								items={featuredGames} 
								onNearEnd={loadMoreFeatured}
								onCardClick={() => scrollToCarousel(featuredRef)}
							/>
						) : (
							<p className="text-sm text-slate-400 text-center">No featured games from endpoint.</p>
						)}
					</section>

					{/* Discounted Games */}
					<section ref={discountedRef}>
						<h2 className="text-2xl font-semibold mb-4 text-slate-100 text-center">Deals & Discounts</h2>
						{discountedGames.length > 0 ? (
							<Storeslider 
								items={discountedGames}
								onNearEnd={loadMoreDiscounted}
								onCardClick={() => scrollToCarousel(discountedRef)}
							/>
						) : (
							<p className="text-sm text-slate-400 text-center">No discounted games from endpoint.</p>
						)}
					</section>

					{/* Upcoming Games */}
					<section ref={upcomingRef}>
						<h2 className="text-2xl font-semibold mb-4 text-slate-100 text-center">Coming Soon</h2>
						{upcomingGames.length > 0 ? (
							<Storeslider 
								items={upcomingGames}
								onNearEnd={loadMoreUpcoming}
								onCardClick={() => scrollToCarousel(upcomingRef)}
							/>
						) : (
							<p className="text-sm text-slate-400 text-center">No upcoming games from endpoint.</p>
						)}
					</section>

					{/* Launcher Selection */}
					<section>
						<LauncherSelector />
					</section>
				</div>

			{/* Filtered games section with compact filters sidebar */}
			<section className="mt-8 mb-6">
				<FilteredGamesSection 
					games={browseSectionGames} 
					title="Browse Games"
					onRequestNextPage={loadNextBrowsePage}
					canLoadMore={hasMoreBrowse}
					isLoadingMore={isLoadingMoreBrowse}
					onRemoteResultsUpdate={handleRemoteResultsUpdate}
				/>
			</section>
		</div>
	</div>
	);
};

export default Shopveiw;
