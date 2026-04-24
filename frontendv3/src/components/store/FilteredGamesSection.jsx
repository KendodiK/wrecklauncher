import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import SteamLogo from '../../../../webpage/img/steam_logo.svg';
import GogLogo from '../../../../webpage/img/gog_logo.svg';
import ItchLogo from '../../../../webpage/img/itch_io_logo.svg';
import { useNavigate } from 'react-router-dom';
import CompactFiltersSidebar from './CompactFiltersSidebar.jsx';
import { mergeUniqueGames, searchGamesFromSources } from '../../utils/remoteGameSearch.js';
import {
	buildStoreGameRoute,
	getStorePlatformLabel,
	resolveStorePlatformFromGameStrict,
} from '../../utils/storeRouting.js';

const PLATFORM_ICON_META = {
	steam: { img: SteamLogo, tone: 'bg-sky-500/20 text-sky-200 border-sky-400/40' },
	gog: { img: GogLogo, tone: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40' },
	itchio: { img: ItchLogo, tone: 'bg-rose-500/20 text-rose-200 border-rose-400/40' },
};

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

function getGameTitleKey(game) {
	return String(game?.title ?? game?.name ?? '').trim().toLowerCase();
}

function getPlatformIconMeta(platform) {
	const normalized = String(platform || '').trim().toLowerCase();
	if (Object.prototype.hasOwnProperty.call(PLATFORM_ICON_META, normalized)) {
		return PLATFORM_ICON_META[normalized];
	}

 	return {
		short: String(getStorePlatformLabel(normalized || 'steam')).slice(0, 1).toUpperCase() || '?',
		tone: 'bg-slate-700/60 text-slate-200 border-slate-500/40',
	};
}

function normalizePlatformDefaults(input) {
	if (!Array.isArray(input)) return [];
	const seen = new Set();
	const out = [];
	for (const value of input) {
		const normalized = String(value || '').trim().toLowerCase();
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		out.push(normalized);
	}
	return out;
}

function areStringArraysEqual(a, b) {
	if (a === b) return true;
	if (!Array.isArray(a) || !Array.isArray(b)) return false;
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i += 1) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

const FilteredGamesSection = ({
	games = [],
	title = "Browse Games",
	defaultSelectedPlatforms,
	onRequestNextPage,
	canLoadMore = false,
	isLoadingMore = false,
	onRemoteResultsUpdate,
}) => {
	const normalizedDefaultPlatforms = useMemo(
		() => normalizePlatformDefaults(defaultSelectedPlatforms),
		[defaultSelectedPlatforms],
	);
	const navigate = useNavigate();
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedTags, setSelectedTags] = useState([]);
	const [selectedPlatforms, setSelectedPlatforms] = useState(() => normalizedDefaultPlatforms);
	const [priceRange, setPriceRange] = useState({ min: 0, max: 100 });
	const [selectedGame, setSelectedGame] = useState(null);
	const [hoveredGame, setHoveredGame] = useState(null);
	const [hoverAnchorRect, setHoverAnchorRect] = useState(null);
	const [hoverOverRow, setHoverOverRow] = useState(false);
	const [hoverOverPopup, setHoverOverPopup] = useState(false);
	const [countryCode, setCountryCode] = useState('DE');
	const [resolvedGenresByGameId, setResolvedGenresByGameId] = useState({});
	const [remoteSearchGames, setRemoteSearchGames] = useState([]);
	const [isRemoteSearchLoading, setIsRemoteSearchLoading] = useState(false);
	const [currentPage, setCurrentPage] = useState(1);
	const gamesPerPage = 20;
	const normalizedSearchQuery = String(searchQuery || '').trim();
	const hasSearchFilters = normalizedSearchQuery.length > 0 || selectedTags.length > 0;
	useEffect(() => {
		setSelectedPlatforms((prev) => (
			areStringArraysEqual(prev, normalizedDefaultPlatforms) ? prev : normalizedDefaultPlatforms
		));
	}, [normalizedDefaultPlatforms]);

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

	const availablePlatformsByTitle = useMemo(() => {
		const byTitle = new Map();

		for (const game of searchableGames) {
			const titleKey = getGameTitleKey(game);
			if (!titleKey) continue;

			const platform = resolveStorePlatformFromGameStrict(game);
			if (!platform) continue;

			if (!byTitle.has(titleKey)) byTitle.set(titleKey, new Set());
			byTitle.get(titleKey).add(platform);
		}

		return byTitle;
	}, [searchableGames]);

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

	// Keep popup visible when hovering over popup itself
	useEffect(() => {
		if (!hoverOverRow && !hoverOverPopup) {
			setHoveredGame(null);
			setHoverAnchorRect(null);
		}
	}, [hoverOverRow, hoverOverPopup]);

	function normalizeCountryCodeLocal(value) {
		const raw = String(value || '').trim().toUpperCase();
		return /^[A-Z]{2}$/.test(raw) ? raw : null;
	}

	function inferCountryCodeFromLocaleLocal() {
		const localeCandidates = [];
		try {
			const resolved = Intl?.DateTimeFormat?.().resolvedOptions?.().locale;
			if (resolved) localeCandidates.push(resolved);
		} catch {
			// ignore
		}
		if (typeof navigator !== 'undefined' && typeof navigator?.language === 'string' && navigator.language.trim()) {
			localeCandidates.push(navigator.language);
		}

		for (const locale of localeCandidates) {
			const match = String(locale).match(/[-_](?<cc>[A-Za-z]{2})\b/);
			const code = normalizeCountryCodeLocal(match?.groups?.cc || match?.[1]);
			if (code) return code;
		}

		return 'DE';
	}

	// Resolve preferred country code (checks settings then falls back to locale 'DE')
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const api = typeof window !== 'undefined' ? window.electronAPI : null;
				if (!api || typeof api.invoke !== 'function') {
					setCountryCode('DE');
					return;
				}
				const settings = await api.invoke('settings:get');
				if (cancelled) return;
				const candidates = [
					settings?.store?.countryCode,
					settings?.display?.countryCode,
					settings?.account?.countryCode,
				];
				for (const candidate of candidates) {
					const normalized = normalizeCountryCodeLocal(candidate);
					if (normalized) {
						setCountryCode(normalized);
						return;
					}
				}
				setCountryCode(inferCountryCodeFromLocaleLocal());
			} catch {
				if (!cancelled) setCountryCode('DE');
			}
		})();

		return () => { cancelled = true; };
	}, []);

	const COUNTRY_TO_CURRENCY = {
		US: 'USD',
		DE: 'EUR',
		GB: 'GBP',
		JP: 'JPY',
		CA: 'CAD',
		AU: 'AUD',
		FR: 'EUR',
		ES: 'EUR',
		IT: 'EUR',
		CN: 'CNY',
		KR: 'KRW',
	};

	const COUNTRY_TO_LOCALE = {
		US: 'en-US',
		DE: 'de-DE',
		GB: 'en-GB',
		JP: 'ja-JP',
		CA: 'en-CA',
		AU: 'en-AU',
		FR: 'fr-FR',
		ES: 'es-ES',
		IT: 'it-IT',
		CN: 'zh-CN',
		KR: 'ko-KR',
	};

	function normalizePriceValueLocal(raw, platformHint = '') {
		const numeric = Number(raw);
		if (!Number.isFinite(numeric) || numeric <= 0) return null;

		const normalizedPlatform = String(platformHint || '').trim().toLowerCase();
		const looksLikeMinorUnits = Number.isInteger(numeric)
			&& (
				(normalizedPlatform === 'gog' || normalizedPlatform === 'gog.com')
					? numeric >= 100
					: numeric >= 1000
				);

		if (looksLikeMinorUnits) {
			return Number((numeric / 100).toFixed(2));
		}

		return Number(numeric.toFixed(2));
	}

	function formatPriceByCountry(price, cc) {
		if (price == null || !Number.isFinite(Number(price))) return '';
		const code = String(cc || 'DE').trim().toUpperCase() || 'DE';
		const currency = COUNTRY_TO_CURRENCY[code] || 'EUR';
		const locale = COUNTRY_TO_LOCALE[code] || 'en-US';
		try {
			return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(price));
		} catch {
			return `${currency} ${Number(price).toFixed(2)}`;
		}
	}

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
		setSelectedPlatforms(normalizedDefaultPlatforms);
		setPriceRange({ min: 0, max: 100 });
		setCurrentPage(1);
	};

	const toStoreGameUrl = (game) => {
		return buildStoreGameRoute(game, 'steam');
	};

	return (
		<div className="filtered-games-section w-full flex gap-4">
			{/* Game list */}
			<div className="filtered-games-main-panel w-[80%] bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 flex flex-col overflow-hidden">
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
						const titleKey = getGameTitleKey(game);
						const availablePlatforms = titleKey && availablePlatformsByTitle.has(titleKey)
							? [...availablePlatformsByTitle.get(titleKey)]
							: [];

						// Price formatting for listing (use countryCode with fallback)
						const platformHint = resolveStorePlatformFromGameStrict(game) || (availablePlatforms[0] || '');
						const rawPrice = game?.price ?? game?.cost ?? game?.price_overview ?? null;
						const normalizedPrice = normalizePriceValueLocal(rawPrice, platformHint) ;
						const explicitPriceLabel = String(game?.priceLabel || game?.formated_price || game?.formatted_price || '').trim();
						const formattedPrice = explicitPriceLabel || (normalizedPrice !== null ? formatPriceByCountry(normalizedPrice, countryCode) : '');

						return (
							<div
								key={gameId}
								className={`relative flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors border-b border-slate-700/30 ${
									isSelected ? 'bg-slate-700/50' : 'hover:bg-slate-700/30'
								}`}
									onClick={() => setSelectedGame(game)}
									onDoubleClick={() => navigate(toStoreGameUrl(game), { state: { game } })}
									onMouseEnter={(e) => { setHoveredGame(game); setHoverAnchorRect(e.currentTarget.getBoundingClientRect()); setHoverOverRow(true); }}
									onMouseLeave={() => setHoverOverRow(false)}
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
									<div className="flex items-center justify-between gap-2 mb-1">
										<h4 className="text-sm font-medium text-slate-100 truncate">{game.title || game.name}</h4>
										<div className="flex items-center gap-2 flex-shrink-0">
											{formattedPrice ? (
												<div className="text-xs text-slate-300 tabular-nums">{formattedPrice}</div>
											) : null}
											{availablePlatforms.length > 0 ? (
												<div className="flex items-center gap-1">
													{availablePlatforms.map((platform) => {
														const meta = getPlatformIconMeta(platform);
														return (
															<img
																key={`platform-icon-${gameId}-${platform}`}
																src={meta.img || ''}
																alt={getStorePlatformLabel(platform)}
																title={`Available on ${getStorePlatformLabel(platform)}`}
																className="w-5 h-5 object-contain rounded border border-slate-700/40"
																onError={(e) => { e.target.style.display = 'none'; }}
															/>
														);
													})}
												</div>
											) : null}
										</div>
									</div>
									<div className="flex flex-wrap gap-1">
										{visibleTags.map((tag) => (
											<span key={`tag-${tag}`} className="store-universal-tag">{tag}</span>
										))}
										{visibleGenres.map((genre) => (
											<span key={`genre-${genre}`} className="store-universal-tag">{genre}</span>
										))}
										{visibleTags.length === 0 && visibleGenres.length === 0 ? (
											<span className="store-universal-tag store-universal-tag-muted">No tags</span>
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
			{hoveredGame && hoverAnchorRect ? (
				<HoverPopupPortal
					anchorRect={hoverAnchorRect}
					game={hoveredGame}
					metadata={getMetadataForGame(hoveredGame)}
					onEnter={() => setHoverOverPopup(true)}
					onLeave={() => setHoverOverPopup(false)}
				/>
			) : null}
		</div>
	);
};

export default FilteredGamesSection;

// Hover popup portal renderer
function HoverPopupPortal({ anchorRect, game, metadata, onEnter, onLeave }) {
	const root = typeof document !== 'undefined' ? document.body : null;
	if (!root || !anchorRect || !game) return null;

	const top = Math.max(8, Math.round(anchorRect.top + window.scrollY));
	const left = Math.round(anchorRect.right + 12 + window.scrollX);

	return createPortal(
		<div
			onMouseEnter={onEnter}
			onMouseLeave={onLeave}
			style={{ position: 'absolute', top: `${top}px`, left: `${left}px`, width: 320, zIndex: 9999 }}
			className="bg-slate-800/90 backdrop-blur-sm rounded-lg border border-slate-700/60 p-3 shadow-lg"
		>
			<div className="flex items-start justify-between gap-2 mb-2">
				<h5 className="text-sm font-semibold text-slate-100 truncate">{game.title || game.name}</h5>
				<div className="flex items-center gap-2">
					{(() => {
						const platform = resolveStorePlatformFromGameStrict(game) || game?.platform_name || game?.platform;
						const meta = getPlatformIconMeta(platform);
						if (meta?.img) {
							return (
								<div className="flex items-center gap-2">
									<img src={meta.img} alt={getStorePlatformLabel(platform)} title={getStorePlatformLabel(platform)} className="w-6 h-6 object-contain rounded border border-slate-700/40" onError={e => e.target.style.display = 'none'} />
									<div className="text-xs text-slate-300">{getStorePlatformLabel(platform)}</div>
								</div>
							);
						}
						return (
							<span className={`inline-flex items-center justify-center w-6 h-6 rounded border text-xs font-semibold ${meta.tone}`} title={getStorePlatformLabel(platform)}>
								{meta.short}
							</span>
						);
					})()}
				</div>
			</div>
			<div className="w-full aspect-[16/9] rounded overflow-hidden bg-slate-900/50 mb-2">
				<img src={game.image || game.banner_img} alt={game.title || game.name} className="w-full h-full object-cover" onError={e => e.target.style.display = 'none'} />
			</div>
			<div className="mb-2 flex flex-wrap gap-1">
				{(metadata?.tags || []).slice(0, 3).map((tag) => (
					<span key={`hover-tag-${tag}`} className="store-universal-tag">{tag}</span>
				))}
			</div>
			<p className="text-xs text-slate-300 leading-relaxed line-clamp-3">{String(game.description || game.summary || game.short_description || '').trim() || 'No description available.'}</p>
		</div>,
		root,
	);
}

