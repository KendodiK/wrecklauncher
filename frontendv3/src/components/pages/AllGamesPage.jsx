import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import CompactFiltersSidebar from '../store/CompactFiltersSidebar.jsx';

function steamPoster(appid) {
	const id = Number(appid);
	if (!Number.isFinite(id) || id <= 0) return null;
	return `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
}

// Mock all games data
const ALL_GAMES = [
	{ id: 570, appid: 570, title: 'Dota 2', image: steamPoster(570), price: 0, genres: [1, 4], tags: ['MOBA', 'Free to Play', 'Strategy', 'Multiplayer', 'Competitive'], description: 'Every day, millions of players worldwide enter battle as one of over a hundred Dota heroes. And no matter if it\'s their 10th hour of play or 1,000th, there\'s always something new to discover.' },
	{ id: 730, appid: 730, title: 'Counter-Strike 2', image: steamPoster(730), price: 0, genres: [1, 4], tags: ['FPS', 'Competitive', 'Shooter', 'Tactical', 'Multiplayer'], description: 'For over two decades, Counter-Strike has offered an elite competitive experience, one shaped by millions of players from across the globe. Now the next chapter in the CS story is about to begin.' },
	{ id: 440, appid: 440, title: 'Team Fortress 2', image: steamPoster(440), price: 0, genres: [1], tags: ['FPS', 'Free to Play', 'Multiplayer', 'Action', 'Comedy'], description: 'Nine distinct classes provide a broad range of tactical abilities and personalities. Constantly updated with new game modes, maps, equipment and, most importantly, hats!' },
	{ id: 271590, appid: 271590, title: 'Grand Theft Auto V', image: steamPoster(271590), price: 29.99, genres: [1, 2], tags: ['Open World', 'Action', 'Crime', 'Multiplayer', 'Adventure'], description: 'When a young street hustler, a retired bank robber and a terrifying psychopath land themselves in trouble, they must pull off a series of dangerous heists to survive in a city in which they can trust nobody, least of all each other.' },
	{ id: 578080, appid: 578080, title: 'PLAYERUNKNOWN\'S BATTLEGROUNDS', image: steamPoster(578080), price: 29.99, genres: [1, 6], tags: ['Battle Royale', 'Shooter', 'Survival', 'Multiplayer', 'FPS'], description: 'Land on strategic locations, loot weapons and supplies, and survive to become the last team standing across various battlegrounds.' },
	{ id: 1174180, appid: 1174180, title: 'Red Dead Redemption 2', image: steamPoster(1174180), price: 59.99, genres: [1, 2], tags: ['Western', 'Story Rich', 'Open World', 'Action', 'Adventure'], description: 'America, 1899. The end of the Wild West era has begun. After a robbery goes badly wrong, Arthur Morgan and the Van der Linde gang are forced to flee.' },
	{ id: 1245620, appid: 1245620, title: 'ELDEN RING', image: steamPoster(1245620), price: 59.99, genres: [3, 1], tags: ['Souls-like', 'Dark Fantasy', 'RPG', 'Open World', 'Difficult'], description: 'THE NEW FANTASY ACTION RPG. Rise, Tarnished, and be guided by grace to brandish the power of the Elden Ring and become an Elden Lord in the Lands Between.' },
	{ id: 359550, appid: 359550, title: "Tom Clancy's Rainbow Six Siege", image: steamPoster(359550), price: 19.99, genres: [1, 4], tags: ['Tactical', 'FPS', 'Shooter', 'Multiplayer', 'Strategy'], description: 'Master the art of destruction and gadgetry in Tom Clancy\'s Rainbow Six Siege. Face intense close quarters combat, high lethality, tactical decision making, team play, and explosive action.' },
	{ id: 1086940, appid: 1086940, title: "Baldur's Gate 3", image: steamPoster(1086940), price: 59.99, genres: [3, 2], tags: ['RPG', 'Turn-Based', 'D&D', 'Story Rich', 'Fantasy'], description: 'Gather your party and return to the Forgotten Realms in a tale of fellowship and betrayal, sacrifice and survival, and the lure of absolute power.' },
	{ id: 1237970, appid: 1237970, title: 'Titanfall 2', image: steamPoster(1237970), price: 29.99, genres: [1], tags: ['FPS', 'Mechs', 'Shooter', 'Action', 'Multiplayer'], description: 'Respawn Entertainment gives you the most advanced titan technology in its new, single player campaign alongside fast-paced multiplayer action.' },
	{ id: 292030, appid: 292030, title: 'The Witcher 3: Wild Hunt', image: steamPoster(292030), price: 39.99, genres: [3, 2], tags: ['RPG', 'Open World', 'Story Rich', 'Fantasy', 'Adventure'], description: 'As war rages on throughout the Northern Realms, you take on the greatest contract of your life — tracking down the Child of Prophecy, a living weapon that can alter the shape of the world.' },
	{ id: 489830, appid: 489830, title: 'The Elder Scrolls V: Skyrim', image: steamPoster(489830), price: 19.99, genres: [3, 2], tags: ['RPG', 'Dragons', 'Open World', 'Fantasy', 'Adventure'], description: 'Epic fantasy adventure across the land of Skyrim. The Empire of Tamriel is on the edge. The High King of Skyrim has been murdered. Alliances form as claims to the throne are made.' },
];

/**
 * Full page for browsing all games with pagination
 */
const AllGamesPage = () => {
	const navigate = useNavigate();
	const { platform } = useParams();
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedGenres, setSelectedGenres] = useState([]);
	const [selectedPlatforms, setSelectedPlatforms] = useState([]);
	const [priceRange, setPriceRange] = useState({ min: 0, max: 100 });
	const [currentPage, setCurrentPage] = useState(1);
	const [selectedGame, setSelectedGame] = useState(null);
	const [hoveredGame, setHoveredGame] = useState(null);
	const hideTimeoutRef = useRef(null);
	const gamesPerPage = 20;

	const displayGame = hoveredGame || selectedGame;

	// Initialize platform selection from URL parameter
	useEffect(() => {
		if (platform && ['steam', 'epic', 'gog'].includes(platform)) {
			setSelectedPlatforms([platform]);
		}
	}, [platform]);

	// Cleanup timeout on unmount
	useEffect(() => {
		return () => {
			if (hideTimeoutRef.current) {
				clearTimeout(hideTimeoutRef.current);
			}
		};
	}, []);

	// Mock genres
	const genres = [
		{ id: 1, name: 'Action' },
		{ id: 2, name: 'Adventure' },
		{ id: 3, name: 'RPG' },
		{ id: 4, name: 'Strategy' },
		{ id: 5, name: 'Simulation' },
		{ id: 6, name: 'Sports' },
		{ id: 7, name: 'Racing' },
		{ id: 8, name: 'Horror' },
	];

	// Mock platforms
	const platforms = [
		{ id: 'steam', name: 'Steam' },
		{ id: 'epic', name: 'Epic Games' },
		{ id: 'gog', name: 'GOG' },
	];

	// Filter games based on current filters
	const filteredGames = useMemo(() => {
		return ALL_GAMES.filter(game => {
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
	}, [searchQuery, selectedGenres, selectedPlatforms, priceRange]);

	// Pagination calculations
	const totalPages = Math.ceil(filteredGames.length / gamesPerPage);
	const startIndex = (currentPage - 1) * gamesPerPage;
	const endIndex = startIndex + gamesPerPage;
	const currentGames = filteredGames.slice(startIndex, endIndex);

	const handleGameClick = (game) => {
		if (game.appid || game.app_id || game.id) {
			const gameId = game.appid || game.app_id || game.id;
			navigate(`/game/${gameId}`);
		}
	};

	const handleResetFilters = () => {
		setSearchQuery('');
		setSelectedGenres([]);
		setSelectedPlatforms([]);
		setPriceRange({ min: 0, max: 100 });
		setCurrentPage(1);
	};

	const handlePageChange = (page) => {
		setCurrentPage(page);
		window.scrollTo({ top: 0, behavior: 'smooth' });
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
							className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 transition-all hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
						>
							Previous
						</button>

						<div className="flex gap-2">
							{Array.from({ length: totalPages }, (_, i) => i + 1)
								.filter(page => {
									// Show first page, last page, current page, and pages around current
									return (
										page === 1 ||
										page === totalPages ||
										Math.abs(page - currentPage) <= 1
									);
								})
								.map((page, idx, arr) => {
									// Add ellipsis if there's a gap
									const prevPage = arr[idx - 1];
									const showEllipsis = prevPage && page - prevPage > 1;

									return (
										<React.Fragment key={page}>
											{showEllipsis && (
												<span className="px-3 py-2 text-slate-500">...</span>
											)}
											<button
												onClick={() => handlePageChange(page)}
												className={`px-4 py-2 rounded-lg transition-all text-sm ${
													page === currentPage
														? 'bg-blue-600 text-white'
														: 'bg-slate-800/50 border border-slate-700/50 text-slate-200 hover:bg-slate-700/50'
												}`}
											>
												{page}
											</button>
										</React.Fragment>
									);
								})}
						</div>

						<button
							onClick={() => handlePageChange(currentPage + 1)}
							disabled={currentPage === totalPages}
							className="px-4 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-slate-200 transition-all hover:bg-slate-700/50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
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
