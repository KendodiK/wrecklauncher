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
	return Array.isArray(batch) ? batch : [];
}

async function fetchSpecialsMin(apiCall, minCount = CAROUSEL_INITIAL_ITEMS, batchSize = BATCH_SIZE, maxPages = 6) {
	const all = [];
	let from = 0;

	for (let i = 0; i < maxPages; i += 1) {
		const payload = await apiCall(from);
		const items = pickSpecialsArray(payload);
		if (!items.length) break;

		all.push(...items);
		if (all.length >= minCount) break;
		if (items.length < batchSize) break;
		from += batchSize;
	}

	return all;
}

async function fetchSpecialsChunk(apiCall, from, take = CAROUSEL_CHUNK_SIZE) {
	const payload = await apiCall(from);
	const items = pickSpecialsArray(payload);
	return {
		items: items.slice(0, take),
		nextFrom: from + take,
		hasMore: items.length >= take,
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

function mapGameCard(game, fallbackTag = '') {
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
		platform_name: game.platform_name || game.platform || 'steam',
		minimum_requirements: game.minimum_requirements || '',
		genres: Array.isArray(game.genres) ? game.genres : [],
		tags: [
			...(Array.isArray(game.tags) ? game.tags : []),
			...(fallbackTag ? [fallbackTag] : []),
		],
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
	const [browseOffset, setBrowseOffset] = useState(0);
	const [hasMoreBrowse, setHasMoreBrowse] = useState(true);
	const [isLoadingMoreBrowse, setIsLoadingMoreBrowse] = useState(false);

	// Refs for carousel sections for scroll-into-view behavior
	const featuredRef = useRef(null);
	const discountedRef = useRef(null);
	const upcomingRef = useRef(null);

	// Calculate filtered games
	const browseSectionGames = useMemo(() => {
		const carouselIds = new Set(
			[...featuredGames, ...discountedGames, ...upcomingGames]
				.map((game) => Number(game?.appid ?? game?.app_id ?? game?.id))
				.filter((value) => Number.isFinite(value) && value > 0)
		);

		return allGames.filter((game) => {
			const id = Number(game?.appid ?? game?.app_id ?? game?.id);
			if (!Number.isFinite(id) || id <= 0) return true;
			return !carouselIds.has(id);
		});
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
			const mapped = batch.map((game) => mapGameCard(game));

			setAllGames((prev) => [...prev, ...mapped]);
			setBrowseOffset((prev) => prev + BATCH_SIZE);
			if (batch.length < BATCH_SIZE) {
				setHasMoreBrowse(false);
			}

			return mapped.length > 0;
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
			const mapped = chunk.items.map((game) => mapGameCard(game, 'featured'));
			setFeaturedGames((prev) => appendUniqueGames(prev, mapped));
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
			const mapped = chunk.items.map((game) => mapGameCard(game, 'discount'));
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
			const mapped = chunk.items.map((game) => mapGameCard(game, 'upcoming'));
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
		const fetchData = async () => {
			setIsLoading(true);
			try {
				const [firstGamesPage, secondGamesPage, featuredResult, discountedResult, upcomingResult] = await Promise.allSettled([
					fetchGamesPage(window.electronAPI, 0),
					fetchGamesPage(window.electronAPI, BATCH_SIZE),
					fetchSpecialsChunk((from) => window.electronAPI.FeaturedGames(from), 0, CAROUSEL_INITIAL_ITEMS),
					fetchSpecialsChunk((from) => window.electronAPI.DiscountedGames(from), 0, CAROUSEL_INITIAL_ITEMS),
					fetchSpecialsChunk((from) => window.electronAPI.ComingSoonGames(from), 0, CAROUSEL_INITIAL_ITEMS),
				]);

				if (firstGamesPage.status !== 'fulfilled') {
					throw firstGamesPage.reason;
				}

				const gamesData = [
					...(Array.isArray(firstGamesPage.value) ? firstGamesPage.value : []),
					...(secondGamesPage.status === 'fulfilled' && Array.isArray(secondGamesPage.value) ? secondGamesPage.value : []),
				];
				const featuredChunk = featuredResult.status === 'fulfilled' ? featuredResult.value : { items: [], nextFrom: CAROUSEL_INITIAL_ITEMS, hasMore: false };
				const discountedChunk = discountedResult.status === 'fulfilled' ? discountedResult.value : { items: [], nextFrom: CAROUSEL_INITIAL_ITEMS, hasMore: false };
				const upcomingChunk = upcomingResult.status === 'fulfilled' ? upcomingResult.value : { items: [], nextFrom: CAROUSEL_INITIAL_ITEMS, hasMore: false };
				const canLoadMore = secondGamesPage.status === 'fulfilled' && Array.isArray(secondGamesPage.value) && secondGamesPage.value.length === BATCH_SIZE;
				console.log('Fetched games from database:', gamesData);
				
				// Transform the data to match our component's expected format
				// Note: For detailed game data (when user clicks a game), the GamePage 
				// component will use window.electronAPI.getSteamGameDetails(appID) or 
				// window.electronAPI.getAllDetailsByID(id) to fetch full scraped data
				const transformedGames = (gamesData || []).map((game) => mapGameCard(game));

				let featuredCards = featuredChunk.items.map((game) => mapGameCard(game, 'featured')).slice(0, CAROUSEL_INITIAL_ITEMS);
				let discountedCards = discountedChunk.items.map((game) => mapGameCard(game, 'discount')).slice(0, CAROUSEL_INITIAL_ITEMS);
				let upcomingCards = upcomingChunk.items.map((game) => mapGameCard(game, 'upcoming')).slice(0, CAROUSEL_INITIAL_ITEMS);

				// Put Left 4 Dead (app_id 500) first in shop lists.
				const prioritizedGames = transformedGames.sort((a, b) => {
					const aIsL4D = Number(a?.app_id ?? a?.appid ?? a?.id) === 500;
					const bIsL4D = Number(b?.app_id ?? b?.appid ?? b?.id) === 500;
					if (aIsL4D && !bIsL4D) return -1;
					if (bIsL4D && !aIsL4D) return 1;
					return 0;
				});

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

				setAllGames(prioritizedGames);
				setBrowseOffset(gamesData.length);
				setHasMoreBrowse(canLoadMore);
				setFeaturedGames(featuredCards);
				setDiscountedGames(discountedCards);
				setUpcomingGames(upcomingCards);
				setFeaturedOffset(featuredChunk.nextFrom || CAROUSEL_INITIAL_ITEMS);
				setDiscountedOffset(discountedChunk.nextFrom || CAROUSEL_INITIAL_ITEMS);
				setUpcomingOffset(upcomingChunk.nextFrom || CAROUSEL_INITIAL_ITEMS);
				setHasMoreFeatured(featuredChunk.hasMore);
				setHasMoreDiscounted(discountedChunk.hasMore);
				setHasMoreUpcoming(upcomingChunk.hasMore);
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
