import React, { useEffect, useMemo, useState } from 'react';
import { launchers, games as allGames } from '../../data/mockLibraryData.js';
import LauncherTabs from '../library/LauncherTabs.jsx';
import LibraryGameStrip from '../library/LibraryGameStrip.jsx';
import AllGamesDrawer from '../library/AllGamesDrawer.jsx';

const LibraryPage = () => {
	const [activeLauncherId, setActiveLauncherId] = useState('steam');
	const [activeGameId, setActiveGameId] = useState(allGames[0]?.id ?? '');
	const [scope, setScope] = useState('launcher');
	const [search, setSearch] = useState('');
	const [showAllGames, setShowAllGames] = useState(false);
	const [showMenu, setShowMenu] = useState(false);

	const searchPool = useMemo(() => {
		if (scope === 'all') return allGames;
		return allGames.filter((g) => g.launcherId === activeLauncherId);
	}, [activeLauncherId, scope]);

	const filteredGames = useMemo(() => {
		const q = search.trim().toLowerCase();
		if (!q) return searchPool;
		return searchPool.filter((g) => {
			const text = [g.title, g.genres.join(' '), g.tags.join(' ')].join(' ').toLowerCase();
			return text.includes(q);
		});
	}, [search, searchPool]);

	const activeGame = useMemo(
		() => allGames.find((g) => g.id === activeGameId) ?? filteredGames[0] ?? null,
		[activeGameId, filteredGames],
	);

	useEffect(() => {
		if (!filteredGames.length) return;
		if (!filteredGames.some((g) => g.id === activeGameId)) {
			setActiveGameId(filteredGames[0].id);
		}
	}, [activeGameId, filteredGames]);

	const progressWidth = activeGame ? `${Math.max(3, Math.min(activeGame.progress, 100))}%` : '0%';

	return (
		<main className="library-page">
			{/* Dynamic hero background */}
			<div
				className="library-hero-bg"
				style={{ backgroundImage: `url(${activeGame?.heroUrl ?? ''})` }}
			/>
			<div className="library-hero-overlay" />

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
			</section>

			{/* Bottom dock: game strip + status bar */}
			<div className="library-bottom-dock">
				<div className="library-dock-inner">
					<div className="library-dock-strip-area group">
						<LibraryGameStrip
							games={filteredGames}
							activeGameId={activeGame?.id ?? ''}
							onSelect={(id) => setActiveGameId(id)}
						/>

						{/* Hover action buttons */}
						<div className="library-dock-actions">
							<button type="button" className="library-dock-action-primary">
								Open Game
							</button>
							<button type="button" className="library-dock-action-secondary">
								See In Store
							</button>
						</div>
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
							<button type="button" className="library-play-btn">
								PLAY
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
		</main>
	);
};

export default LibraryPage;

