import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CompactFiltersSidebar from '../store/CompactFiltersSidebar.jsx';

function steamPoster(appid) {
	const id = Number(appid);
	if (!Number.isFinite(id) || id <= 0) return null;
	return `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
}

function normalizePlatformId(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (!normalized) return '';
	if (normalized === 'itch' || normalized === 'itch.io' || normalized === 'itchio') return 'itchio';
	if (normalized === 'epic games' || normalized === 'epic_games') return '';
	return normalized;
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

function extractGameId(game) {
	const id = Number(game?.app_id ?? game?.appid ?? game?.id);
	return Number.isFinite(id) && id > 0 ? id : null;
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
		if (!Number.isFinite(value) || value <= 0) continue;
		return value <= 1 ? Math.round(value * 100) : Math.round(value);
	}

	return 0;
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

/**
 * Full page for browsing all games with pagination
 */
const AllGamesPage = () => {
	const navigate = useNavigate();
	const { platform } = useParams();
	const [allGames, setAllGames] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedGenres, setSelectedGenres] = useState([]);
	const [selectedPlatforms, setSelectedPlatforms] = useState([]);
	const [priceRange, setPriceRange] = useState({ min: 0, max: 100 });
	const [currentPage, setCurrentPage] = useState(1);
	const [selectedGame, setSelectedGame] = useState(null);
	const gamesPerPage = 20;

	const displayGame = selectedGame;

	// Initialize platform selection from URL parameter
	useEffect(() => {
		const normalized = normalizePlatformId(platform);
		if (normalized && ['steam', 'itchio', 'gog'].includes(normalized)) {
			setSelectedPlatforms([normalized]);
		} else {
			setSelectedPlatforms([]);
		}
	}, [platform]);

	const genres = useMemo(() => {
		const names = new Set();
		for (const game of allGames) {
			for (const g of Array.isArray(game.genres) ? game.genres : []) {
				if (typeof g === 'string' && g.trim()) names.add(g.trim());
				if (g && typeof g === 'object') {
					const v = g.genre || g.name || g.description;
					if (typeof v === 'string' && v.trim()) names.add(v.trim());
				}
			}
		}
		return Array.from(names).sort((a, b) => a.localeCompare(b)).map((name, idx) => ({ id: idx + 1, name }));
	}, [allGames]);

	const platforms = useMemo(() => {
		const names = new Set();
		for (const game of allGames) {
			const p = normalizePlatformId(game.platform || game.platform_name);
			if (p) names.add(p);
		}
		return Array.from(names).sort((a, b) => a.localeCompare(b)).map((id) => ({
			id,
			name: id === 'itchio' ? 'Itch.io' : id.charAt(0).toUpperCase() + id.slice(1),
		}));
	}, [allGames]);

	useEffect(() => {
		let cancelled = false;
		const fetchGames = async () => {
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
				const featuredSpecials = featuredResult.status === 'fulfilled' ? pickSpecialsArray(featuredResult.value) : [];
				const discountedSpecials = discountedResult.status === 'fulfilled' ? pickSpecialsArray(discountedResult.value) : [];
				const upcomingSpecials = upcomingResult.status === 'fulfilled' ? pickSpecialsArray(upcomingResult.value) : [];

				const normalized = (gamesData || []).map((game) => ({
					id: game.id,
					app_id: game.app_id,
					appid: game.app_id,
					title: game.name,
					name: game.name,
					image: game.banner_img || steamPoster(game.app_id || game.id),
					banner_img: game.banner_img,
					price: Number(game.cost) || 0,
					cost: Number(game.cost) || 0,
					description: game.description || '',
					platform: normalizePlatformId(game.platform_name || game.platform || 'steam') || 'steam',
					genres: Array.isArray(game.genres) ? game.genres : [],
					tags: Array.isArray(game.tags) ? game.tags : [],
					discountPercent: parseDiscountPercent(game),
				}));

				const prioritized = [...normalized].sort((a, b) => {
					const aId = Number(a?.app_id ?? a?.appid ?? a?.id);
					const bId = Number(b?.app_id ?? b?.appid ?? b?.id);
					if (aId === 500 && bId !== 500) return -1;
					if (bId === 500 && aId !== 500) return 1;
					return 0;
				});

				let featuredIds = featuredSpecials.map(extractGameId).filter(Boolean);
				let discountedIds = discountedSpecials.map(extractGameId).filter(Boolean);
				let upcomingIds = upcomingSpecials.map(extractGameId).filter(Boolean);

				if (!featuredIds.length) {
					featuredIds = prioritized.slice(0, 5).map(extractGameId).filter(Boolean);
				}
				if (!discountedIds.length) {
					discountedIds = prioritized
						.filter((game) => Number(game.discountPercent) > 0)
						.slice(0, 12)
						.map(extractGameId)
						.filter(Boolean);
				}
				if (!discountedIds.length) {
					discountedIds = prioritized.slice(5, 10).map(extractGameId).filter(Boolean);
				}
				if (!upcomingIds.length) {
					upcomingIds = prioritized.slice(10, 15).map(extractGameId).filter(Boolean);
				}

				const excludedIds = new Set([...featuredIds, ...discountedIds, ...upcomingIds]);
				const withoutCarouselGames = prioritized.filter((game) => {
					const id = extractGameId(game);
					if (!id) return true;
					return !excludedIds.has(id);
				});

				if (!cancelled) setAllGames(withoutCarouselGames);
			} catch (err) {
				console.error('Failed to load all games page data:', err);
				if (!cancelled) setAllGames([]);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		};
		fetchGames();
		return () => {
			cancelled = true;
		};
	}, []);

	// Filter games based on current filters
	const filteredGames = useMemo(() => {
		return allGames.filter(game => {
			// Search filter
			if (searchQuery && !(game.title || game.name || '').toLowerCase().includes(searchQuery.toLowerCase())) {
				return false;
			}

			// Genre filter
			if (selectedGenres.length > 0) {
				const gameGenres = Array.isArray(game.genres) ? game.genres : [];
				const hasMatchingGenre = selectedGenres.some(genreId => 
					gameGenres.includes(genreId) || 
					gameGenres.some(g => typeof g === 'object' && g.id === genreId)
				);
				if (!hasMatchingGenre) return false;
			}

			// Platform filter
			if (selectedPlatforms.length > 0 && !selectedPlatforms.includes(normalizePlatformId(game.platform))) {
				return false;
			}

			// Price filter
			const price = game.price ?? 0;
			if (price < priceRange.min || price > priceRange.max) {
				return false;
			}

			return true;
		});
	}, [allGames, searchQuery, selectedGenres, selectedPlatforms, priceRange]);

	// Pagination calculations
	const totalPages = Math.ceil(filteredGames.length / gamesPerPage);
	const startIndex = (currentPage - 1) * gamesPerPage;
	const endIndex = startIndex + gamesPerPage;
	const currentGames = filteredGames.slice(startIndex, endIndex);

	const handleGameClick = (game) => {
		setSelectedGame(game);
	};

	const toStoreGameUrl = (game) => {
		const gameId = game?.appid || game?.app_id || game?.id;
		if (!gameId) return '';
		const platformId = normalizePlatformId(game?.platform_name || game?.platform) || 'steam';
		return `/store/game/${encodeURIComponent(platformId)}/${encodeURIComponent(gameId)}`;
	};

	const handleResetFilters = () => {
		setSearchQuery('');
		setSelectedGenres([]);
		const normalized = normalizePlatformId(platform);
		setSelectedPlatforms(normalized ? [normalized] : []);
		setPriceRange({ min: 0, max: 100 });
		setCurrentPage(1);
	};

	useEffect(() => {
		if (!currentGames.length) {
			setSelectedGame(null);
			return;
		}
		const selectedId = selectedGame?.appid || selectedGame?.app_id || selectedGame?.id;
		const existsOnPage = currentGames.some((game) => (game.appid || game.app_id || game.id) === selectedId);
		if (!existsOnPage) {
			setSelectedGame(currentGames[0]);
		}
	}, [currentGames, selectedGame]);

	const handlePageChange = (page) => {
		setCurrentPage(page);
		window.scrollTo({ top: 0, behavior: 'auto' });
	};

	return (
		<div className="flex-1 px-3 py-4">
			{/* Header */}
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-slate-100">All Games</h1>
					<p className="text-sm text-slate-400 mt-1">
						{filteredGames.length} games found
						{totalPages > 1 && ` • Page ${currentPage} of ${totalPages}`}
					</p>
				</div>
				<button
					onClick={() => navigate(-1)}
					className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg text-slate-200 transition-all text-sm"
				>
					← Back
				</button>
			</div>

			{/* Main content */}
			<div className="flex gap-4">
			{/* Left side - Games list */}
			<div className={`${displayGame ? 'w-[50%]' : 'flex-1'} bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden flex flex-col transition-all duration-500 ease-in-out`}>
				{/* Games list */}
				{currentGames.length > 0 ? (
					<div className="flex-1 overflow-y-auto scrollbar-thin">
						{currentGames.map((game) => {
							const gameId = game.appid || game.app_id || game.id;
							const isSelected = displayGame && (displayGame.appid || displayGame.app_id || displayGame.id) === gameId;
							
							return (
								<div
									key={gameId}
									className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all border-b border-slate-700/30 ${
										isSelected 
											? 'bg-slate-700/50' 
											: 'hover:bg-slate-700/30'
									}`}
									onClick={() => handleGameClick(game)}
								>
									{/* Game thumbnail */}
									<div className="w-20 h-11 flex-shrink-0 rounded overflow-hidden bg-slate-900/50">
										<img
											src={game.image || game.banner_img}
											alt={game.title || game.name}
											className="w-full h-full object-cover"
											onError={(e) => {
												e.target.style.display = 'none';
											}}
										/>
									</div>

									{/* Game info */}
									<div className="flex-1 min-w-0">
										<h4 className="text-sm font-medium text-slate-100 truncate mb-1">
											{game.title || game.name}
										</h4>
										
										{/* Tags/Genres */}
										<div className="flex flex-wrap gap-1">
											{game.tags && game.tags.slice(0, 3).map((tag, idx) => (
												<span
													key={idx}
													className="text-xs px-2 py-0.5 bg-slate-900/50 text-slate-400 rounded"
												>
													{tag}
												</span>
											))}
										</div>
									</div>

									{/* Price section */}
									<div className="flex items-center gap-2 flex-shrink-0">
										{game.discount && game.discount > 0 && (
											<div className="px-2 py-1 bg-green-600 text-white text-xs font-bold rounded">
												-{game.discount}%
											</div>
										)}
										<div className="text-right">
											{game.originalPrice && game.discount && (
												<div className="text-xs text-slate-500 line-through">
													{game.originalPrice}€
												</div>
											)}
											<div className={`text-sm font-semibold ${
												game.price === 0 
													? 'text-green-400' 
													: game.discount 
														? 'text-green-400' 
														: 'text-slate-100'
											}`}>
												{game.price === 0 ? 'Free' : `${game.price}€`}
											</div>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="flex-1 flex items-center justify-center text-slate-500 p-4">
						<div className="text-center">
							<p className="text-lg text-slate-400 mb-2">No games found</p>
							<p className="text-sm text-slate-500">Try adjusting your filters</p>
						</div>
					</div>
				)}

				{/* Pagination */}
				{totalPages > 1 && (
					<div className="flex items-center justify-center gap-2 py-4 border-t border-slate-700/50 bg-slate-800/60">
						<button
							onClick={() => handlePageChange(currentPage - 1)}
							disabled={currentPage === 1}
							className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							Previous
						</button>

						<div className="flex gap-2 max-w-[60vw] overflow-x-auto scrollbar-thin px-1">
							{Array.from({ length: totalPages }, (_, i) => i + 1)
								.map((page) => (
									<button
										key={page}
										onClick={() => handlePageChange(page)}
										className={`min-w-10 px-3 py-2 rounded-lg border text-sm ${
											page === currentPage
												? 'border-blue-500 bg-blue-600 text-white'
												: 'border-slate-700/50 bg-slate-800/50 text-slate-200 hover:bg-slate-700/50'
										}`}
									>
										{page}
									</button>
								))}
						</div>

						<button
							onClick={() => handlePageChange(currentPage + 1)}
							disabled={currentPage === totalPages}
							className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
					>
						Next
					</button>
				</div>
			)}
		</div>

			{/* Middle - Game preview (collapsible) */}
			{displayGame && (
			<div 
				className="w-[30%] bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden flex flex-col"
			>
				<>
					{/* Header */}
						<div className="px-3 py-2 border-b border-slate-700/50">
							<h3 className="text-sm font-semibold text-slate-100 truncate">
								{displayGame.title || displayGame.name}
							</h3>
						</div>

						{/* Preview content */}
						<div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
						{/* Game image - smaller size */}
						<div className="w-full aspect-[16/9] rounded overflow-hidden bg-slate-900/50 mb-3">
								<img
									src={displayGame.image || displayGame.banner_img}
									alt={displayGame.title || displayGame.name}
									className="w-full h-full object-cover"
									onError={(e) => {
										e.target.style.display = 'none';
									}}
								/>
							</div>

							{/* Description */}
							{displayGame.description && (
								<p className="text-xs text-slate-300 leading-relaxed mb-3">
									{displayGame.description}
								</p>
							)}

							<button
								onClick={() => {
									const target = toStoreGameUrl(displayGame);
									if (!target) return;
									navigate(target, { state: { game: displayGame } });
								}}
								className="w-full rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold py-2 transition-colors mb-3"
							>
								Open Game Page
							</button>

							{/* Tags (max 5) */}
							<div className="flex flex-wrap gap-1">
								{displayGame.tags && displayGame.tags.slice(0, 5).map((tag, idx) => (
									<span
										key={idx}
										className="text-xs px-2 py-1 bg-slate-700/50 text-slate-300 rounded"
									>
										{tag}
									</span>
								))}
							</div>
						</div>
					</>
			</div>
			)}
			{/* Right side - Compact filters sidebar */}
			<CompactFiltersSidebar				searchQuery={searchQuery}
				onSearchChange={(value) => {
					setSearchQuery(value);
					setCurrentPage(1);
				}}
				selectedGenres={selectedGenres}
				onGenresChange={(genres) => {
					setSelectedGenres(genres);
					setCurrentPage(1);
				}}
				selectedPlatforms={selectedPlatforms}
				onPlatformsChange={(platforms) => {
					setSelectedPlatforms(platforms);
					setCurrentPage(1);
				}}
				priceRange={priceRange}
				onPriceChange={(range) => {
					setPriceRange(range);
					setCurrentPage(1);
				}}
				onReset={handleResetFilters}
			/>
		</div>
	</div>
	);
};

export default AllGamesPage;
