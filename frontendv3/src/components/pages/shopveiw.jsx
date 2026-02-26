import React, { useEffect, useMemo, useRef, useState } from 'react';
import Storeslider from '../store/Storeslider.jsx';
import GameGrid from '../store/GameGrid.jsx';
import RightSidebar from '../store/RightSidebar.jsx';
import GameListWithPreview from '../store/GameListWithPreview.jsx';
import { combineFilters, hasActiveFilters as checkActiveFilters } from '../../utils/gameUtils.js';
import { runSmokeControllers } from '../../smokeControllers.js';

function steamPoster(appid) {
	const id = Number(appid);
	if (!Number.isFinite(id) || id <= 0) return null;
	return `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
}

const DEFAULT_STEAM_APPIDS = [
	570, // Dota 2
	730, // CS2
	440, // TF2
	271590, // GTA V
	578080, // PUBG
	1174180, // Red Dead Redemption 2
	1245620, // ELDEN RING
	359550, // Rainbow Six Siege
	1086940, // Baldur's Gate 3
];

// Mock data for featured games
const FEATURED_GAMES = [
	{ id: 1245620, appid: 1245620, title: 'ELDEN RING', image: steamPoster(1245620), price: 59.99, genres: [3, 1], tags: ['featured'] },
	{ id: 1086940, appid: 1086940, title: "Baldur's Gate 3", image: steamPoster(1086940), price: 59.99, genres: [3, 2], tags: ['featured'] },
	{ id: 271590, appid: 271590, title: 'Grand Theft Auto V', image: steamPoster(271590), price: 29.99, genres: [1, 2], tags: ['featured'] },
	{ id: 1174180, appid: 1174180, title: 'Red Dead Redemption 2', image: steamPoster(1174180), price: 59.99, genres: [1, 2], tags: ['featured'] },
	{ id: 359550, appid: 359550, title: "Tom Clancy's Rainbow Six Siege", image: steamPoster(359550), price: 19.99, genres: [1, 4], tags: ['featured'] },
];

// Mock data for discounted games
const DISCOUNTED_GAMES = [
	{ id: 578080, appid: 578080, title: 'PLAYERUNKNOWN\'S BATTLEGROUNDS', image: steamPoster(578080), price: 14.99, genres: [1, 6], tags: ['discount'] },
	{ id: 730, appid: 730, title: 'Counter-Strike 2', image: steamPoster(730), price: 0, genres: [1, 4], tags: ['discount'] },
	{ id: 440, appid: 440, title: 'Team Fortress 2', image: steamPoster(440), price: 0, genres: [1], tags: ['discount'] },
	{ id: 271590, appid: 271590, title: 'Grand Theft Auto V', image: steamPoster(271590), price: 14.99, genres: [1, 2], tags: ['discount'] },
	{ id: 359550, appid: 359550, title: "Tom Clancy's Rainbow Six Siege", image: steamPoster(359550), price: 9.99, genres: [1, 4], tags: ['discount'] },
];

// Mock data for upcoming games
const UPCOMING_GAMES = [
	{ id: 1086940, appid: 1086940, title: "Baldur's Gate 3", image: steamPoster(1086940), price: 59.99, genres: [3, 2], tags: ['upcoming'] },
	{ id: 1245620, appid: 1245620, title: 'ELDEN RING', image: steamPoster(1245620), price: 59.99, genres: [3, 1], tags: ['upcoming'] },
	{ id: 1174180, appid: 1174180, title: 'Red Dead Redemption 2', image: steamPoster(1174180), price: 59.99, genres: [1, 2], tags: ['upcoming'] },
];

// Mock all games data for filtering
const ALL_GAMES = [
	{ id: 570, appid: 570, title: 'Dota 2', image: steamPoster(570), price: 0, genres: [1, 4] },
	{ id: 730, appid: 730, title: 'Counter-Strike 2', image: steamPoster(730), price: 0, genres: [1, 4] },
	{ id: 440, appid: 440, title: 'Team Fortress 2', image: steamPoster(440), price: 0, genres: [1] },
	{ id: 271590, appid: 271590, title: 'Grand Theft Auto V', image: steamPoster(271590), price: 29.99, genres: [1, 2] },
	{ id: 578080, appid: 578080, title: 'PLAYERUNKNOWN\'S BATTLEGROUNDS', image: steamPoster(578080), price: 29.99, genres: [1, 6] },
	{ id: 1174180, appid: 1174180, title: 'Red Dead Redemption 2', image: steamPoster(1174180), price: 59.99, genres: [1, 2] },
	{ id: 1245620, appid: 1245620, title: 'ELDEN RING', image: steamPoster(1245620), price: 59.99, genres: [3, 1] },
	{ id: 359550, appid: 359550, title: "Tom Clancy's Rainbow Six Siege", image: steamPoster(359550), price: 19.99, genres: [1, 4] },
	{ id: 1086940, appid: 1086940, title: "Baldur's Gate 3", image: steamPoster(1086940), price: 59.99, genres: [3, 2] },
	{ id: 1237970, appid: 1237970, title: 'Titanfall 2', image: steamPoster(1237970), price: 29.99, genres: [1] },
	{ id: 292030, appid: 292030, title: 'The Witcher 3: Wild Hunt', image: steamPoster(292030), price: 39.99, genres: [3, 2] },
	{ id: 489830, appid: 489830, title: 'The Elder Scrolls V: Skyrim', image: steamPoster(489830), price: 19.99, genres: [3, 2] },
];

// Mock genres
const GENRES = [
	{ id: 1, name: 'Action' },
	{ id: 2, name: 'Adventure' },
	{ id: 3, name: 'RPG' },
	{ id: 4, name: 'Strategy' },
	{ id: 5, name: 'Simulation' },
	{ id: 6, name: 'Sports' },
];

// Mock data for top sellers list (with discounts)
const TOP_SELLERS = [
	{ 
		id: 2050650, 
		appid: 2050650, 
		title: 'Resident Evil Requiem', 
		image: steamPoster(2050650), 
		price: 69.99, 
		originalPrice: null,
		discount: null,
		tags: ['Survival Horror', 'Third-Person Shooter', 'Zombies', 'Horror'],
		genres: ['Action', 'Horror', 'Survival']
	},
	{ 
		id: 578080, 
		appid: 578080, 
		title: 'PUBG: BATTLEGROUNDS', 
		image: steamPoster(578080), 
		price: 0, 
		originalPrice: null,
		discount: null,
		tags: ['Survival', 'Shooter', 'Battle Royale', 'Multiplayer'],
		genres: ['Action', 'Multiplayer']
	},
	{ 
		id: 346110, 
		appid: 346110, 
		title: 'ARK: Survival Ascended', 
		image: steamPoster(346110), 
		price: 11.24, 
		originalPrice: 44.99,
		discount: 75,
		tags: ['Early Access', 'Survival', 'Open World', 'Multiplayer'],
		genres: ['Action', 'Adventure', 'Survival']
	},
	{ 
		id: 644930, 
		appid: 644930, 
		title: 'ARC Raiders', 
		image: steamPoster(644930), 
		price: 39.99, 
		originalPrice: null,
		discount: null,
		tags: ['Extraction Shooter', 'Multiplayer', 'PvP', 'PvE'],
		genres: ['Action', 'Shooter']
	},
	{ 
		id: 1069420, 
		appid: 1069420, 
		title: 'Limbus Company', 
		image: steamPoster(1069420), 
		price: 0, 
		originalPrice: null,
		discount: null,
		tags: ['Story Rich', 'Lore-Rich', 'Free to Play', 'Turn-Based Combat'],
		genres: ['RPG', 'Strategy']
	},
	{ 
		id: 379430, 
		appid: 379430, 
		title: 'Kingdom Come: Deliverance II', 
		image: steamPoster(379430), 
		price: 29.99, 
		originalPrice: 59.99,
		discount: 50,
		tags: ['RPG', 'Medieval', 'Open World', 'Singleplayer'],
		genres: ['RPG', 'Action']
	},
	{ 
		id: 1667630, 
		appid: 1667630, 
		title: 'Mewgenics', 
		image: steamPoster(1667630), 
		price: 28.99, 
		originalPrice: null,
		discount: null,
		tags: ['Turn-Based Tactics', 'Roguelite', 'Turn-Based Strategy', 'Dark Humor'],
		genres: ['Strategy', 'Simulation']
	},
	{ 
		id: 2296790, 
		appid: 2296790, 
		title: 'Marathon', 
		image: steamPoster(2296790), 
		price: 39.99, 
		originalPrice: null,
		discount: null,
		tags: ['Extraction Shooter', 'PvP', 'Shooter', 'Multiplayer'],
		genres: ['Action', 'Shooter']
	},
	{ 
		id: 254700, 
		appid: 254700, 
		title: 'Resident Evil 4', 
		image: steamPoster(254700), 
		price: 15.99, 
		originalPrice: 39.99,
		discount: 60,
		tags: ['Horror', 'Action', 'Survival Horror', 'Third-Person Shooter'],
		genres: ['Action', 'Horror']
	},
	{ 
		id: 1061350, 
		appid: 1061350, 
		title: 'Super Battle Golf', 
		image: steamPoster(1061350), 
		price: 6.39, 
		originalPrice: 7.99,
		discount: 20,
		tags: ['Multiplayer', 'Online Co-Op', 'Co-op', 'Sports'],
		genres: ['Sports', 'Casual']
	},
];

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
	const [allGames, setAllGames] = useState(ALL_GAMES);
	const [genres, setGenres] = useState(GENRES);
	const [filters, setFilters] = useState({
		query: '',
		genres: [],
		priceRange: { min: 0, max: 100 },
	});
	const [isLoading, setIsLoading] = useState(false);
	const [sidebarOpen, setSidebarOpen] = useState(true);

	// Refs for carousel sections for scroll-into-view behavior
	const featuredRef = useRef(null);
	const discountedRef = useRef(null);
	const upcomingRef = useRef(null);

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

	// Fetch data on mount (mock for now)
	useEffect(() => {
		// In real implementation, fetch from API:
		// const fetchData = async () => {
		// 	setIsLoading(true);
		// 	try {
		// 		const [gamesData, genresData] = await Promise.all([
		// 			window.electronAPI?.getAllGames() || Promise.resolve(ALL_GAMES),
		// 			window.electronAPI?.getGenres() || Promise.resolve(GENRES),
		// 		]);
		// 		setAllGames(gamesData);
		// 		setGenres(genresData);
		// 	} catch (error) {
		// 		console.error('Failed to fetch data:', error);
		// 	} finally {
		// 		setIsLoading(false);
		// 	}
		// };
		// fetchData();
	}, []);

	// Original simple implementation (commented out for reference)
	// return (
	// 	<div className="flex-1 px-3 py-4">
	// 		<h1 className="text-2xl font-semibold mb-4">Shop</h1>
	// 		<Storeslider items={items || DEFAULT_ITEMS} />
	// 	</div>
	// );

	return (
		<div className="flex-1 relative">
			{/* Toggle button for filters sidebar */}
			<button
				onClick={() => setSidebarOpen(!sidebarOpen)}
				className="fixed right-4 top-20 z-50 p-2 bg-slate-800/90 hover:bg-slate-700/90 border border-slate-600/50 rounded-lg text-slate-200 transition-all shadow-lg backdrop-blur-sm"
				title={sidebarOpen ? 'Hide filters' : 'Show filters'}
			>
				<svg 
					className="w-5 h-5 transition-transform duration-300" 
					style={{ transform: sidebarOpen ? 'rotate(0deg)' : 'rotate(180deg)' }}
					fill="none" 
					stroke="currentColor" 
					viewBox="0 0 24 24"
				>
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
				</svg>
			</button>

			{/* Main content area - reduced width to account for sidebar when open */}
			<div className={`h-full px-3 py-4 overflow-y-auto transition-all duration-300 ${sidebarOpen ? 'mr-80' : 'mr-0'}`}>
				<h1 className="text-2xl font-semibold mb-6 text-slate-100">Store</h1>

				{/* Show carousels when no filters are active */}
				{!hasFilters && (
					<div className="space-y-8">
						{/* Featured Games */}
						<section ref={featuredRef}>
							<h2 className="text-2xl font-semibold mb-4 text-slate-100">Featured</h2>
							<Storeslider 
								items={FEATURED_GAMES} 
								onCardClick={() => scrollToCarousel(featuredRef)}
							/>
						</section>

						{/* Discounted Games */}
						<section ref={discountedRef}>
							<h2 className="text-2xl font-semibold mb-4 text-slate-100">Deals & Discounts</h2>
							<Storeslider 
								items={DISCOUNTED_GAMES}
								onCardClick={() => scrollToCarousel(discountedRef)}
							/>
						</section>

						{/* Upcoming Games */}
						<section ref={upcomingRef}>
							<h2 className="text-2xl font-semibold mb-4 text-slate-100">Coming Soon</h2>
							<Storeslider 
								items={UPCOMING_GAMES}
								onCardClick={() => scrollToCarousel(upcomingRef)}
							/>
						</section>
					</div>
				)}

				{/* Show grid when filters are active */}
				{hasFilters && (
					<section>
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

				{/* Bottom section - Top Sellers list */}
				<section className="mt-8 mb-6">
					<GameListWithPreview 
						games={TOP_SELLERS} 
						title="Top Sellers"
					/>
				</section>
			</div>

			{/* Right sidebar - toggleable with slide animation */}
			<RightSidebar 
				genres={genres}
				onFiltersChange={handleFiltersChange}
				className={`transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}
			/>
		</div>
	);
};

export default Shopveiw;
