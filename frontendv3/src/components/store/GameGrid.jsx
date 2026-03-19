import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Steam-style game grid component
 * Displays games in a responsive grid layout with hover effects
 */
const GameGrid = ({ games = [], isLoading = false, emptyMessage = 'No games found' }) => {
	const navigate = useNavigate();

	const normalizeLauncherId = (game) => {
		const raw = String(game?.platform_name || game?.platform || game?.launcherId || '').trim().toLowerCase();
		if (!raw) return 'steam';
		if (raw === 'itch' || raw === 'itch.io' || raw === 'itchio') return 'itchio';
		if (raw === 'epic games' || raw === 'epic_games') return 'epic';
		return raw;
	};

	const launcherBorderClass = (game) => {
		const launcherId = normalizeLauncherId(game);
		if (launcherId === 'steam') return 'border-sky-500/60';
		if (launcherId === 'gog') return 'border-violet-500/60';
		if (launcherId === 'itchio') return 'border-rose-500/60';
		if (launcherId === 'epic') return 'border-blue-500/60';
		return 'border-slate-600/60';
	};

	const hasDiscountFlag = (game) => {
		const discountValue = Number(
			game?.discountPercent ??
			game?.discount ??
			game?.discount_percentage ??
			game?.discount_percent ??
			0
		);
		const discountTag = Array.isArray(game?.tags) && game.tags.some((tag) => {
			const normalized = String(tag).toLowerCase();
			return normalized.includes('discount') || normalized.includes('deal') || normalized.includes('sale');
		});
		return discountValue > 0 || Boolean(game?.is_discounted || game?.isDiscounted) || discountTag;
	};

	const hasUpcomingFlag = (game) => {
		const status = String(game?.status || '').toLowerCase();
		const upcomingTag = Array.isArray(game?.tags) && game.tags.some((tag) => {
			const normalized = String(tag).toLowerCase();
			return normalized.includes('upcoming') || normalized.includes('coming soon');
		});
		return Boolean(
			game?.is_upcoming ||
			game?.isUpcoming ||
			game?.upcoming ||
			game?.coming_soon ||
			game?.comingSoon ||
			status.includes('upcoming') ||
			status.includes('coming soon') ||
			upcomingTag
		);
	};

	const normalizePlatform = (value) => {
		const normalized = String(value || '').trim().toLowerCase();
		if (!normalized) return 'steam';
		if (normalized === 'itch' || normalized === 'itch.io' || normalized === 'itchio') return 'itchio';
		if (normalized === 'epic games' || normalized === 'epic_games') return 'steam';
		return normalized;
	};

	const handleCardClick = (game) => {
		if (game.id || game.appid) {
			const gameId = game.id || game.appid;
			const platform = normalizePlatform(game.platform_name || game.platform);
			navigate(`/store/game/${encodeURIComponent(platform)}/${encodeURIComponent(gameId)}`, { state: { game } });
		}
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
				const gameImage = game.image || game.poster || `https://via.placeholder.com/300x400?text=${encodeURIComponent(game.title || 'Game')}`;
				const gameTitle = game.title || game.name || 'Untitled Game';
				const gamePrice = game.price !== undefined ? game.price : null;
				const stripeClass = hasDiscountFlag(game) ? 'bg-emerald-400' : (hasUpcomingFlag(game) ? 'bg-yellow-400' : '');
				const borderClass = launcherBorderClass(game);

				return (
					<div
						key={gameId}
						onClick={() => handleCardClick(game)}
						className={`group cursor-pointer rounded-lg overflow-hidden bg-slate-900/20 border ${borderClass} hover:border-slate-300/70 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-slate-900/50 animate-in fade-in slide-in-from-bottom-4 animate-stagger`}
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
									e.target.src = `https://via.placeholder.com/300x400?text=${encodeURIComponent(gameTitle)}`;
								}}
							/>
							
							{/* Hover overlay */}
							<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
								<span className="text-white text-sm font-medium px-4 py-2 bg-slate-700/80 backdrop-blur-sm rounded-full border border-slate-500/50">
									View Details
								</span>
							</div>
							{stripeClass ? (
								<div className={`absolute right-2 bottom-2 z-20 h-2 w-10 rounded-sm ${stripeClass}`} />
							) : null}
						</div>

						{/* Game info */}
						<div className="p-3">
							<h3 className="text-slate-100 font-medium text-sm line-clamp-2 mb-1 group-hover:text-white transition-colors">
								{gameTitle}
							</h3>
							
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
