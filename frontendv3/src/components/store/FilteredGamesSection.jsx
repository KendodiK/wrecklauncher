import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CompactFiltersSidebar from './CompactFiltersSidebar.jsx';

function normalizePlatformId(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (!normalized) return '';
	if (normalized === 'itch' || normalized === 'itchio' || normalized === 'itch.io') return 'itchio';
	if (normalized === 'epic games' || normalized === 'epic_games') return '';
	return normalized;
}

/**
 * Filtered games section with list on left and compact filters on right
 */
const FilteredGamesSection = ({
	games = [],
	title = "Browse Games",
	onRequestNextPage,
	canLoadMore = false,
	isLoadingMore = false,
}) => {
	const navigate = useNavigate();
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedGenres, setSelectedGenres] = useState([]);
	const [selectedPlatforms, setSelectedPlatforms] = useState([]);
	const [priceRange, setPriceRange] = useState({ min: 0, max: 100 });
	const [selectedGame, setSelectedGame] = useState(null);
	const [currentPage, setCurrentPage] = useState(1);
	const gamesPerPage = 20;

	const genres = useMemo(() => {
		const names = new Set();
		for (const game of games) {
			for (const g of Array.isArray(game.genres) ? game.genres : []) {
				if (typeof g === 'string' && g.trim()) names.add(g.trim());
				if (g && typeof g === 'object') {
					const v = g.genre || g.name || g.description;
					if (typeof v === 'string' && v.trim()) names.add(v.trim());
				}
			}
		}
		return Array.from(names).sort((a, b) => a.localeCompare(b)).map((name, idx) => ({ id: idx + 1, name }));
	}, [games]);

	const platforms = useMemo(() => {
		const names = new Set();
		for (const game of games) {
			const p = game.platform || game.platform_name;
			if (typeof p === 'string' && p.trim()) names.add(p.trim().toLowerCase());
		}
		return Array.from(names).sort((a, b) => a.localeCompare(b)).map((id) => ({
			id,
			name: id.charAt(0).toUpperCase() + id.slice(1),
		}));
	}, [games]);

	// Filter games based on current filters
	const filteredGames = useMemo(() => {
		return games.filter(game => {
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
			const gamePlatform = normalizePlatformId(game.platform || game.platform_name);
			if (selectedPlatforms.length > 0 && !selectedPlatforms.includes(gamePlatform)) {
				return false;
			}

			// Price filter
			const price = game.price ?? 0;
			if (price < priceRange.min || price > priceRange.max) {
				return false;
			}

			return true;
		});
	}, [games, searchQuery, selectedGenres, selectedPlatforms, priceRange]);

	const totalPages = Math.max(1, Math.ceil(filteredGames.length / gamesPerPage));
	const showPagination = filteredGames.length > gamesPerPage || canLoadMore || currentPage > 1;
	const pageCountLabel = canLoadMore ? `${totalPages}+` : String(totalPages);
	const pagedGames = useMemo(() => {
		const start = (currentPage - 1) * gamesPerPage;
		return filteredGames.slice(start, start + gamesPerPage);
	}, [filteredGames, currentPage]);

	const displayGame = selectedGame || pagedGames[0] || null;

	useEffect(() => {
		setCurrentPage(1);
	}, [searchQuery, selectedGenres, selectedPlatforms, priceRange]);

	useEffect(() => {
		if (currentPage > totalPages) {
			setCurrentPage(totalPages);
		}
	}, [currentPage, totalPages]);

	useEffect(() => {
		if (!pagedGames.length) {
			setSelectedGame(null);
			return;
		}

		const selectedId = selectedGame?.appid || selectedGame?.app_id || selectedGame?.id;
		const hasSelectedInPage = pagedGames.some((game) => (game.appid || game.app_id || game.id) === selectedId);
		if (!hasSelectedInPage) {
			setSelectedGame(pagedGames[0]);
		}
	}, [pagedGames, selectedGame]);

	const handleGameClick = (game) => {
		setSelectedGame(game);
	};

	const toStoreGameUrl = (game) => {
		const gameId = game?.appid || game?.app_id || game?.id;
		if (!gameId) return '';
		const platform = normalizePlatformId(game?.platform_name || game?.platform) || 'steam';
		return `/store/game/${encodeURIComponent(platform)}/${encodeURIComponent(gameId)}`;
	};

	const handleResetFilters = () => {
		setSearchQuery('');
		setSelectedGenres([]);
		setSelectedPlatforms([]);
		setPriceRange({ min: 0, max: 100 });
		setCurrentPage(1);
	};

	const handleNextPage = async () => {
		if (currentPage < totalPages) {
			setCurrentPage((p) => Math.min(totalPages, p + 1));
			return;
		}

		if (canLoadMore && typeof onRequestNextPage === 'function') {
			const loaded = await onRequestNextPage();
			if (loaded) {
				setCurrentPage((p) => p + 1);
			}
		}
	};

	return (
		<div className="w-full flex gap-4">
			{/* Left side - Game list */}
			<div className="w-[50%] bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden flex flex-col">
				{/* Header */}
				<div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
					<div>
						<h3 className="text-lg font-semibold text-slate-100">{title}</h3>
						<p className="text-sm text-slate-400 mt-0.5">{filteredGames.length} games found</p>
					</div>
					<button 
						onClick={() => navigate('/shop/all-games')}
						className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-3 py-2 rounded hover:bg-slate-700/50"
					>
						See all
					</button>
				</div>

				{/* Games list */}
				<div className="flex-1 overflow-y-auto scrollbar-thin">
					{filteredGames.length > 0 ? (
						pagedGames.map((game) => {
							const gameId = game.appid || game.app_id || game.id;
							const isSelected = displayGame && (displayGame.appid || displayGame.app_id || displayGame.id) === gameId;
							
							return (
								<div
									key={gameId}
									className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-slate-700/30 ${
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
						})
					) : (
						<div className="flex-1 flex items-center justify-center text-slate-500 p-4">
							<p className="text-sm">No games match your filters</p>
						</div>
					)}
				</div>

				{showPagination && (
					<div className="px-3 py-2 border-t border-slate-700/50 bg-slate-800/60 flex items-center justify-between">
						<button
							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
							disabled={currentPage === 1}
							className="px-3 py-1 text-xs rounded bg-slate-800/50 border border-slate-700/50 text-slate-200 disabled:opacity-40"
						>
							Prev
						</button>
						<div className="text-xs text-slate-300">Page {currentPage} / {pageCountLabel}</div>
						<button
							onClick={handleNextPage}
							disabled={isLoadingMore || (currentPage === totalPages && !canLoadMore)}
							className="px-3 py-1 text-xs rounded bg-slate-800/50 border border-slate-700/50 text-slate-200 disabled:opacity-40"
						>
							{isLoadingMore ? 'Loading...' : 'Next'}
						</button>
					</div>
				)}
			</div>

			{/* Middle - Game preview (fixed) */}
			<div className="w-[30%] bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden flex flex-col">
				{displayGame ? (
					<>
						<div className="px-3 py-2 border-b border-slate-700/50">
							<h3 className="text-sm font-semibold text-slate-100 truncate">
								{displayGame.title || displayGame.name}
							</h3>
						</div>

						<div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
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

							<p className="text-xs text-slate-300 leading-relaxed mb-3">
								{displayGame.description || 'No description available from database.'}
							</p>

							<button
								onClick={() => {
									const target = toStoreGameUrl(displayGame);
									if (!target) return;
									navigate(target, { state: { game: displayGame } });
								}}
								className="w-full rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold py-2 transition-colors"
							>
								Open Game Page
							</button>
						</div>
					</>
				) : (
					<div className="flex-1 flex items-center justify-center text-slate-500 p-4 text-sm">
						No games available for preview
					</div>
				)}
			</div>
			{/* Right side - Compact filters sidebar */}
			<CompactFiltersSidebar				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
				selectedGenres={selectedGenres}
				onGenresChange={setSelectedGenres}
				selectedPlatforms={selectedPlatforms}
				onPlatformsChange={setSelectedPlatforms}
				priceRange={priceRange}
				onPriceChange={setPriceRange}
				onReset={handleResetFilters}
			/>
		</div>
	);
};

export default FilteredGamesSection;
