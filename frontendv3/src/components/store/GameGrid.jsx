import React from 'react';
import { useNavigate } from 'react-router-dom';
import { buildStoreGameRoute } from '../../utils/storeRouting.js';
import logoImage from '../../assets/logo.svg';

function getGameTagLabels(game, limit = Infinity) {
	const labels = [];
	const seen = new Set();
	const push = (value) => {
		const label = String(
			typeof value === 'object' && value !== null
				? value.name ?? value.genre ?? value.description ?? value.label ?? ''
				: value ?? '',
		)
			.trim();
		if (!label || /^\d+$/.test(label)) return;
		const key = label.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		labels.push(label);
	};

	(Array.isArray(game?.tags) ? game.tags : []).forEach(push);
	(Array.isArray(game?.genres) ? game.genres : []).forEach(push);
	return labels.slice(0, limit);
}

/**
 * Steam-style game grid component
 * Displays games in a responsive grid layout with hover effects
 */
const GameGrid = ({ games = [], isLoading = false, emptyMessage = 'No games found' }) => {
	const navigate = useNavigate();

	const handleCardClick = (game) => {
		const target = buildStoreGameRoute(game, 'steam');
		if (!target) return;
		navigate(target, { state: { game } });
	};

	if (isLoading) {
		return (
			<div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
				{Array.from({ length: 8 }).map((_, i) => (
					<div key={i} className="animate-pulse">
						<div className="bg-slate-800/50 rounded-lg overflow-hidden">
							<div className="w-full aspect-[3/4] bg-slate-700/50" />
							<div className="p-3 space-y-2">
								<div className="h-4 bg-slate-700/50 rounded w-3/4" />
								<div className="h-3 bg-slate-700/50 rounded w-1/2" />
							</div>
						</div>
					</div>
				))}
			</div>
		);
	}

	if (!games || games.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-16 text-center animate-in fade-in slide-in-from-bottom-2 duration-500">
				<svg
					className="w-16 h-16 text-slate-600 mb-4"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						strokeLinecap="round"
						strokeLinejoin="round"
						strokeWidth={1.5}
						d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<p className="text-slate-400 text-lg">{emptyMessage}</p>
				<p className="text-slate-500 text-sm mt-2">Try adjusting your filters</p>
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
			{games.map((game, index) => {
				const gameId = game.id || game.appid || index;
				const gameImage = game.image || game.poster || logoImage;
				const gameTitle = game.title || game.name || 'Untitled Game';
				const gamePrice = game.price !== undefined ? game.price : null;
				const visibleTags = getGameTagLabels(game, 3);

				return (
					<div
						key={gameId}
						onClick={() => handleCardClick(game)}
						className="group cursor-pointer rounded-lg overflow-hidden bg-slate-900/20 border border-slate-700/30 hover:border-slate-500/50 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-slate-900/50 animate-in fade-in slide-in-from-bottom-4 animate-stagger"
						style={{
							animationDelay: `${index * 30}ms`
						}}
					>
						{/* Game image */}
						<div className="relative w-full aspect-[3/4] overflow-hidden bg-slate-800/50">
							<img
								src={gameImage}
								alt={gameTitle}
								className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
								onError={(e) => {
									e.target.src = logoImage;
								}}
							/>
							
							{/* Hover overlay */}
							<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
								<span className="text-white text-sm font-medium px-4 py-2 bg-slate-700/80 backdrop-blur-sm rounded-full border border-slate-500/50">
									View Details
								</span>
							</div>
						</div>

						{/* Game info */}
						<div className="p-3">
							<h3 className="text-slate-100 font-medium text-sm line-clamp-2 mb-1 group-hover:text-white transition-colors">
								{gameTitle}
							</h3>
							{visibleTags.length > 0 && (
								<div className="mb-2 flex flex-wrap gap-1">
									{visibleTags.map((tag, idx) => (
										<span key={`${gameId}-${idx}`} className="text-[10px] px-1.5 py-0.5 bg-slate-900/50 text-slate-400 rounded">
											{tag}
										</span>
									))}
								</div>
							)}
							
							{gamePrice !== null && (
								<div className="flex items-center gap-2">
									{gamePrice === 0 ? (
										<span className="text-green-400 text-sm font-semibold">Free</span>
									) : (
										<span className="text-slate-300 text-sm font-semibold">${gamePrice.toFixed(2)}</span>
									)}
								</div>
							)}
						</div>
					</div>
				);
			})}
		</div>
	);
};

export default GameGrid;
