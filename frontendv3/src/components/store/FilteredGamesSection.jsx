import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CompactFiltersSidebar from './CompactFiltersSidebar.jsx';

/**
 * Filtered games section with list on left and compact filters on right
 */
const FilteredGamesSection = ({ games = [], title = "Browse Games" }) => {
	const navigate = useNavigate();
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedGenres, setSelectedGenres] = useState([]);
	const [selectedPlatforms, setSelectedPlatforms] = useState([]);
	const [priceRange, setPriceRange] = useState({ min: 0, max: 100 });
	const [selectedGame, setSelectedGame] = useState(null);
	const [hoveredGame, setHoveredGame] = useState(null);
	const [currentPage, setCurrentPage] = useState(1);
	const hideTimeoutRef = useRef(null);
	const gamesPerPage = 20;

	const displayGame = hoveredGame || selectedGame;
	const [previewScreenshots, setPreviewScreenshots] = useState([]);
	const [previewMovie, setPreviewMovie] = useState('');
	const [previewLoading, setPreviewLoading] = useState(false);
	const [previewMediaError, setPreviewMediaError] = useState('');

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (hideTimeoutRef.current) {
				clearTimeout(hideTimeoutRef.current);
			}
		};
	}, []);

	// Load Steam media (screenshots + movie) for the preview panel.
	useEffect(() => {
		let cancelled = false;

		const loadPreviewMedia = async () => {
			if (!displayGame) {
				setPreviewScreenshots([]);
				setPreviewMovie('');
				setPreviewMediaError('');
				setPreviewLoading(false);
				return;
			}

			const appId = Number(displayGame.appid || displayGame.app_id || displayGame.id);
			if (!Number.isFinite(appId) || appId <= 0) {
				setPreviewScreenshots([]);
				setPreviewMovie('');
				setPreviewMediaError('Invalid app id for Steam media');
				setPreviewLoading(false);
				return;
			}

			const api = typeof window !== 'undefined' ? window.electronAPI : null;
			if (!api || typeof api.getSteamGameDetails !== 'function') {
				setPreviewScreenshots([]);
				setPreviewMovie('');
				setPreviewMediaError('Steam API bridge not available');
				setPreviewLoading(false);
				return;
			}

			setPreviewLoading(true);
			setPreviewMediaError('');
			try {
				const details = await api.getSteamGameDetails(appId, 'us');
				const raw = details && typeof details === 'object' && details.raw && typeof details.raw === 'object' ? details.raw : {};

				const screenshots = Array.isArray(raw.screenshots)
					? raw.screenshots
							.map((s) => (s && typeof s === 'object' ? (s.path_full || s.path_thumbnail) : null))
							.filter((url) => typeof url === 'string' && url.trim())
					: [];

				let movie = '';
				if (Array.isArray(raw.movies) && raw.movies.length) {
					for (const m of raw.movies) {
						if (!m || typeof m !== 'object') continue;
						const mp4 = m.mp4 && typeof m.mp4 === 'object' ? m.mp4 : null;
						const webm = m.webm && typeof m.webm === 'object' ? m.webm : null;
						const candidate =
							(mp4 && (mp4.max || mp4['480'])) ||
							(webm && (webm.max || webm['480'])) ||
							'';
						if (typeof candidate === 'string' && candidate.trim()) {
							movie = candidate;
							break;
						}
					}
				}

				console.log('[ShopPreview] Steam media', {
					appId,
					screenshots: screenshots.length,
					movies: Array.isArray(raw.movies) ? raw.movies.length : 0,
					movieUrlFound: Boolean(movie),
				});

				if (!cancelled) {
					setPreviewScreenshots(screenshots);
					setPreviewMovie(typeof movie === 'string' ? movie : '');
					if (!movie) {
						setPreviewMediaError('No playable movie URL found in Steam response');
					}
				}
			} catch (err) {
				console.error('[ShopPreview] Failed to load Steam media:', err);
				if (!cancelled) {
					setPreviewScreenshots([]);
					setPreviewMovie('');
					setPreviewMediaError(err instanceof Error ? err.message : 'Failed to load Steam media');
				}
			} finally {
				if (!cancelled) setPreviewLoading(false);
			}
		};

		loadPreviewMedia();

		return () => {
			cancelled = true;
		};
	}, [displayGame]);

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
			if (selectedPlatforms.length > 0 && !selectedPlatforms.includes(game.platform)) {
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
	const pagedGames = useMemo(() => {
		const start = (currentPage - 1) * gamesPerPage;
		return filteredGames.slice(start, start + gamesPerPage);
	}, [filteredGames, currentPage]);

	useEffect(() => {
		setCurrentPage(1);
	}, [searchQuery, selectedGenres, selectedPlatforms, priceRange]);

	useEffect(() => {
		if (currentPage > totalPages) {
			setCurrentPage(totalPages);
		}
	}, [currentPage, totalPages]);

	const handleGameClick = (game) => {
		if (game.appid || game.app_id || game.id) {
			const gameId = game.appid || game.app_id || game.id;
			navigate(`/store/game/${gameId}`, { state: { game } });
		}
	};

	const handleGenreToggle = (genreId) => {
		setSelectedGenres(prev => 
			prev.includes(genreId) 
				? prev.filter(id => id !== genreId)
				: [...prev, genreId]
		);
	};

	const handleResetFilters = () => {
		setSearchQuery('');
		setSelectedGenres([]);
		setSelectedPlatforms([]);
		setPriceRange({ min: 0, max: 100 });
		setCurrentPage(1);
	};

	return (
		<div className="w-full flex gap-4">
			{/* Left side - Game list */}
			<div className={`${displayGame ? 'w-[50%]' : 'flex-1'} bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden flex flex-col transition-all duration-500 ease-in-out`}>
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
						pagedGames.map((game, index) => {
							const gameId = game.appid || game.app_id || game.id;
							const isSelected = displayGame && (displayGame.appid || displayGame.app_id || displayGame.id) === gameId;
							
							return (
								<div
									key={gameId}
									className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all duration-300 border-b border-slate-700/30 animate-in fade-in slide-in-from-left-2 animate-stagger-fast ${
										isSelected 
											? 'bg-slate-700/50' 
											: 'hover:bg-slate-700/30'
									}`}
									style={{
										animationDelay: `${index * 25}ms`
									}}
									onClick={() => handleGameClick(game)}
								onMouseEnter={() => {
									if (hideTimeoutRef.current) {
										clearTimeout(hideTimeoutRef.current);
										hideTimeoutRef.current = null;
									}
									setHoveredGame(game);
								}}
								onMouseLeave={() => {
									hideTimeoutRef.current = setTimeout(() => {
										setHoveredGame(null);
									}, 150);
								}}
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
						<div className="flex-1 flex items-center justify-center text-slate-500 p-4 animate-in fade-in duration-500">
							<p className="text-sm">No games match your filters</p>
						</div>
					)}
				</div>

				{filteredGames.length > gamesPerPage && (
					<div className="px-3 py-2 border-t border-slate-700/50 bg-slate-800/60 flex items-center justify-between">
						<button
							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
							disabled={currentPage === 1}
							className="px-3 py-1 text-xs rounded bg-slate-800/50 border border-slate-700/50 text-slate-200 disabled:opacity-40"
						>
							Prev
						</button>
						<div className="text-xs text-slate-300">Page {currentPage} / {totalPages}</div>
						<button
							onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
							disabled={currentPage === totalPages}
							className="px-3 py-1 text-xs rounded bg-slate-800/50 border border-slate-700/50 text-slate-200 disabled:opacity-40"
						>
							Next
						</button>
					</div>
				)}
			</div>

			{/* Middle - Game preview (collapsible) */}
			{displayGame && (
			<div 
				className="w-[30%] bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden flex flex-col transition-all duration-500 ease-in-out animate-in slide-in-from-right"
				onMouseEnter={() => {
					if (hideTimeoutRef.current) {
						clearTimeout(hideTimeoutRef.current);
						hideTimeoutRef.current = null;
					}
				}}
				onMouseLeave={() => {
					hideTimeoutRef.current = setTimeout(() => {
						setHoveredGame(null);
					}, 150);
				}}
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
							{/* Main image back on top */}
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

							{/* Steam screenshots (replaces single static image) */}
							<div className="mb-3">
								<div className="text-xs text-slate-400 mb-2">Screenshots</div>
								{previewLoading ? (
									<div className="w-full h-24 rounded bg-slate-900/50 animate-pulse" />
								) : previewScreenshots.length > 0 ? (
									<div className="grid grid-cols-2 gap-2">
										{previewScreenshots.slice(0, 4).map((src, idx) => (
											<div key={`${src}-${idx}`} className="aspect-video rounded overflow-hidden bg-slate-900/50">
												<img
													src={src}
													alt={`${displayGame.title || displayGame.name} screenshot ${idx + 1}`}
													className="w-full h-full object-cover"
													loading="lazy"
												/>
											</div>
										))}
									</div>
								) : (
									<div className="w-full h-24 rounded bg-slate-900/50 flex items-center justify-center text-xs text-slate-500">
										No screenshots available
									</div>
								)}
							</div>

							{/* Steam movie after screenshots */}
							<div className="mb-3">
								<div className="text-xs text-slate-400 mb-2">Trailer</div>
								{previewMovie ? (
									<div className="w-full aspect-video rounded overflow-hidden bg-slate-900/50">
										<video
											src={previewMovie}
											controls
											preload="none"
												playsInline
											className="w-full h-full object-cover"
										/>
									</div>
								) : (
										<div className="w-full h-16 rounded bg-slate-900/50 flex items-center justify-center text-xs text-slate-500 text-center px-2">
											{previewMediaError || 'No movie available'}
									</div>
								)}
							</div>

							{/* Description */}
							{displayGame.description && (
								<p className="text-xs text-slate-300 leading-relaxed mb-3">
									{displayGame.description}
								</p>
							)}

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
