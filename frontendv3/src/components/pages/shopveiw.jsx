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

async function fetchAllGamesInBatches(api, batchSize = 20) {
	const all = [];
	let from = 0;

	while (true) {
		const batch = await api.getGames(from);
		if (!Array.isArray(batch) || batch.length === 0) break;
		all.push(...batch);
		if (batch.length < batchSize) break;
		from += batchSize;
	}

	return all;
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

	
	useEffect(() => {
		const fetchData = async () => {
			setIsLoading(true);
			try {
				const [gamesResult, featuredResult, discountedResult, upcomingResult] = await Promise.allSettled([
					fetchAllGamesInBatches(window.electronAPI, 20),
					window.electronAPI.FeaturedGames(0),
					window.electronAPI.DiscountedGames(0),
					window.electronAPI.ComingSoonGames(0),
				]);

				if (gamesResult.status !== 'fulfilled') {
					throw gamesResult.reason;
				}

				const gamesData = gamesResult.value;
				const featuredData = featuredResult.status === 'fulfilled' ? featuredResult.value : [];
				const discountedData = discountedResult.status === 'fulfilled' ? discountedResult.value : [];
				const upcomingData = upcomingResult.status === 'fulfilled' ? upcomingResult.value : [];
				console.log('Fetched games from database:', gamesData);
				
				// Transform the data to match our component's expected format
				// Note: For detailed game data (when user clicks a game), the GamePage 
				// component will use window.electronAPI.getSteamGameDetails(appID) or 
				// window.electronAPI.getAllDetailsByID(id) to fetch full scraped data
				const transformedGames = (gamesData || []).map((game) => mapGameCard(game));

				let featuredCards = pickSpecialsArray(featuredData).map((game) => mapGameCard(game, 'featured'));
				let discountedCards = pickSpecialsArray(discountedData).map((game) => mapGameCard(game, 'discount'));
				let upcomingCards = pickSpecialsArray(upcomingData).map((game) => mapGameCard(game, 'upcoming'));

				// Put Left 4 Dead (app_id 500) first in shop lists.
				const prioritizedGames = transformedGames.sort((a, b) => {
					const aIsL4D = Number(a?.app_id ?? a?.appid ?? a?.id) === 500;
					const bIsL4D = Number(b?.app_id ?? b?.appid ?? b?.id) === 500;
					if (aIsL4D && !bIsL4D) return -1;
					if (bIsL4D && !aIsL4D) return 1;
					return 0;
				});

				if (!featuredCards.length) {
					featuredCards = prioritizedGames.slice(0, 5).map((game) => mapGameCard(game, 'featured'));
				}

				if (!discountedCards.length) {
					discountedCards = prioritizedGames
						.filter((game) => Number(game.discountPercent) > 0)
						.slice(0, 12)
						.map((game) => mapGameCard(game, 'discount'));
				}

				if (!discountedCards.length) {
					discountedCards = prioritizedGames.slice(5, 10).map((game) => mapGameCard(game, 'discount'));
				}

				if (!upcomingCards.length) {
					upcomingCards = prioritizedGames.slice(10, 15).map((game) => mapGameCard(game, 'upcoming'));
				}

				setAllGames(prioritizedGames);
				setFeaturedGames(featuredCards);
				setDiscountedGames(discountedCards);
				setUpcomingGames(upcomingCards);
			} catch (error) {
				console.error('Failed to fetch games data:', error);
				setAllGames([]);
				setFeaturedGames([]);
				setDiscountedGames([]);
				setUpcomingGames([]);
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
				/>
			</section>
		</div>
	</div>
	);
};

export default Shopveiw;
