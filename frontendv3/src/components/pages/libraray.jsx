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

function toSteamLibraryGame(game) {
	const appId = Number(game?.appid);
	if (!Number.isFinite(appId) || appId <= 0) return null;

	const playtimeMinutes = Number(game?.playtime_forever) || 0;
	const title = typeof game?.name === 'string' && game.name.trim() ? game.name.trim() : `Steam App ${appId}`;
	return {
		id: String(appId),
		appid: appId,
		title,
		launcherId: 'steam',
		coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
		heroUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
		genres: ['Steam'],
		tags: playtimeMinutes > 0 ? ['Owned', 'Played'] : ['Owned', 'Ready to install'],
		cracked: false,
		installedSize: `App ID ${appId}`,
		playtime: formatPlaytime(playtimeMinutes),
		playtimeMinutes,
		progress: Math.max(0, Math.min(Math.round(playtimeMinutes / 120), 100)),
		owned: true,
	};
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
		return libraryGames.filter((g) => g.owned === true);
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

				if (!steamSettings?.connected || !username) {
					if (!cancelled) {
						setLibraryGames([]);
						setActiveGameId('');
					}
					return;
				}

				const ownedSteamGames = await window.electronAPI.getOwnedGamesFromSteam(username);
				const normalizedGames = (ownedSteamGames || [])
					.map(toSteamLibraryGame)
					.filter(Boolean);

				if (!cancelled) {
					setLibraryGames(normalizedGames);
					setActiveLauncherId('steam');
					setActiveGameId(normalizedGames[0]?.id ?? '');
				}
			} catch (error) {
				console.error('Failed to load Steam library:', error);
				if (!cancelled) {
					setLibraryGames([]);
					setActiveGameId('');
					setErrorMessage(error instanceof Error ? error.message : 'Failed to load Steam library');
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
		if (scope === 'all') return ownedGames;
		return ownedGames.filter((g) => g.launcherId === activeLauncherId);
	}, [activeLauncherId, scope, ownedGames]);

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

		return result;
	}, [deferredSearch, hideZeroPlaytime, searchPool, sortBy]);

	const activeGame = useMemo(
		() => ownedGames.find((g) => g.id === activeGameId) ?? filteredGames[0] ?? null,
		[activeGameId, filteredGames, ownedGames],
	);

	useEffect(() => {
		if (!filteredGames.length) return;
		if (!filteredGames.some((g) => g.id === activeGameId)) {
			setActiveGameId(filteredGames[0].id);
		}
	}, [activeGameId, filteredGames]);

	const progressWidth = activeGame ? `${Math.max(3, Math.min(activeGame.progress, 100))}%` : '0%';
	const activeSteamAppId = Number(activeGame?.appid);
	const canUseSteamActions = Number.isFinite(activeSteamAppId) && activeSteamAppId > 0 && activeGame?.launcherId === 'steam';

	const resetFilters = () => {
		setScope('launcher');
		setSearch('');
		setSortBy('title-asc');
		setHideZeroPlaytime(false);
		setShowMenu(false);
	};

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

	const handleOpenGamePage = (game) => {
		const appId = Number(game?.appid ?? game?.id);
		if (!Number.isFinite(appId) || appId <= 0) return;
		navigate(`/game/${appId}`, { state: { game } });
	};

	const handleOpenStorePage = (game) => {
		const appId = Number(game?.appid ?? game?.id);
		if (!Number.isFinite(appId) || appId <= 0) return;
		navigate(`/store/game/steam/${appId}`, {
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
					<p>Loading your Steam library...</p>
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
				<h1 className="text-3xl font-bold text-white mb-1">My Library</h1>
				<p className="text-sm text-slate-300">
					{ownedGames.length} {ownedGames.length === 1 ? 'game' : 'games'} owned
					{scope === 'launcher' && searchPool.length > 0 && ` • ${searchPool.length} on ${activeLauncherId}`}
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
							{errorMessage || 'Connect Steam on the settings page to import your owned games.'}
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
							<button
								type="button"
								onClick={() => setSortBy('playtime-asc')}
								className={`library-scope-btn ${sortBy === 'playtime-asc' ? 'library-scope-btn-active' : ''}`}
							>
								Sort: Least Played
							</button>
							<button
								type="button"
								onClick={() => setHideZeroPlaytime((value) => !value)}
								className={`library-scope-btn ${hideZeroPlaytime ? 'library-scope-btn-active' : ''}`}
							>
								{hideZeroPlaytime ? 'Showing played titles only' : 'Show all playtime states'}
							</button>
							<button
								type="button"
								onClick={resetFilters}
								className="library-scope-btn"
							>
								Reset search and filters
							</button>
							<div className="library-scope-divider" />
							<button
								type="button"
								onClick={() => { setShowAllGames(true); setShowMenu(false); }}
								className="library-scope-btn-open-all"
							>
								Open All Games
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
							onOpenGamePage={handleOpenGamePage}
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
								className="library-play-btn"
								onClick={() => handleSteamAction('run')}
								disabled={!canUseSteamActions || actionState.busyAction !== ''}
							>
								{actionState.busyAction === 'run' ? 'OPENING' : 'PLAY'}
								<svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
									<path d="m8 5 11 7-11 7V5z" />
								</svg>
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

