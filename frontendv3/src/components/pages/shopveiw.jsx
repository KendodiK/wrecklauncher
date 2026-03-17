import React, { useEffect, useMemo, useRef, useState } from 'react';
import Storeslider from '../store/Storeslider.jsx';
import GameGrid from '../store/GameGrid.jsx';
import FilteredGamesSection from '../store/FilteredGamesSection.jsx';
import LauncherSelector from '../store/LauncherSelector.jsx';
import { combineFilters, hasActiveFilters as checkActiveFilters } from '../../utils/gameUtils.js';
import { runSmokeControllers } from '../../smokeControllers.js';

/**
 * Shop View Component
 * 
 * Data Flow:
 * 1. On mount: Fetches all games from backend database (GET /api/games)
 *    - Returns basic game info: id, app_id, name, banner_img, cost, description, etc.
 * 
 * 2. When user clicks a game: Navigates to GamePage (/game/:id)
 *    - GamePage then uses window.electronAPI.getSteamGameDetails(appID, cc) to fetch
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

const Shopveiw = ({ items }) => {
	const didRunSmokeRef = useRef(false);
	useEffect(() => {
		// React.StrictMode runs effects twice in dev; guard so smoke runs once.
		if (didRunSmokeRef.current) return;
		didRunSmokeRef.current = true;
		runSmokeControllers().catch((e) => {
			console.warn('[smoke] runSmokeControllers failed:', e);
		});
	}, []);
	const [allGames, setAllGames] = useState([]);
	const [filters, setFilters] = useState({
		query: '',
		genres: [],
		priceRange: { min: 0, max: 100 },
	});
	const [isLoading, setIsLoading] = useState(true);

	// Refs for carousel sections for scroll-into-view behavior
	const featuredRef = useRef(null);
	const discountedRef = useRef(null);
	const upcomingRef = useRef(null);

	// Derive featured, discounted, and upcoming games from allGames
	const featuredGames = useMemo(() => {
		// Keep app_id 500 (Left 4 Dead) first if available, then fill by highest cost.
		const ordered = [...allGames].sort((a, b) => {
			const aId = Number(a?.app_id ?? a?.appid ?? a?.id);
			const bId = Number(b?.app_id ?? b?.appid ?? b?.id);
			if (aId === 500 && bId !== 500) return -1;
			if (bId === 500 && aId !== 500) return 1;
			return (b.cost || 0) - (a.cost || 0);
		});

		return ordered
			.slice(0, 5)
			.map(game => ({
				id: game.app_id || game.id,
				appid: game.app_id || game.id,
				title: game.name,
				image: game.image || steamPoster(game.app_id || game.id),
				price: game.cost || 0,
				description: game.description,
				genres: game.genres || [],
				tags: [...(game.tags || []), 'featured']
			}));
	}, [allGames]);

	const discountedGames = useMemo(() => {
		// For now, take some random games as "discounted"
		// In the future, you can add a discount field to the database
		return allGames
			.slice(5, 10)
			.map(game => ({
				id: game.app_id || game.id,
				appid: game.app_id || game.id,
				title: game.name,
				image: game.image || steamPoster(game.app_id || game.id),
				price: game.cost || 0,
				description: game.description,
				genres: game.genres || [],
				tags: [...(game.tags || []), 'discount']
			}));
	}, [allGames]);

	const upcomingGames = useMemo(() => {
		// Take some games as "upcoming"
		return allGames
			.slice(10, 13)
			.map(game => ({
				id: game.app_id || game.id,
				appid: game.app_id || game.id,
				title: game.name,
				image: game.image || steamPoster(game.app_id || game.id),
				price: game.cost || 0,
				description: game.description,
				genres: game.genres || [],
				tags: [...(game.tags || []), 'upcoming']
			}));
	}, [allGames]);

	// Calculate filtered games
	const filteredGames = useMemo(() => {
		return combineFilters(allGames, filters);
	}, [allGames, filters]);

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
				// Fetch game list through preload/IPC instead of direct HTTP from renderer.
				const api = window?.electronAPI;
				if (!api || typeof api.getGames !== 'function') {
					throw new Error('window.electronAPI.getGames is not available');
				}

				const gamesData = await api.getGames(0);
				console.log('Fetched games from database:', gamesData);
				
				// Transform the data to match our component's expected format
				// Note: For detailed game data (when user clicks a game), the GamePage 
				// component will use window.electronAPI.getSteamGameDetails(appID) or 
				// window.electronAPI.getAllDetailsByID(id) to fetch full scraped data
				const transformedGames = (gamesData || []).map(game => ({
					id: game.id,
					app_id: game.app_id,
					appid: game.app_id, // Both formats for compatibility
					name: game.name,
					title: game.name, // Both formats for compatibility
					image: game.banner_img || steamPoster(game.app_id),
					banner_img: game.banner_img,
					cost: game.cost || 0,
					price: game.cost || 0, // Both formats for compatibility
					description: game.description,
					platform_name: game.platform_name,
					minimum_requirements: game.minimum_requirements,
					// Add any genre data if available
					genres: game.genres || [],
					tags: game.tags || []
				}));

				// Put Left 4 Dead (app_id 500) first in shop lists.
				const prioritizedGames = transformedGames.sort((a, b) => {
					const aIsL4D = Number(a?.app_id ?? a?.appid ?? a?.id) === 500;
					const bIsL4D = Number(b?.app_id ?? b?.appid ?? b?.id) === 500;
					if (aIsL4D && !bIsL4D) return -1;
					if (bIsL4D && !aIsL4D) return 1;
					return 0;
				});

				setAllGames(prioritizedGames);
			} catch (error) {
				console.error('Failed to fetch games data:', error);
				setAllGames([]);
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
				<h1 className="text-2xl font-semibold mb-6 text-slate-100">Store</h1>

				{/* Show carousels when no filters are active */}
				{!hasFilters && (
				<div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
					{/* Featured Games */}
					{featuredGames.length > 0 && (
						<section ref={featuredRef}>
							<h2 className="text-2xl font-semibold mb-4 text-slate-100">Featured</h2>
							<Storeslider 
								items={featuredGames} 
								onCardClick={() => scrollToCarousel(featuredRef)}
							/>
						</section>
					)}

					{/* Discounted Games */}
					{discountedGames.length > 0 && (
						<section ref={discountedRef}>
							<h2 className="text-2xl font-semibold mb-4 text-slate-100">Deals & Discounts</h2>
							<Storeslider 
								items={discountedGames}
								onCardClick={() => scrollToCarousel(discountedRef)}
							/>
						</section>
					)}

					{/* Upcoming Games */}
					{upcomingGames.length > 0 && (
						<section ref={upcomingRef}>
							<h2 className="text-2xl font-semibold mb-4 text-slate-100">Coming Soon</h2>
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
					games={allGames} 
					title="Browse Games"
				/>
			</section>
		</div>
	</div>
	);
};

export default Shopveiw;
