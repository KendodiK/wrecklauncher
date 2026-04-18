import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CompactFiltersSidebar from './CompactFiltersSidebar.jsx';
import { mergeUniqueGames, searchGamesFromSources } from '../../utils/remoteGameSearch.js';
import {
	buildStoreGameRoute,
	resolveStorePlatformFromGameStrict,
} from '../../utils/storeRouting.js';

function extractMetadataLabel(value) {
	if (value == null) return '';

	if (typeof value === 'object') {
		const fields = [
			value.name,
			value.genre,
			value.description,
			value.tag,
			value.title,
			value.label,
		];
		for (const field of fields) {
			if (typeof field === 'string' && field.trim()) {
				return field.trim();
			}
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
		const label = extractMetadataLabel(entry);
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

function getGameMetadata(game) {
	const genres = normalizeMetadataList(game?.genre_names ?? game?.genreNames ?? game?.genres);
	const rawTags = normalizeMetadataList(game?.tag_names ?? game?.tagNames ?? game?.tags);
	const tags = rawTags.length > 0 ? rawTags : genres;
	return { tags, genres };
}

function getGameIdKey(game) {
	const rawId = String(game?.appid ?? game?.app_id ?? game?.id ?? '').trim();
	if (!rawId) return '';
	const platform = String(
		resolveStorePlatformFromGameStrict(game) || game?.platform_name || game?.platform || 'unknown'
	).trim().toLowerCase() || 'unknown';
	return `${platform}:${rawId}`;
}

const FilteredGamesSection = ({
	games = [],
	title = "Browse Games",
	onRequestNextPage,
	canLoadMore = false,
	isLoadingMore = false,
	onRemoteResultsUpdate,
}) => {
	const navigate = useNavigate();
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedTags, setSelectedTags] = useState([]);
	const [selectedPlatforms, setSelectedPlatforms] = useState([]);
	const [priceRange, setPriceRange] = useState({ min: 0, max: 100 });
	const [selectedGame, setSelectedGame] = useState(null);
	const [resolvedGenresByGameId, setResolvedGenresByGameId] = useState({});
	const [remoteSearchGames, setRemoteSearchGames] = useState([]);
	const [isRemoteSearchLoading, setIsRemoteSearchLoading] = useState(false);
	const [currentPage, setCurrentPage] = useState(1);
	const gamesPerPage = 20;
	const normalizedSearchQuery = String(searchQuery || '').trim();
	const hasSearchFilters = normalizedSearchQuery.length > 0 || selectedTags.length > 0;

	useEffect(() => {
		let cancelled = false;
		const api = typeof window !== 'undefined' ? window.electronAPI : null;

		if (!hasSearchFilters) {
			setRemoteSearchGames([]);
			setIsRemoteSearchLoading(false);
			return;
		}

		if (!api) {
			setRemoteSearchGames([]);
			setIsRemoteSearchLoading(false);
			return;
		}

		setIsRemoteSearchLoading(true);
		const debounceId = setTimeout(() => {
			void (async () => {
				try {
					const rows = await searchGamesFromSources(api, normalizedSearchQuery, selectedPlatforms, selectedTags);
					if (cancelled) return;
					const normalizedRows = Array.isArray(rows) ? rows : [];
					setRemoteSearchGames(normalizedRows);
					if (normalizedRows.length > 0 && typeof onRemoteResultsUpdate === 'function') {
						onRemoteResultsUpdate(normalizedRows);
					}
				} catch (error) {
					if (cancelled) return;
					console.warn('Remote browse search failed:', error);
					setRemoteSearchGames([]);
				} finally {
					if (!cancelled) {
						setIsRemoteSearchLoading(false);
					}
				}
			})();
		}, 240);

		return () => {
			cancelled = true;
			clearTimeout(debounceId);
		};
	}, [hasSearchFilters, normalizedSearchQuery, onRemoteResultsUpdate, selectedPlatforms, selectedTags]);

	const searchableGames = useMemo(() => {
		if (!hasSearchFilters) return games;
		return mergeUniqueGames(remoteSearchGames, games);
	}, [games, hasSearchFilters, remoteSearchGames]);

	const getMetadataForGame = (game) => {
		const local = getGameMetadata(game);
		if (local.genres.length > 0) return local;

		const idKey = getGameIdKey(game);
		const cachedGenres = idKey ? resolvedGenresByGameId[idKey] : null;
		if (!Array.isArray(cachedGenres) || cachedGenres.length < 1) return local;

		return {
			tags: local.tags.length > 0 ? local.tags : cachedGenres,
			genres: cachedGenres,
		};
	};

	const { quickTags, advancedTags } = useMemo(() => {
		const counts = new Map();
		const labels = new Map();
		for (const game of searchableGames) {
			const { tags } = getMetadataForGame(game);
			for (const rawTag of tags) {
				const label = String(rawTag || '').trim();
				if (!label) continue;
				const key = label.toLowerCase();
				counts.set(key, (counts.get(key) || 0) + 1);
				if (!labels.has(key)) labels.set(key, label);
			}
		}

		const ordered = [...counts.entries()]
			.sort((a, b) => {
				if (b[1] !== a[1]) return b[1] - a[1];
				return (labels.get(a[0]) || a[0]).localeCompare(labels.get(b[0]) || b[0]);
			})
			.map(([key]) => labels.get(key) || key);

		return {
			quickTags: ordered.slice(0, 4),
			advancedTags: ordered.slice(4),
		};
	}, [searchableGames, resolvedGenresByGameId]);

	// Filtered games based on filters
	const filteredGames = useMemo(() => {
		return searchableGames.filter(game => {
			if (searchQuery && !(game.title || game.name || '').toLowerCase().includes(searchQuery.toLowerCase()))
				return false;

			if (selectedTags.length > 0) {
				const metadata = getMetadataForGame(game);
				const gameTags = new Set(
					metadata.tags
						.map((tag) => String(tag || '').trim().toLowerCase())
						.filter(Boolean),
				);
				const hasAllSelectedTags = selectedTags.every((selectedTag) =>
					gameTags.has(String(selectedTag || '').trim().toLowerCase()),
				);
				if (!hasAllSelectedTags) return false;
			}

			const gamePlatform = resolveStorePlatformFromGameStrict(game);
			if (selectedPlatforms.length > 0 && !selectedPlatforms.includes(gamePlatform)) return false;

			const rawPrice = Number(game.price ?? game.cost ?? 0);
			const price = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : 0;
			if (price < priceRange.min || price > priceRange.max) return false;

			return true;
		});
	}, [searchableGames, searchQuery, selectedTags, selectedPlatforms, priceRange, resolvedGenresByGameId]);

	const totalPages = Math.max(1, Math.ceil(filteredGames.length / gamesPerPage));

	const pagedGames = useMemo(() => {
		const start = (currentPage - 1) * gamesPerPage;
		return filteredGames.slice(start, start + gamesPerPage);
	}, [filteredGames, currentPage]);

	const displayGame = selectedGame || pagedGames[0] || null;
	const displayGameMetadata = useMemo(() => {
		return displayGame ? getMetadataForGame(displayGame) : { tags: [], genres: [] };
	}, [displayGame, resolvedGenresByGameId]);

	useEffect(() => {
		let cancelled = false;
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.getAllDetailsByID !== 'function') return;

		const unresolved = [];
		for (const game of pagedGames) {
			const idKey = getGameIdKey(game);
			if (!idKey) continue;

			const localGenres = normalizeMetadataList(game?.genre_names ?? game?.genreNames ?? game?.genres);
			if (localGenres.length > 0) continue;

			if (Object.prototype.hasOwnProperty.call(resolvedGenresByGameId, idKey)) continue;
			unresolved.push({ idKey, game });
		}

		if (unresolved.length < 1) return;

		void (async () => {
			const updates = {};
			const chunkSize = 3;

			for (let i = 0; i < unresolved.length && !cancelled; i += chunkSize) {
				const chunk = unresolved.slice(i, i + chunkSize);
				const results = await Promise.all(
					chunk.map(async ({ idKey, game }) => {
						const rawCandidates = [
							game?.db_id,
							game?.native_id,
							game?.nativeId,
							game?.id,
						];
						const idCandidates = [];
						for (const candidate of rawCandidates) {
							const numeric = Number(candidate);
							if (!Number.isFinite(numeric) || numeric <= 0) continue;
							const asInt = Math.trunc(numeric);
							if (idCandidates.includes(asInt)) continue;
							idCandidates.push(asInt);
						}

						if (idCandidates.length < 1) {
							return [idKey, []];
						}

						try {
							for (const detailsId of idCandidates) {
								const details = await api.getAllDetailsByID(detailsId);
								const genres = normalizeMetadataList(details?.genre_names ?? details?.genres);
								if (genres.length > 0) return [idKey, genres];
							}
							return [idKey, []];
						} catch {
							return [idKey, []];
						}
					})
				);

				for (const [idKey, genres] of results) {
					updates[idKey] = Array.isArray(genres) ? genres : [];
				}
			}

			if (cancelled) return;

			setResolvedGenresByGameId((prev) => {
				let changed = false;
				const next = { ...prev };

				for (const [idKey, genres] of Object.entries(updates)) {
					const normalized = normalizeMetadataList(genres);
					const previous = Array.isArray(next[idKey]) ? next[idKey] : null;
					const same =
						Array.isArray(previous)
						&& previous.length === normalized.length
						&& previous.every((value, index) => value === normalized[index]);

					if (same) continue;
					next[idKey] = normalized;
					changed = true;
				}

				return changed ? next : prev;
			});
		})();

		return () => {
			cancelled = true;
		};
	}, [pagedGames, resolvedGenresByGameId]);

	// Reset page when filters change
	useEffect(() => {
		setCurrentPage(1);
	}, [searchQuery, selectedTags, selectedPlatforms, priceRange]);

	useEffect(() => {
		if (currentPage > totalPages) {
			setCurrentPage(totalPages);
		}
	}, [currentPage, totalPages]);

	// Reset selected game if not in current page
	useEffect(() => {
		if (!pagedGames.length) {
			setSelectedGame(null);
			return;
		}
		const selectedId = selectedGame?.appid || selectedGame?.app_id || selectedGame?.id;
		if (!pagedGames.some(g => (g.appid || g.app_id || g.id) === selectedId)) {
			setSelectedGame(pagedGames[0]);
		}
	}, [pagedGames, selectedGame]);

const handleNextPage = async () => {
	if (currentPage < totalPages) {
		setCurrentPage((p) => Math.min(totalPages, p + 1));
		return;
	}

	if (!canLoadMore || typeof onRequestNextPage !== 'function' || isLoadingMore) {
		return;
	}

	try {
		const loaded = await onRequestNextPage();
		const didLoad = typeof loaded === 'number' ? loaded > 0 : Boolean(loaded);
		if (didLoad) {
			setCurrentPage((p) => p + 1);
		}
	} catch (error) {
		console.error('Failed to load next browse page:', error);
	}
};

// Prefetch next page when on last page
useEffect(() => {
	if (
		currentPage >= Math.max(1, totalPages - 1) &&
		canLoadMore &&
		typeof onRequestNextPage === 'function' &&
		!isLoadingMore
	) {
		onRequestNextPage();
	}
	// Only run when on last page
	// eslint-disable-next-line react-hooks/exhaustive-deps
}, [currentPage, totalPages, canLoadMore, isLoadingMore]);

	const handleResetFilters = () => {
		setSearchQuery('');
		setSelectedTags([]);
		setSelectedPlatforms([]);
		setPriceRange({ min: 0, max: 100 });
		setCurrentPage(1);
	};

	const toStoreGameUrl = (game) => {
		return buildStoreGameRoute(game, 'steam');
	};

	return (
		<div className="w-full flex gap-4">
			{/* Game list */}
			<div className="w-[50%] bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 flex flex-col overflow-hidden">
				<div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
					<div>
						<h3 className="text-lg font-semibold text-slate-100">{title}</h3>
						<p className="text-sm text-slate-400 mt-0.5">
							{filteredGames.length} games found
							{isRemoteSearchLoading ? ' • searching...' : ''}
						</p>
					</div>
					<button
						onClick={() => navigate('/shop/all-games')}
						className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-3 py-2 rounded hover:bg-slate-700/50"
					>
						See all
					</button>
				</div>

				<div className="flex-1 overflow-y-auto scrollbar-thin">
					{pagedGames.length > 0 ? pagedGames.map(game => {
						const gameId = game.appid || game.app_id || game.id;
						const isSelected = displayGame && (displayGame.appid || displayGame.app_id || displayGame.id) === gameId;
						const metadata = getMetadataForGame(game);
						const visibleTags = metadata.tags.slice(0, 2);
						const visibleGenres = metadata.genres
							.filter((genre) => !visibleTags.some((tag) => tag.toLowerCase() === String(genre || '').toLowerCase()))
							.slice(0, 2);

						return (
							<div
								key={gameId}
								className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-slate-700/30 ${
									isSelected ? 'bg-slate-700/50' : 'hover:bg-slate-700/30'
								}`}
								onClick={() => setSelectedGame(game)}
							>
								<div className="w-20 h-11 flex-shrink-0 rounded overflow-hidden bg-slate-900/50">
									<img
										src={game.image || game.banner_img}
										alt={game.title || game.name}
										className="w-full h-full object-cover"
										onError={e => e.target.style.display = 'none'}
									/>
								</div>
								<div className="flex-1 min-w-0">
									<h4 className="text-sm font-medium text-slate-100 truncate mb-1">{game.title || game.name}</h4>
									<div className="flex flex-wrap gap-1">
										{visibleTags.map((tag) => (
											<span key={`tag-${tag}`} className="text-xs px-2 py-0.5 bg-slate-900/50 text-slate-300 rounded">{tag}</span>
										))}
										{visibleGenres.map((genre) => (
											<span key={`genre-${genre}`} className="text-xs px-2 py-0.5 bg-sky-900/30 text-sky-200 rounded">{genre}</span>
										))}
										{visibleTags.length === 0 && visibleGenres.length === 0 ? (
											<span className="text-xs px-2 py-0.5 bg-slate-900/50 text-slate-500 rounded">No tags</span>
										) : null}
									</div>
								</div>
							</div>
						);
					}) : (
						<div className="flex-1 flex items-center justify-center text-slate-500 p-4">
							No games match your filters
						</div>
					)}
				</div>

				{/* Pagination */}
				<div className="px-3 py-2 border-t border-slate-700/50 bg-slate-800/60 flex items-center justify-between">
					<button
						onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
						disabled={currentPage === 1}
						className="px-3 py-1 text-xs rounded bg-slate-800/50 border border-slate-700/50 text-slate-200 disabled:opacity-40"
					>
						Prev
					</button>
					<div className="text-xs text-slate-300">Page {currentPage} / {canLoadMore ? `${totalPages}+` : totalPages}</div>
					<button
						onClick={handleNextPage}
						disabled={isLoadingMore || (!canLoadMore && currentPage === totalPages)}
						className="px-3 py-1 text-xs rounded bg-slate-800/50 border border-slate-700/50 text-slate-200 disabled:opacity-40"
					>
						{isLoadingMore ? 'Loading...' : 'Next'}
					</button>
				</div>
			</div>

			{/* Game preview */}
			<div className="w-[30%] bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden flex flex-col">
				{displayGame ? (
					<>
						<div className="px-3 py-2 border-b border-slate-700/50">
							<h3 className="text-sm font-semibold text-slate-100 truncate">{displayGame.title || displayGame.name}</h3>
						</div>
						<div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
							<div className="w-full aspect-[16/9] rounded overflow-hidden bg-slate-900/50 mb-3">
								<img src={displayGame.image || displayGame.banner_img} alt={displayGame.title || displayGame.name} className="w-full h-full object-cover" onError={e => e.target.style.display = 'none'} />
							</div>
							<div className="mb-3 flex flex-wrap gap-1">
								{displayGameMetadata.tags.slice(0, 4).map((tag) => (
									<span key={`preview-tag-${tag}`} className="text-xs px-2 py-0.5 bg-slate-900/50 text-slate-300 rounded">{tag}</span>
								))}
								{displayGameMetadata.genres
									.filter((genre) => !displayGameMetadata.tags.some((tag) => tag.toLowerCase() === String(genre || '').toLowerCase()))
									.slice(0, 4)
									.map((genre) => (
										<span key={`preview-genre-${genre}`} className="text-xs px-2 py-0.5 bg-sky-900/30 text-sky-200 rounded">{genre}</span>
									))}
							</div>
							<p className="text-xs text-slate-300 leading-relaxed mb-3">{displayGame.description || 'No description available.'}</p>
							<button onClick={() => navigate(toStoreGameUrl(displayGame), { state: { game: displayGame } })}
								className="w-full rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold py-2 transition-colors">
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

			{/* Filters */}
			<CompactFiltersSidebar
				searchQuery={searchQuery}
				onSearchChange={setSearchQuery}
				selectedTags={selectedTags}
				onTagsChange={setSelectedTags}
				quickTags={quickTags}
				advancedTags={advancedTags}
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


// import React, { useState, useMemo, useRef, useEffect } from 'react';
// import { useNavigate } from 'react-router-dom';
// import CompactFiltersSidebar from './CompactFiltersSidebar.jsx';

// function normalizePlatformId(value) {
// 	const normalized = String(value || '').trim().toLowerCase();
// 	if (!normalized) return '';
// 	if (normalized === 'itch' || normalized === 'itchio' || normalized === 'itch.io') return 'itchio';
// 	return normalized;
// }

// /**
//  * Filtered games section with list on left and compact filters on right
//  */
// const FilteredGamesSection = ({
// 	games = [],
// 	title = "Browse Games",
// 	onRequestNextPage,
// 	canLoadMore = false,
// 	isLoadingMore = false,
// }) => {
// 	const navigate = useNavigate();
// 	const [searchQuery, setSearchQuery] = useState('');
// 	const [selectedGenres, setSelectedGenres] = useState([]);
// 	const [selectedPlatforms, setSelectedPlatforms] = useState([]);
// 	const [priceRange, setPriceRange] = useState({ min: 0, max: 100 });
// 	const [selectedGame, setSelectedGame] = useState(null);
// 	const [currentPage, setCurrentPage] = useState(1);
// 	const gamesPerPage = 20;
// const loadMoreRef = useRef(null);

// 	const genres = useMemo(() => {
// 		const names = new Set();
// 		for (const game of games) {
// 			for (const g of Array.isArray(game.genres) ? game.genres : []) {
// 				if (typeof g === 'string' && g.trim()) names.add(g.trim());
// 				if (g && typeof g === 'object') {
// 					const v = g.genre || g.name || g.description;
// 					if (typeof v === 'string' && v.trim()) names.add(v.trim());
// 				}
// 			}
// 		}
// 		return Array.from(names).sort((a, b) => a.localeCompare(b)).map((name, idx) => ({ id: idx + 1, name }));
// 	}, [games]);

// 	const platforms = useMemo(() => {
// 		const names = new Set();
// 		for (const game of games) {
// 			const p = game.platform || game.platform_name;
// 			if (typeof p === 'string' && p.trim()) names.add(p.trim().toLowerCase());
// 		}
// 		return Array.from(names).sort((a, b) => a.localeCompare(b)).map((id) => ({
// 			id,
// 			name: id.charAt(0).toUpperCase() + id.slice(1),
// 		}));
// 	}, [games]);

// 	// Filter games based on current filters
// 	const filteredGames = useMemo(() => {
// 		return games.filter(game => {
// 			// Search filter
// 			if (searchQuery && !(game.title || game.name || '').toLowerCase().includes(searchQuery.toLowerCase())) {
// 				return false;
// 			}

// 			// Genre filter
// 			if (selectedGenres.length > 0) {
// 				const gameGenres = Array.isArray(game.genres) ? game.genres : [];
// 				const hasMatchingGenre = selectedGenres.some(genreId => 
// 					gameGenres.includes(genreId) || 
// 					gameGenres.some(g => typeof g === 'object' && g.id === genreId)
// 				);
// 				if (!hasMatchingGenre) return false;
// 			}

// 			// Platform filter
// 			const gamePlatform = normalizePlatformId(game.platform || game.platform_name);
// 			if (selectedPlatforms.length > 0 && !selectedPlatforms.includes(gamePlatform)) {
// 				return false;
// 			}

// 			// Price filter
// 			const price = game.price ?? 0;
// 			if (price < priceRange.min || price > priceRange.max) {
// 				return false;
// 			}

// 			return true;
// 		});
// 	}, [games, searchQuery, selectedGenres, selectedPlatforms, priceRange]);

// 	const totalPages = Math.max(1, Math.ceil(filteredGames.length / gamesPerPage));
// 	const showPagination = filteredGames.length > gamesPerPage || canLoadMore || currentPage > 1;
// 	const pageCountLabel = canLoadMore ? `${totalPages}+` : String(totalPages);
// 	const pagedGames = useMemo(() => {
// 		const start = (currentPage - 1) * gamesPerPage;
// 		return filteredGames.slice(start, start + gamesPerPage);
// 	}, [filteredGames, currentPage]);

// 	const displayGame = selectedGame || pagedGames[0] || null;
// 	useEffect(() => {
// 		setCurrentPage(1);
// 	}, [searchQuery, selectedGenres, selectedPlatforms, priceRange]);

// 	useEffect(() => {
// 		if (currentPage > totalPages) {
// 			setCurrentPage(totalPages);
// 		}
// 	}, [currentPage, totalPages]);

// 	useEffect(() => {
// 		if (!pagedGames.length) {
// 			setSelectedGame(null);
// 			return;
// 		}

// 		const selectedId = selectedGame?.appid || selectedGame?.app_id || selectedGame?.id;
// 		const hasSelectedInPage = pagedGames.some((game) => (game.appid || game.app_id || game.id) === selectedId);
// 		if (!hasSelectedInPage) {
// 			setSelectedGame(pagedGames[0]);
// 		}
// 	}, [pagedGames, selectedGame]);

// 	const handleGameClick = (game) => {
// 		setSelectedGame(game);
// 	};

// 	const toStoreGameUrl = (game) => {
// 		const gameId = game?.appid || game?.app_id || game?.id;
// 		if (!gameId) return '';
// 		const platform = normalizePlatformId(game?.platform_name || game?.platform) || 'steam';
// 		return `/store/game/${encodeURIComponent(platform)}/${encodeURIComponent(gameId)}`;
// 	};

// 	const handleResetFilters = () => {
// 		setSearchQuery('');
// 		setSelectedGenres([]);
// 		setSelectedPlatforms([]);
// 		setPriceRange({ min: 0, max: 100 });
// 		setCurrentPage(1);
// 	};

// 	const handleNextPage = async () => {
// 		if (currentPage < totalPages) {
// 			setCurrentPage((p) => Math.min(totalPages, p + 1));
// 			return;
// 		}

// 		if (canLoadMore && typeof onRequestNextPage === 'function') {
// 			const loaded = await onRequestNextPage();
// 			if (loaded) {
// 				setCurrentPage((p) => p + 1);
// 			}
// 		}
// 	};

// 	return (
// 		<div className="w-full flex gap-4">
// 			{/* Left side - Game list */}
// 			<div className="w-[50%] bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden flex flex-col">
// 				{/* Header */}
// 				<div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
// 					<div>
// 						<h3 className="text-lg font-semibold text-slate-100">{title}</h3>
// 						<p className="text-sm text-slate-400 mt-0.5">{filteredGames.length} games found</p>
// 					</div>
// 					<button 
// 						onClick={() => navigate('/shop/all-games')}
// 						className="text-sm text-slate-400 hover:text-slate-200 transition-colors px-3 py-2 rounded hover:bg-slate-700/50"
// 					>
// 						See all
// 					</button>
// 				</div>

// 				{/* Games list */}
// 				<div className="flex-1 overflow-y-auto scrollbar-thin">
// 					{filteredGames.length > 0 ? (
// 						pagedGames.map((game) => {
// 							const gameId = game.appid || game.app_id || game.id;
// 							const isSelected = displayGame && (displayGame.appid || displayGame.app_id || displayGame.id) === gameId;
							
// 							return (
// 								<div
// 									key={gameId}
// 									className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-slate-700/30 ${
// 										isSelected 
// 											? 'bg-slate-700/50' 
// 											: 'hover:bg-slate-700/30'
// 									}`}
// 									onClick={() => handleGameClick(game)}
// 								>
// 									{/* Game thumbnail */}
// 									<div className="w-20 h-11 flex-shrink-0 rounded overflow-hidden bg-slate-900/50">
// 										<img
// 											src={game.image || game.banner_img}
// 											alt={game.title || game.name}
// 											className="w-full h-full object-cover"
// 											onError={(e) => {
// 												e.target.style.display = 'none';
// 											}}
// 										/>
// 									</div>

// 									{/* Game info */}
// 									<div className="flex-1 min-w-0">
// 										<h4 className="text-sm font-medium text-slate-100 truncate mb-1">
// 											{game.title || game.name}
// 										</h4>
										
// 										{/* Tags/Genres */}
// 										<div className="flex flex-wrap gap-1">
// 											{game.tags && game.tags.slice(0, 3).map((tag, idx) => (
// 												<span
// 													key={idx}
// 													className="text-xs px-2 py-0.5 bg-slate-900/50 text-slate-400 rounded"
// 												>
// 													{tag}
// 												</span>
// 											))}
// 										</div>
// 									</div>

// 									{/* Price section */}
// 									<div className="flex items-center gap-2 flex-shrink-0">
// 										{game.discount && game.discount > 0 && (
// 											<div className="px-2 py-1 bg-green-600 text-white text-xs font-bold rounded">
// 												-{game.discount}%
// 											</div>
// 										)}
// 										<div className="text-right">
// 											{game.originalPrice && game.discount && (
// 												<div className="text-xs text-slate-500 line-through">
// 													{game.originalPrice}€
// 												</div>
// 											)}
// 											<div className={`text-sm font-semibold ${
// 												game.price === 0 
// 													? 'text-green-400' 
// 													: game.discount 
// 														? 'text-green-400' 
// 														: 'text-slate-100'
// 											}`}>
// 												{game.price === 0 ? 'Free' : `${game.price}€`}
// 											</div>
// 										</div>
// 									</div>
// 								</div>
// 							);
// 						})
// 					) : (
// 						<div className="flex-1 flex items-center justify-center text-slate-500 p-4">
// 							<p className="text-sm">No games match your filters</p>
// 						</div>
// 					)}
// 				</div>

// 				{showPagination && (
// 					<div className="px-3 py-2 border-t border-slate-700/50 bg-slate-800/60 flex items-center justify-between">
// 						<button
// 							onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
// 							disabled={currentPage === 1}
// 							className="px-3 py-1 text-xs rounded bg-slate-800/50 border border-slate-700/50 text-slate-200 disabled:opacity-40"
// 						>
// 							Prev
// 						</button>
// 						<div className="text-xs text-slate-300">Page {currentPage} / {pageCountLabel}</div>
// 						<button
// 							onClick={handleNextPage}
// 							disabled={isLoadingMore || (currentPage === totalPages && !canLoadMore)}
// 							className="px-3 py-1 text-xs rounded bg-slate-800/50 border border-slate-700/50 text-slate-200 disabled:opacity-40"
// 						>
// 							{isLoadingMore ? 'Loading...' : 'Next'}
// 						</button>
// 					</div>
// 				)}
// 			</div>

// 			{/* Middle - Game preview (fixed) */}
// 			<div className="w-[30%] bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 overflow-hidden flex flex-col">
// 				{displayGame ? (
// 					<>
// 						<div className="px-3 py-2 border-b border-slate-700/50">
// 							<h3 className="text-sm font-semibold text-slate-100 truncate">
// 								{displayGame.title || displayGame.name}
// 							</h3>
// 						</div>

// 						<div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
// 							<div className="w-full aspect-[16/9] rounded overflow-hidden bg-slate-900/50 mb-3">
// 								<img
// 									src={displayGame.image || displayGame.banner_img}
// 									alt={displayGame.title || displayGame.name}
// 									className="w-full h-full object-cover"
// 									onError={(e) => {
// 										e.target.style.display = 'none';
// 									}}
// 								/>
// 							</div>

// 							<p className="text-xs text-slate-300 leading-relaxed mb-3">
// 								{displayGame.description || 'No description available from database.'}
// 							</p>

// 							<button
// 								onClick={() => {
// 									const target = toStoreGameUrl(displayGame);
// 									if (!target) return;
// 									navigate(target, { state: { game: displayGame } });
// 								}}
// 								className="w-full rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold py-2 transition-colors"
// 							>
// 								Open Game Page
// 							</button>
// 						</div>						
// 					</>
// 				) : (
// 					<div className="flex-1 flex items-center justify-center text-slate-500 p-4 text-sm">
// 						No games available for preview
// 					</div>
// 				)}
// 			</div>
// 			{/* Right side - Compact filters sidebar */}
// 			<CompactFiltersSidebar				searchQuery={searchQuery}
// 				onSearchChange={setSearchQuery}
// 				selectedGenres={selectedGenres}
// 				onGenresChange={setSelectedGenres}
// 				selectedPlatforms={selectedPlatforms}
// 				onPlatformsChange={setSelectedPlatforms}
// 				priceRange={priceRange}
// 				onPriceChange={setPriceRange}
// 				onReset={handleResetFilters}
// 			/>
// 		</div>
// 	);
// };

// export default FilteredGamesSection;
