import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildStoreGameRoute, resolveStorePlatformFromGameStrict } from '../../utils/storeRouting.js';

function normalizeMetadataLabel(value) {
	if (value == null) return '';

	if (typeof value === 'object') {
		const fields = [
			value.description,
			value.genre,
			value.name,
			value.tag,
			value.label,
			value.title,
		];
		for (const field of fields) {
			if (typeof field === 'string' && field.trim()) return field.trim();
		}
		return '';
	}

	if (typeof value === 'string') return value.trim();
	return '';
}

function normalizeMetadataList(input) {
	const source = Array.isArray(input) ? input : [input];
	const out = [];
	const seen = new Set();

	for (const entry of source) {
		const label = normalizeMetadataLabel(entry);
		if (!label) continue;

		const parts = label.includes(',')
			? label.split(',').map((part) => part.trim()).filter(Boolean)
			: [label];

		for (const part of parts) {
			if (!part || /^\d+$/.test(part)) continue;
			const key = part.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(part);
		}
	}

	return out;
}

function getGameIdKey(game) {
	return String(game?.appid ?? game?.app_id ?? game?.id ?? '').trim();
}

function uniqueNonEmptyStrings(values) {
	const out = [];
	const seen = new Set();

	for (const raw of values) {
		const value = String(raw ?? '').trim();
		if (!value) continue;
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(value);
	}

	return out;
}

async function resolveGenresForGame(api, game, idKey) {
	const idCandidates = uniqueNonEmptyStrings([
		idKey,
		game?.id,
		game?.appid,
		game?.app_id,
	]);

	for (const idCandidate of idCandidates) {
		try {
			const details = await api.getAllDetailsByID(idCandidate);
			const genres = normalizeMetadataList(details?.genre_names ?? details?.genres);
			if (genres.length > 0) return genres;
		} catch {
			// Try fallback endpoint variants.
		}
	}

	if (typeof api.getAllDetailsByAppIDAndPlatform === 'function') {
		const appIdCandidates = uniqueNonEmptyStrings([
			game?.app_id,
			game?.appid,
			idKey,
		]);
		const platformCandidates = uniqueNonEmptyStrings([
			resolveStorePlatformFromGameStrict(game),
			game?.platform_name,
			game?.platform,
		]);

		for (const appId of appIdCandidates) {
			for (const platform of platformCandidates) {
				try {
					const details = await api.getAllDetailsByAppIDAndPlatform(appId, platform);
					const genres = normalizeMetadataList(details?.genre_names ?? details?.genres);
					if (genres.length > 0) return genres;
				} catch {
					// Keep trying alternates.
				}
			}
		}
	}

	return [];
}

function collectVisibleGenres(game, enrichedById) {
	const nativeGenres = normalizeMetadataList(game?.genre_names ?? game?.genreNames ?? game?.genres);
	if (nativeGenres.length > 0) return nativeGenres;

	const idKey = getGameIdKey(game);
	if (!idKey) return [];
	return normalizeMetadataList(enrichedById[idKey] || []);
}

/**
 * Steam-style game grid component
 * Displays games in a responsive grid layout with hover effects
 */
const GameGrid = ({ games = [], isLoading = false, emptyMessage = 'No games found' }) => {
	const navigate = useNavigate();
	const [enrichedGenresById, setEnrichedGenresById] = useState({});

	useEffect(() => {
		let cancelled = false;
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.getAllDetailsByID !== 'function') return;

		const pendingEntries = [];
		const pendingSeen = new Set();
		for (const game of (games || []).slice(0, 24)) {
			const idKey = getGameIdKey(game);
			if (!idKey || (idKey in enrichedGenresById) || pendingSeen.has(idKey)) continue;
			pendingSeen.add(idKey);
			pendingEntries.push([idKey, game]);
		}

		if (pendingEntries.length < 1) return;

		void (async () => {
			const resolvedEntries = await Promise.all(
				pendingEntries.map(async ([idKey, game]) => {
					try {
						const genres = await resolveGenresForGame(api, game, idKey);
						return [idKey, genres];
					} catch {
						return [idKey, []];
					}
				}),
			);

			if (cancelled) return;
			setEnrichedGenresById((prev) => {
				let changed = false;
				const next = { ...prev };
				for (const [idKey, genres] of resolvedEntries) {
					const normalizedGenres = Array.isArray(genres) ? genres : [];
					if (normalizedGenres.length < 1) continue;

					const previousGenres = Array.isArray(next[idKey]) ? next[idKey] : [];
					const isSame =
						previousGenres.length === normalizedGenres.length
						&& previousGenres.every((value, index) => value === normalizedGenres[index]);
					if (isSame) continue;

					next[idKey] = normalizedGenres;
					changed = true;
				}
				return changed ? next : prev;
			});
		})();

		return () => {
			cancelled = true;
		};
	}, [games, enrichedGenresById]);

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
				const gameImage = game.image || game.poster || `https://via.placeholder.com/300x400?text=${encodeURIComponent(game.title || 'Game')}`;
				const gameTitle = game.title || game.name || 'Untitled Game';
				const gamePrice = game.price !== undefined ? game.price : null;
				const tags = normalizeMetadataList(game?.tag_names ?? game?.tagNames ?? game?.tags).slice(0, 2);
				const genres = collectVisibleGenres(game, enrichedGenresById)
					.filter((genre) => !tags.some((tag) => String(tag).toLowerCase() === String(genre).toLowerCase()))
					.slice(0, 2);

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
									e.target.src = `https://via.placeholder.com/300x400?text=${encodeURIComponent(gameTitle)}`;
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

							{(tags.length > 0 || genres.length > 0) ? (
								<div className="mb-2 flex flex-wrap gap-1">
									{tags.map((tag) => (
										<span key={`tag-${gameId}-${tag}`} className="text-[10px] px-1.5 py-0.5 bg-slate-900/70 text-slate-300 rounded">
											{tag}
										</span>
									))}
									{genres.map((genre) => (
										<span key={`genre-${gameId}-${genre}`} className="text-[10px] px-1.5 py-0.5 bg-sky-900/35 text-sky-200 rounded">
											{genre}
										</span>
									))}
								</div>
							) : null}
							
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
