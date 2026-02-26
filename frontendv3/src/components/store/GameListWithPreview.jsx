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

	const handleGameClick = (game) => {
		if (game.appid || game.app_id || game.id) {
			const gameId = game.appid || game.app_id || game.id;
			navigate(`/game/${gameId}`);
		}
	};

	return (
		<div className="w-full bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden">
			<div className="flex h-[500px]">
				{/* Left side - Game list */}
				<div className="w-[55%] border-r border-slate-700/50 flex flex-col">
					{/* Header */}
					<div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
						<h3 className="text-lg font-semibold text-slate-100">{title}</h3>
						<button className="text-xs text-slate-400 hover:text-slate-200 transition-colors">
							See more
						</button>
					</div>

					{/* Games list */}
					<div className="flex-1 overflow-y-auto">
						{games.map((game) => {
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
									onMouseEnter={() => setHoveredGame(game)}
									onMouseLeave={() => setHoveredGame(null)}
								>
									{/* Game thumbnail */}
									<div className="w-24 h-14 flex-shrink-0 rounded overflow-hidden bg-slate-900/50">
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
										<div className="flex flex-wrap gap-1 mb-1">
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
				<div className="w-[45%] bg-slate-800/60 flex flex-col">
					{displayGame ? (
						<>
							{/* Header with title */}
							<div className="px-4 py-3 border-b border-slate-700/50">
								<h3 className="text-lg font-semibold text-slate-100">
									{displayGame.title || displayGame.name}
								</h3>
								<div className="flex items-center gap-2 mt-1">
									<span className="text-xs text-slate-400">Overall User Reviews</span>
								</div>
							</div>

							{/* Media gallery */}
							<div className="flex-1 overflow-y-auto p-4">
								<div className="space-y-3">
									{/* Main image */}
									<div className="w-full aspect-video rounded-lg overflow-hidden bg-slate-900/50">
										<img
											src={displayGame.image || displayGame.banner_img}
											alt={displayGame.title || displayGame.name}
											className="w-full h-full object-cover"
											onError={(e) => {
												e.target.style.display = 'none';
											}}
										/>
									</div>

									{/* Additional screenshots (mock) */}
									{displayGame.screenshots && displayGame.screenshots.map((screenshot, idx) => (
										<div key={idx} className="w-full aspect-video rounded-lg overflow-hidden bg-slate-900/50">
											<img
												src={screenshot}
												alt={`Screenshot ${idx + 1}`}
												className="w-full h-full object-cover"
											/>
										</div>
									))}

									{/* Description if available */}
									{displayGame.description && (
										<p className="text-sm text-slate-300 mt-3">
											{displayGame.description}
										</p>
									)}
								</div>
							</div>

							{/* Tags/Genres footer */}
							<div className="px-4 py-3 border-t border-slate-700/50">
								<div className="flex flex-wrap gap-2">
									{displayGame.tags && displayGame.tags.map((tag, idx) => (
										<span
											key={idx}
											className="text-xs px-3 py-1.5 bg-slate-700/50 text-slate-300 rounded hover:bg-slate-600/50 transition-colors cursor-pointer"
										>
											{tag}
										</span>
									))}
									{displayGame.genres && Array.isArray(displayGame.genres) && displayGame.genres.map((genre, idx) => (
										<span
											key={idx}
											className="text-xs px-3 py-1.5 bg-slate-700/50 text-slate-300 rounded hover:bg-slate-600/50 transition-colors cursor-pointer"
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
