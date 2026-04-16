import React, { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { launchers } from '../../data/mockLibraryData.js';
import LauncherTabs from '../library/LauncherTabs.jsx';
import LibraryGameStrip from '../library/LibraryGameStrip.jsx';
import AllGamesDrawer from '../library/AllGamesDrawer.jsx';

function formatPlaytime(minutes) {
	const totalMinutes = Number(minutes) || 0;
	const hours = Math.floor(totalMinutes / 60);
	const remainingMinutes = totalMinutes % 60;
	if (hours <= 0) return `${remainingMinutes}m`;
	if (remainingMinutes <= 0) return `${hours}h`;
	return `${hours}h ${remainingMinutes}m`;
}

function extractSteamAppId(game) {
	const appId = Number(game?.appid ?? game?.app_id ?? game?.appId ?? game?.id);
	if (!Number.isFinite(appId) || appId <= 0) return null;
	return appId;
}

function toSteamLibraryGame(game, installedAppIds) {
	const appId = extractSteamAppId(game);
	if (appId == null) return null;

	const playtimeMinutes = Number(game?.playtime_forever) || 0;
	const isInstalled = installedAppIds instanceof Set ? installedAppIds.has(appId) : false;
	const tags = ['Owned'];
	if (isInstalled) {
		tags.push('Installed');
	} else {
		tags.push('Ready to install');
	}
	if (playtimeMinutes > 0) {
		tags.push('Played');
	}
	const rawTitle =
		typeof game?.name === 'string' && game.name.trim()
			? game.name.trim()
			: typeof game?.title === 'string' && game.title.trim()
				? game.title.trim()
				: typeof game?.game_name === 'string' && game.game_name.trim()
					? game.game_name.trim()
					: '';
	const title = rawTitle || 'Unknown Steam title';
	return {
		id: String(appId),
		appid: appId,
		title,
		launcherId: 'steam',
		coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
		heroUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
		genres: ['Steam'],
		tags,
		cracked: false,
		installedSize: isInstalled ? 'Installed on this PC' : `App ID ${appId}`,
		playtime: formatPlaytime(playtimeMinutes),
		playtimeMinutes,
		progress: Math.max(0, Math.min(Math.round(playtimeMinutes / 120), 100)),
		installed: isInstalled,
		owned: true,
	};
}

function normalizeItchGameId(value) {
	const raw = String(value ?? '').trim();
	if (!raw) return null;
	const numeric = Number(raw);
	if (Number.isFinite(numeric) && numeric > 0) {
		return String(Math.trunc(numeric));
	}
	return raw.toLowerCase();
}

function extractItchOwnedGameId(ownedKey) {
	return normalizeItchGameId(
		ownedKey?.game_id ?? ownedKey?.game?.id ?? ownedKey?.download_key_id ?? ownedKey?.id,
	);
}

function extractItchInstalledGameId(installed) {
	return normalizeItchGameId(installed?.gameId ?? installed?.id);
}

function resolveLibraryCoverUrl(coverUrl, title, fallbackLabel = 'Game') {
	if (typeof coverUrl === 'string' && coverUrl.trim()) return coverUrl.trim();
	const label = String(title || fallbackLabel).trim() || fallbackLabel;
	return `https://via.placeholder.com/300x420?text=${encodeURIComponent(label)}`;
}

function toItchLibraryGame(ownedKey, installedById, normalizedItchId) {
	if (!normalizedItchId) return null;

	const game = ownedKey?.game && typeof ownedKey.game === 'object' ? ownedKey.game : {};
	const installed = installedById.get(normalizedItchId) || null;
	const numericAppId = Number(normalizedItchId);
	const appId = Number.isFinite(numericAppId) && numericAppId > 0 ? numericAppId : null;

	const title =
		typeof game?.title === 'string' && game.title.trim()
			? game.title.trim()
			: typeof installed?.title === 'string' && installed.title.trim()
				? installed.title.trim()
				: `itch:${normalizedItchId}`;

	const url =
		typeof game?.url === 'string' && game.url.trim()
			? game.url.trim()
			: typeof installed?.url === 'string' && installed.url.trim()
				? installed.url.trim()
				: null;

	const coverUrl = resolveLibraryCoverUrl(game?.cover_url ?? installed?.coverUrl ?? null, title, 'Itch');
	const isInstalled = !!installed;
	const tags = ['Owned'];
	if (isInstalled) {
		tags.push('Installed');
	} else {
		tags.push('Ready to install');
	}

	return {
		id: `itch:${normalizedItchId}`,
		appid: appId,
		title,
		launcherId: 'itch',
		coverUrl,
		heroUrl: coverUrl,
		genres: ['Itch.io'],
		tags,
		cracked: false,
		installedSize: isInstalled ? 'Installed on this PC' : `Game ID ${normalizedItchId}`,
		playtime: '0m',
		playtimeMinutes: 0,
		progress: isInstalled ? 100 : 0,
		installed: isInstalled,
		owned: true,
		platform_name: 'itchio',
		url,
	};
}

function toItchInstalledOnlyLibraryGame(installed, normalizedItchId) {
	if (!normalizedItchId) return null;

	const numericAppId = Number(normalizedItchId);
	const appId = Number.isFinite(numericAppId) && numericAppId > 0 ? numericAppId : null;
	const title =
		typeof installed?.title === 'string' && installed.title.trim()
			? installed.title.trim()
			: `itch:${normalizedItchId}`;
	const coverUrl = resolveLibraryCoverUrl(installed?.coverUrl ?? null, title, 'Itch');

	return {
		id: `itch:${normalizedItchId}`,
		appid: appId,
		title,
		launcherId: 'itch',
		coverUrl,
		heroUrl: coverUrl,
		genres: ['Itch.io'],
		tags: ['Installed', 'Local'],
		cracked: false,
		installedSize: 'Installed on this PC',
		playtime: '0m',
		playtimeMinutes: 0,
		progress: 100,
		installed: true,
		owned: true,
		platform_name: 'itchio',
		url: typeof installed?.url === 'string' && installed.url.trim() ? installed.url.trim() : null,
	};
}

function getLibraryGameKey(game) {
	if (!game || typeof game !== 'object') return null;
	const launcherId = String(game.launcherId || '').trim().toLowerCase();
	const appId = Number(game.appid);
	if (launcherId && Number.isFinite(appId) && appId > 0) {
		return `${launcherId}:${appId}`;
	}
	const id = String(game.id || '').trim();
	if (id) return `id:${id}`;
	const title = String(game.title || '').trim().toLowerCase();
	if (launcherId && title) return `${launcherId}:title:${title}`;
	return null;
}

function dedupeLibraryGames(games) {
	if (!Array.isArray(games)) return [];
	const seen = new Set();
	const out = [];
	for (const game of games) {
		if (!game) continue;
		const key = getLibraryGameKey(game) || `fallback:${out.length}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(game);
	}
	return out;
}

const LibraryPage = () => {
	const navigate = useNavigate();
	const [libraryGames, setLibraryGames] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [errorMessage, setErrorMessage] = useState('');

	const [activeLauncherId, setActiveLauncherId] = useState('steam');
	const [activeGameId, setActiveGameId] = useState('');
	const [scope, setScope] = useState('launcher');
	const [search, setSearch] = useState('');
	const deferredSearch = useDeferredValue(search);
	const [sortBy, setSortBy] = useState('title-asc');
	const [hideZeroPlaytime, setHideZeroPlaytime] = useState(false);
	const [showAllGames, setShowAllGames] = useState(false);
	const [showMenu, setShowMenu] = useState(false);
	const [actionState, setActionState] = useState({ busyAction: '', text: '', type: '' });

	const ownedGames = useMemo(() => {
		return dedupeLibraryGames(libraryGames.filter((g) => g.owned === true));
	}, [libraryGames]);

	useEffect(() => {
		let cancelled = false;

		const loadLibrary = async () => {
			setIsLoading(true);
			setErrorMessage('');

			try {
				const settings = await window.electronAPI.getSettings();
				const steamSettings = settings?.account?.platforms?.steam;
				const username = typeof steamSettings?.username === 'string' ? steamSettings.username.trim() : '';
				const itchSettings = settings?.account?.platforms?.itch;

				/** @type {any[]} */
				const mergedLibraryGames = [];
				const loadErrors = [];

				if (steamSettings?.connected && username) {
					try {
						const installedSteamGamesPromise =
							typeof window.electronAPI.getSteamInstalledGames === 'function'
								? window.electronAPI.getSteamInstalledGames()
								: window.electronAPI.invoke('steam:get-installed-games');

						const [ownedSteamGames, installedSteamGames] = await Promise.all([
							window.electronAPI.getOwnedGamesFromSteam(username),
							installedSteamGamesPromise.catch((error) => {
								console.warn('Failed to load installed Steam games:', error);
								return [];
							}),
						]);

						const installedAppIds = new Set(
							(Array.isArray(installedSteamGames) ? installedSteamGames : [])
								.map((game) => extractSteamAppId(game))
								.filter((appId) => appId != null),
						);

						const normalizedSteamGames = (ownedSteamGames || [])
							.map((game) => toSteamLibraryGame(game, installedAppIds))
							.filter(Boolean);

						mergedLibraryGames.push(...normalizedSteamGames);
					} catch (error) {
						console.error('Failed to load Steam library:', error);
						loadErrors.push(error instanceof Error ? error.message : 'Failed to load Steam library');
					}
				}

				if (itchSettings?.connected) {
					try {
						const installedItchGamesPromise =
							typeof window.electronAPI.getItchInstalledGames === 'function'
								? window.electronAPI.getItchInstalledGames()
								: window.electronAPI.invoke('itch:get-installed-games');

						const itchLibraryPromise =
							typeof window.electronAPI.getItchLibrary === 'function'
								? window.electronAPI.getItchLibrary()
								: window.electronAPI.invoke('itch:get-library');

						const [itchLibraryPayload, installedItchGames] = await Promise.all([
							itchLibraryPromise.catch((error) => {
								console.warn('Failed to load itch owned library:', error);
								return null;
							}),
							installedItchGamesPromise.catch((error) => {
								console.warn('Failed to load installed itch games:', error);
								return [];
							}),
						]);

						const installedList = Array.isArray(installedItchGames) ? installedItchGames : [];
						const installedById = new Map();
						for (const installed of installedList) {
							const id = extractItchInstalledGameId(installed);
							if (!id || installedById.has(id)) continue;
							installedById.set(id, installed);
						}

						const ownedKeys = Array.isArray(itchLibraryPayload?.owned_keys) ? itchLibraryPayload.owned_keys : [];
						const ownedMapped = [];
						const usedInstalledIds = new Set();

						for (const ownedKey of ownedKeys) {
							const id = extractItchOwnedGameId(ownedKey);
							const mapped = toItchLibraryGame(ownedKey, installedById, id);
							if (!mapped) continue;
							ownedMapped.push(mapped);
							if (id) usedInstalledIds.add(id);
						}

						const installedOnlyMapped = [];
						for (const installed of installedList) {
							const id = extractItchInstalledGameId(installed);
							if (!id || usedInstalledIds.has(id)) continue;
							const mapped = toItchInstalledOnlyLibraryGame(installed, id);
							if (!mapped) continue;
							installedOnlyMapped.push(mapped);
						}

						mergedLibraryGames.push(...ownedMapped, ...installedOnlyMapped);
					} catch (error) {
						console.error('Failed to load itch library:', error);
						loadErrors.push(error instanceof Error ? error.message : 'Failed to load itch library');
					}
				}

				const uniqueGames = dedupeLibraryGames(mergedLibraryGames);
				const launcherPriority = Array.isArray(launchers) ? launchers.map((launcher) => launcher.id) : [];
				const firstLauncherWithGames =
					launcherPriority.find((launcherId) => uniqueGames.some((game) => game.launcherId === launcherId))
					|| uniqueGames[0]?.launcherId
					|| 'steam';

				if (!cancelled) {
					setLibraryGames(uniqueGames);
					setActiveLauncherId(firstLauncherWithGames);
					setActiveGameId(uniqueGames[0]?.id ?? '');
					if (!uniqueGames.length && loadErrors.length) {
						setErrorMessage(loadErrors.join(' | '));
					}
				}
			} catch (error) {
				console.error('Failed to load library:', error);
				if (!cancelled) {
					setLibraryGames([]);
					setActiveGameId('');
					setErrorMessage(error instanceof Error ? error.message : 'Failed to load library');
				}
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		};

		loadLibrary();

		return () => {
			cancelled = true;
		};
	}, []);

	const searchPool = useMemo(() => {
		const q = deferredSearch.trim();
		if (!q) return ownedGames;
		if (scope === 'all') return ownedGames;
		return ownedGames.filter((g) => g.launcherId === activeLauncherId);
	}, [activeLauncherId, deferredSearch, scope, ownedGames]);

	const filteredGames = useMemo(() => {
		let result = [...searchPool];

		if (hideZeroPlaytime) {
			result = result.filter((g) => Number(g.playtimeMinutes) > 0);
		}

		const q = deferredSearch.trim().toLowerCase();
		if (q) {
			result = result.filter((g) => {
				const text = [g.title, g.genres.join(' '), g.tags.join(' ')].join(' ').toLowerCase();
				return text.includes(q);
			});
		}

		result.sort((left, right) => {
			if (sortBy === 'playtime-desc') {
				return Number(right.playtimeMinutes || 0) - Number(left.playtimeMinutes || 0);
			}
			if (sortBy === 'playtime-asc') {
				return Number(left.playtimeMinutes || 0) - Number(right.playtimeMinutes || 0);
			}
			return left.title.localeCompare(right.title);
		});

		return dedupeLibraryGames(result);
	}, [deferredSearch, hideZeroPlaytime, searchPool, sortBy]);

	const activeGame = useMemo(() => {
		if (!filteredGames.length) return null;
		return filteredGames.find((g) => g.id === activeGameId) ?? filteredGames[0] ?? null;
	}, [activeGameId, filteredGames]);

	useEffect(() => {
		if (!filteredGames.length) {
			if (activeGameId !== '') setActiveGameId('');
			return;
		}
		if (!filteredGames.some((g) => g.id === activeGameId)) {
			setActiveGameId(filteredGames[0].id);
		}
	}, [activeGameId, filteredGames]);

	const progressWidth = activeGame ? `${Math.max(3, Math.min(activeGame.progress, 100))}%` : '0%';
	const activeSteamAppId = Number(activeGame?.appid);
	const canUseSteamActions = Number.isFinite(activeSteamAppId) && activeSteamAppId > 0 && activeGame?.launcherId === 'steam';
	const isActiveGameInstalled = activeGame?.installed === true;
	const primarySteamAction = isActiveGameInstalled ? 'run' : 'install';

	const handleSteamAction = async (action) => {
		if (!canUseSteamActions) {
			setActionState({
				busyAction: '',
				text: 'Steam actions are only available for Steam library items.',
				type: 'error',
			});
			return;
		}

		const actions = {
			run: {
				fn: () => window.electronAPI.runSteamGame(activeSteamAppId),
				success: `Opening ${activeGame?.title || 'game'} in Steam.`,
			},
			install: {
				fn: () => window.electronAPI.installSteamGame(activeSteamAppId),
				success: `Opened Steam install prompt for ${activeGame?.title || 'game'}.`,
			},
			delete: {
				fn: () => window.electronAPI.deleteSteamGame(activeSteamAppId),
				success: `Opened Steam uninstall prompt for ${activeGame?.title || 'game'}.`,
			},
			store: {
				fn: () => window.electronAPI.storePageSteam(activeSteamAppId),
				success: `Opened the Steam store page for ${activeGame?.title || 'game'}.`,
			},
		};

		const selectedAction = actions[action];
		if (!selectedAction) return;

		try {
			setActionState({ busyAction: action, text: '', type: '' });
			await selectedAction.fn();
			setActionState({ busyAction: '', text: selectedAction.success, type: 'success' });
		} catch (error) {
			console.error(`Failed to ${action} Steam game:`, error);
			setActionState({
				busyAction: '',
				text: error instanceof Error ? error.message : `Failed to ${action} Steam game.`,
				type: 'error',
			});
		}
	};

	const handleOpenStorePage = (game) => {
		const appId = Number(game?.appid ?? game?.id);
		if (!Number.isFinite(appId) || appId <= 0) return;
		const numericPlatformId = Number(game?.platform_id ?? game?.platformId);
		let routePlatform = 'steam';
		if (Number.isFinite(numericPlatformId)) {
			if (numericPlatformId === 2) routePlatform = 'gog';
			else if (numericPlatformId === 3) routePlatform = 'itchio';
			else if (numericPlatformId === 4) routePlatform = 'epic';
		} else {
			const rawPlatform = String(game?.launcherId || game?.platform_name || game?.platform || 'steam').trim().toLowerCase();
			if (rawPlatform === 'itch' || rawPlatform === 'itch.io' || rawPlatform === 'itchio') routePlatform = 'itchio';
			else if (rawPlatform === 'gog') routePlatform = 'gog';
			else if (rawPlatform === 'epic games' || rawPlatform === 'epic_games' || rawPlatform === 'epic') routePlatform = 'epic';
			else routePlatform = rawPlatform || 'steam';
		}
		navigate(`/store/game/${encodeURIComponent(routePlatform)}/${appId}`, {
			state: {
				game,
			},
		});
	};

	if (isLoading) {
		return (
			<main className="library-page flex items-center justify-center">
				<div className="text-center text-white">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
					<p>Loading your library...</p>
				</div>
			</main>
		);
	}

	return (
		<main className="library-page">
			{/* Dynamic hero background */}
			<div
				className="library-hero-bg"
				style={{ backgroundImage: `url(${activeGame?.heroUrl ?? ''})` }}
			/>
			<div className="library-hero-overlay" />

			{/* Library header with owned games count */}
			<div className="absolute top-4 left-6 z-10">
				
				<p className="text-sm text-slate-300">
					{ownedGames.length} {ownedGames.length === 1 ? 'game' : 'games'} owned
					{scope === 'launcher' && deferredSearch.trim() !== '' && searchPool.length > 0 && ` • ${searchPool.length} on ${activeLauncherId}`}
				</p>
			</div>

			{/* Empty state when no owned games */}
			{ownedGames.length === 0 ? (
				<div className="flex items-center justify-center h-full">
					<div className="text-center text-white">
						<svg className="w-24 h-24 mx-auto mb-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
						</svg>
						<h2 className="text-2xl font-semibold mb-2">No games in your library</h2>
						<p className="text-slate-400 mb-2">
							{errorMessage || 'Connect Steam or Itch.io on the settings page to import your games.'}
						</p>
						<p className="text-slate-500 mb-6">Start by connecting your gaming platforms or browse the store</p>
						<div className="flex gap-3 justify-center">
							<button
								onClick={() => window.location.hash = '/settings'}
								className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
							>
								Connect Platforms
							</button>
							<button
								onClick={() => window.location.hash = '/store'}
								className="px-6 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg font-medium transition-colors"
							>
								Browse Store
							</button>
						</div>
					</div>
				</div>
			) : (
				<>
					{/* Control board: search + launcher tabs */}
			<section className="library-control-board">
				<header className="library-control-header">
					<label className="library-search-label">
						<span className="library-search-hint">Search</span>
						<input
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							placeholder="title, genre, tag"
							className="library-search-input"
						/>
					</label>

					<button
						type="button"
						className="library-menu-btn"
						onClick={() => setShowMenu((v) => !v)}
						aria-label="Open library menu"
					>
						<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
							<path d="M5 7h14M5 12h14M5 17h14" />
						</svg>
					</button>

					{showMenu ? (
						<div className="library-scope-menu">
							<p className="library-scope-menu-label">Search Scope</p>
							<button
								type="button"
								onClick={() => { setScope('launcher'); setShowMenu(false); }}
								className={`library-scope-btn ${scope === 'launcher' ? 'library-scope-btn-active' : ''}`}
							>
								This Launcher
							</button>
							<button
								type="button"
								onClick={() => { setScope('all'); setShowMenu(false); }}
								className={`library-scope-btn ${scope === 'all' ? 'library-scope-btn-active' : ''}`}
							>
								All Launchers
							</button>
							<div className="library-scope-divider" />
							<p className="library-scope-menu-label">Filters</p>
							<button
								type="button"
								onClick={() => setSortBy('title-asc')}
								className={`library-scope-btn ${sortBy === 'title-asc' ? 'library-scope-btn-active' : ''}`}
							>
								Sort: Title A-Z
							</button>
							<button
								type="button"
								onClick={() => setSortBy('playtime-desc')}
								className={`library-scope-btn ${sortBy === 'playtime-desc' ? 'library-scope-btn-active' : ''}`}
							>
								Sort: Most Played
							</button>
						</div>
					) : null}
				</header>

				<LauncherTabs
					launchers={launchers}
					activeLauncherId={activeLauncherId}
					onChange={setActiveLauncherId}
				/>
				{actionState.text ? (
					<p className={`library-action-notice ${actionState.type === 'error' ? 'library-action-notice-error' : ''}`}>
						{actionState.text}
					</p>
				) : null}
			</section>

			{/* Bottom dock: game strip + status bar */}
			<div className="library-bottom-dock">
				<div className="library-dock-inner">
					<div className="library-dock-strip-area group">
						<LibraryGameStrip
							games={filteredGames}
							activeGameId={activeGame?.id ?? ''}
							onSelect={(id) => setActiveGameId(id)}
							onOpenStore={handleOpenStorePage}
						/>
					</div>

					{/* Status bar */}
					<div className="library-status-bar group">
						<div className="library-status-left">
							<h2 className="library-status-title">{activeGame?.title ?? 'No game'}</h2>
							<p className="library-status-launcher">{activeGame?.launcherId ?? ''}</p>
							<div className="library-status-tags">
								{(activeGame?.tags ?? []).slice(0, 3).map((tag) => (
									<span key={tag} className="library-status-tag">{tag}</span>
								))}
							</div>
						</div>

						<div className="library-status-right">
							<p className="library-status-size">{activeGame?.installedSize ?? '0 MB'}</p>
							<button
								type="button"
								className={`library-play-btn ${isActiveGameInstalled ? '' : 'library-play-btn-download'}`}
								onClick={() => handleSteamAction(primarySteamAction)}
								disabled={!canUseSteamActions || actionState.busyAction !== ''}
							>
								{actionState.busyAction === primarySteamAction
									? isActiveGameInstalled
										? 'OPENING'
										: 'DOWNLOADING'
									: isActiveGameInstalled
										? 'PLAY'
										: 'DOWNLOAD'}
								{isActiveGameInstalled ? (
									<svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
										<path d="m8 5 11 7-11 7V5z" />
									</svg>
								) : (
									<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
										<path d="M12 4v10m0 0 4-4m-4 4-4-4M4 19h16" />
									</svg>
								)}
							</button>
						</div>

						<div className="library-status-meta">
							<span>{activeGame?.playtime ?? '0h'}</span>
							<span>{activeGame?.progress ?? 0}/100</span>
						</div>
						<div className="library-progress-line">
							<div className="library-progress-fill" style={{ width: progressWidth }} />
						</div>
					</div>
				</div>
			</div>

			{/* All games drawer */}
			<AllGamesDrawer
				open={showAllGames}
				games={filteredGames}
				launchers={launchers}
				activeGameId={activeGame?.id ?? ''}
				onClose={() => setShowAllGames(false)}
				onSelectGame={setActiveGameId}
			/>
				</>
			)}
		</main>
	);
};

export default LibraryPage;

