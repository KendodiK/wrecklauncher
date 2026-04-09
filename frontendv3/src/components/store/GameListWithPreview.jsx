import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Steam-style game list with preview panel
 * Shows games in a list on the left with details/media on the right
 */
const GameListWithPreview = ({ games = [], title = "Top Sellers" }) => {
	const [selectedGame, setSelectedGame] = useState(games[0] || null);
	const [hoveredGame, setHoveredGame] = useState(null);
	const navigate = useNavigate();

	const displayGame = hoveredGame || selectedGame;

	const normalizePlatform = (value) => {
		const numericValue = Number(value);
		if (Number.isFinite(numericValue)) {
			if (numericValue === 1) return 'steam';
			if (numericValue === 2) return 'gog';
			if (numericValue === 3) return 'itchio';
			if (numericValue === 4) return 'epic';
		}

		const normalized = String(value || '').trim().toLowerCase();
		if (!normalized) return 'steam';
		if (normalized === 'itch' || normalized === 'itch.io' || normalized === 'itchio') return 'itchio';
		if (normalized === 'epic games' || normalized === 'epic_games') return 'steam';
		return normalized;
	};

	const launcherOutlineClass = (game) => {
		const launcherId = normalizePlatform(game?.platform_name || game?.platform || game?.platform_id || game?.platformId || game?.launcherId || 'steam') || 'steam';
		if (launcherId === 'steam') return 'border-sky-500/70';
		if (launcherId === 'gog') return 'border-violet-500/70';
		if (launcherId === 'itchio') return 'border-rose-500/70';
		if (launcherId === 'epic') return 'border-blue-500/70';
		return 'border-slate-600/70';
	};

	const hasDiscountFlag = (game) => Number(game?.discountPercent ?? game?.discount ?? 0) > 0 || (Array.isArray(game?.tags) && game.tags.some((tag) => String(tag).toLowerCase() === 'discount'));
	const hasUpcomingFlag = (game) => Array.isArray(game?.tags) && game.tags.some((tag) => String(tag).toLowerCase() === 'upcoming');

	const handleGameClick = (game) => {
		if (game.appid || game.app_id || game.id) {
			const gameId = game.appid || game.app_id || game.id;
			const platform = normalizePlatform(game.platform_name || game.platform || game.platform_id || game.platformId);
			navigate(`/store/game/${encodeURIComponent(platform)}/${encodeURIComponent(gameId)}`, { state: { game } });
		}
	};

	return (
		<div className="w-full bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden">
			<div className="flex h-[1000px]">
				{/* Left side - Game list */}
				<div className="w-[80%] border-r border-slate-700/50 flex flex-col">
					{/* Header */}
					<div className="px-3 py-2 border-b border-slate-700/50">
						<h3 className="text-base font-semibold text-slate-100">{title}</h3>
					</div>

					{/* Games list */}
					<div className="flex-1 overflow-y-auto scrollbar-thin">
						{games.slice(0, 15).map((game) => {
							const gameId = game.appid || game.app_id || game.id;
							const isSelected = displayGame && (displayGame.appid || displayGame.app_id || displayGame.id) === gameId;
							const stripeClass = hasDiscountFlag(game) ? 'bg-emerald-400' : (hasUpcomingFlag(game) ? 'bg-yellow-400' : '');
							
							return (
								<div
									key={gameId}
										className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all border-b border-slate-700/30 ${
											isSelected 
												? 'bg-slate-700/50' 
												: 'hover:bg-slate-700/30'
										}`}
										onClick={() => handleGameClick(game)}
										onMouseEnter={() => setHoveredGame(game)}
										onMouseLeave={() => setHoveredGame(null)}
									>
										{/* Game thumbnail */}
								<div className={`relative w-20 h-11 flex-shrink-0 rounded overflow-hidden border ${launcherOutlineClass(game)} bg-slate-900/50`}>
										<img
											src={game.image || game.banner_img}
											alt={game.title || game.name}
											className="w-full h-full object-cover"
											onError={(e) => {
												e.target.style.display = 'none';
											}}
										/>
										{stripeClass ? <div className={`absolute right-1 bottom-1 h-1 w-5 rounded-sm ${stripeClass}`} /> : null}
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
												{game.genres && Array.isArray(game.genres) && game.genres.slice(0, 3).map((genre, idx) => (
													<span
														key={idx}
														className="text-xs px-2 py-0.5 bg-slate-900/50 text-slate-400 rounded"
												>
													{typeof genre === 'object' ? genre.name : genre}
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
				</div>

				{/* Right side - Preview panel */}
				<div className="w-[20%] bg-slate-800/60 flex flex-col">
					{displayGame ? (
						<>
							{/* Header with title */}
							<div className="px-3 py-2 border-b border-slate-700/50">
								<h3 className="text-sm font-semibold text-slate-100 truncate">
									{displayGame.title || displayGame.name}
								</h3>
								<div className="flex items-center gap-2 mt-0.5">
									<span className="text-[10px] text-slate-400">Overall User Reviews</span>
								</div>
							</div>

							{/* Media gallery */}
							<div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
								<div className="space-y-2">
								{/* Main image - hero aspect ratio */}
								<div className="w-full aspect-[4/3] rounded overflow-hidden bg-slate-900/50">
										<img
											src={displayGame.image || displayGame.banner_img}
											alt={displayGame.title || displayGame.name}
											className="w-full h-full object-cover"
											onError={(e) => {
												e.target.style.display = 'none';
											}}
										/>
									</div>

									{/* Additional screenshots (mock) - square aspect ratio */}
									{displayGame.screenshots && displayGame.screenshots.slice(0, 2).map((screenshot, idx) => (
										<div key={idx} className="w-full aspect-square rounded overflow-hidden bg-slate-900/50">
											<img
												src={screenshot}
												alt={`Screenshot ${idx + 1}`}
												className="w-full h-full object-cover"
											/>
										</div>
									))}

									{/* Description if available */}
									{displayGame.description && (
										<p className="text-[11px] text-slate-300 mt-2 leading-relaxed">
											{displayGame.description}
										</p>
									)}
								</div>
							</div>

							{/* Tags/Genres footer */}
							<div className="px-2 py-2 border-t border-slate-700/50">
								<div className="flex flex-wrap gap-1">
									{displayGame.tags && displayGame.tags.slice(0, 6).map((tag, idx) => (
										<span
											key={idx}
											className="text-[10px] px-2 py-1 bg-slate-700/50 text-slate-300 rounded hover:bg-slate-600/50 transition-colors cursor-pointer"
										>
											{tag}
										</span>
									))}
									{displayGame.genres && Array.isArray(displayGame.genres) && displayGame.genres.slice(0, 6).map((genre, idx) => (
										<span
											key={idx}
											className="text-[10px] px-2 py-1 bg-slate-700/50 text-slate-300 rounded hover:bg-slate-600/50 transition-colors cursor-pointer"
										>
											{typeof genre === 'object' ? genre.name : genre}
										</span>
									))}
								</div>
							</div>
						</>
					) : (
						<div className="flex-1 flex items-center justify-center text-slate-500">
							<p>Select a game to see details</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default GameListWithPreview;
