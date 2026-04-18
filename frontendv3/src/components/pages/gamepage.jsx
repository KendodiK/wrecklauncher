import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

const fallback = {
	id: null,
	appid: null,
	title: 'Game',
	heroImage: '',
	coverImage: '',
	description: '',
	tags: [],
	sites: [],
	screenshots: [],
	minimumRequirements: '',
	installedSize: '',
	launcherId: 'steam',
	playtime: '',
	achievementCount: null,
};

function steamImages(appid) {
	const id = Number(appid);
	if (!Number.isFinite(id) || id <= 0) return null;
	return {
		hero: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_hero.jpg`,
		cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
		header: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/header.jpg`,
		capsule: `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/capsule_616x353.jpg`,
	};
}

function parseSteamDetails(details) {
	if (!details || typeof details !== 'object') return null;
	const appid = Number(details.appid);
	if (!Number.isFinite(appid) || appid <= 0) return null;

	const raw = details.raw && typeof details.raw === 'object' ? details.raw : {};
	const title = typeof details.name === 'string' && details.name.trim() ? details.name.trim() : `Steam App ${appid}`;
	const description = typeof raw.short_description === 'string' && raw.short_description.trim()
		? raw.short_description.trim()
		: '';
	const minimumRequirements = typeof details.minimum_requirements === 'string' && details.minimum_requirements.trim()
		? details.minimum_requirements.trim()
		: '';
	const tags = Array.isArray(details.genres)
		? details.genres
			.map((genre) => (genre && typeof genre === 'object' ? genre.description : null))
			.filter((value) => typeof value === 'string' && value.trim())
		: [];
	const screenshots = Array.isArray(raw.screenshots)
		? raw.screenshots
			.map((shot) => (shot && typeof shot === 'object' ? shot.path_full || shot.path_thumbnail : null))
			.filter((value) => typeof value === 'string' && value.trim())
		: [];

	return {
		id: appid,
		appid,
		title,
		description,
		tags,
		screenshots,
		minimumRequirements,
		achievementCount: Number(raw?.achievements?.total) || null,
	};
}

function normalizeLocationState(locationState) {
	const state = locationState ?? {};
	const game = state?.game && typeof state.game === 'object' ? state.game : state;
	return {
		...fallback,
		...game,
		title: game?.title || game?.name || fallback.title,
		coverImage: game?.coverImage || game?.coverUrl || game?.image || fallback.coverImage,
		heroImage: game?.heroImage || game?.heroUrl || fallback.heroImage,
		playtime: game?.playtime || fallback.playtime,
		achievementCount: Number(game?.achievementCount) || fallback.achievementCount,
		tags: Array.isArray(game?.tags) ? game.tags : fallback.tags,
		sites: Array.isArray(game?.sites) ? game.sites : fallback.sites,
		screenshots: Array.isArray(game?.screenshots) ? game.screenshots : fallback.screenshots,
	};
}

const GamePage = () => {
	const { id } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const [steamDetails, setSteamDetails] = useState(null);
	const [dbDetails, setDbDetails] = useState(null);
	const [steamError, setSteamError] = useState('');
	const [currentScreenshot, setCurrentScreenshot] = useState(0);
	const [loading, setLoading] = useState(true);

	const routeState = useMemo(() => normalizeLocationState(location?.state), [location?.state]);

	const appId = useMemo(() => {
		const routeId = Number(id);
		if (Number.isFinite(routeId) && routeId > 0) return routeId;

		const stateCandidates = [Number(routeState?.appid), Number(routeState?.id)];
		return stateCandidates.find((value) => Number.isFinite(value) && value > 0) ?? null;
	}, [id, routeState]);

	useEffect(() => {
		setCurrentScreenshot(0);
	}, [appId]);

	useEffect(() => {
		let cancelled = false;
		setSteamError('');
		setSteamDetails(null);
		setDbDetails(null);
		setLoading(true);

		(async () => {
			if (!appId) {
				setSteamError('Missing Steam App ID');
				setLoading(false);
				return;
			}

			const api = typeof window !== 'undefined' ? window.electronAPI : null;
			if (!api) {
				setSteamError('electronAPI is not available');
				setLoading(false);
				return;
			}

			const dbTask = (async () => {
				try {
					const dbData = await api.getAllDetailsByID(appId);
					if (!cancelled && dbData) setDbDetails(dbData);
				} catch (error) {
					console.warn('[GamePage] DB details unavailable:', error);
				}
			})();

			const steamTask = (async () => {
				try {
					const details = await api.getSteamGameDetails(appId);
					if (!cancelled) setSteamDetails(details);
				} catch (error) {
					if (!cancelled) setSteamError(error instanceof Error ? error.message : String(error));
				}
			})();

			await Promise.allSettled([dbTask, steamTask]);
			if (!cancelled) setLoading(false);
		})();

		return () => {
			cancelled = true;
		};
	}, [appId]);

	const model = useMemo(() => {
		const parsedSteam = parseSteamDetails(steamDetails);
		const parsedDb = dbDetails
			? {
				id: Number(dbDetails.app_id) || null,
				appid: Number(dbDetails.app_id) || null,
				title: dbDetails.name || routeState.title,
				description: dbDetails.description || '',
				tags: Array.isArray(dbDetails.genre_names) ? dbDetails.genre_names : [],
				minimumRequirements: dbDetails.minimum_requirements || '',
				achievementCount: routeState.achievementCount,
			}
			: null;

		const steam = appId ? steamImages(appId) : null;
		const merged = {
			...routeState,
			...(parsedDb || {}),
			...(parsedSteam || {}),
		};

		const sites = Array.isArray(merged.sites) && merged.sites.length
			? merged.sites
			: appId
				? [{ id: 'steam', label: 'Steam Store', href: `https://store.steampowered.com/app/${appId}` }]
				: [];

		return {
			...fallback,
			...merged,
			id: merged.id ?? appId ?? null,
			appid: merged.appid ?? appId ?? null,
			title: merged.title || fallback.title,
			coverImage: merged.coverImage || steam?.cover || steam?.capsule || fallback.coverImage,
			heroImage: merged.heroImage || steam?.hero || steam?.header || fallback.heroImage,
			description: merged.description || '',
			tags: Array.isArray(merged.tags) ? merged.tags : [],
			screenshots: Array.isArray(merged.screenshots) ? merged.screenshots : [],
			minimumRequirements: merged.minimumRequirements || '',
			playtime: merged.playtime || '',
			achievementCount: Number(merged.achievementCount) || null,
			sites,
		};
	}, [appId, dbDetails, routeState, steamDetails]);

	const screenshot = model.screenshots[currentScreenshot] || model.heroImage || model.coverImage;

	const handleLaunch = async () => {
		if (!appId) return;
		try {
			await window.electronAPI.runSteamGame(appId);
		} catch (error) {
			setSteamError(error instanceof Error ? error.message : String(error));
		}
	};

	const handleOpenStore = async () => {
		if (!appId) return;
		try {
			await window.electronAPI.storePageSteam(appId);
		} catch (error) {
			setSteamError(error instanceof Error ? error.message : String(error));
		}
	};

	return (
		<div className="flex-1 overflow-y-auto text-slate-100">
			<div className="relative min-h-full">
				<div
					className="absolute inset-x-0 top-0 h-[320px] bg-cover bg-center opacity-25"
					style={{ backgroundImage: screenshot ? `url(${screenshot})` : undefined }}
				/>
				<div className="absolute inset-x-0 top-0 h-[320px] bg-gradient-to-b from-slate-950/20 via-slate-950/75 to-slate-950" />

				<div className="relative px-4 py-5 md:px-8 md:py-6">
					<div className="mb-6 flex items-center justify-between gap-4">
						<button
							type="button"
							onClick={() => navigate(-1)}
							className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-800/70"
						>
							Back
						</button>
						<div className="text-right text-xs uppercase tracking-[0.18em] text-slate-400">
							{appId ? `App ID ${appId}` : 'No App ID'}
						</div>
					</div>

					<div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
						<div className="space-y-4">
							<div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/55 shadow-2xl shadow-black/25 backdrop-blur-sm">
								<div className="aspect-[3/4] bg-slate-800/40">
									{model.coverImage ? (
										<img
											src={model.coverImage}
											alt={`${model.title} cover`}
											className="h-full w-full object-cover"
										/>
									) : null}
								</div>
							</div>

							<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4 backdrop-blur-sm">
								<div className="flex flex-col gap-3">
									<button
										type="button"
										onClick={handleLaunch}
										disabled={!appId}
										className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
									>
										Play
									</button>
									<button
										type="button"
										onClick={handleOpenStore}
										disabled={!appId}
										className="rounded-xl border border-slate-700/70 bg-slate-950/60 px-4 py-3 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800/80 disabled:cursor-not-allowed disabled:opacity-50"
									>
										Open Steam Store
									</button>
								</div>
							</div>

							<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4 backdrop-blur-sm">
								<p className="text-xs uppercase tracking-[0.18em] text-slate-400">Quick Info</p>
								<div className="mt-3 space-y-2 text-sm text-slate-200">
									<div className="flex justify-between gap-3">
										<span className="text-slate-400">Launcher</span>
										<span className="capitalize">{model.launcherId || 'steam'}</span>
									</div>
									<div className="flex justify-between gap-3">
										<span className="text-slate-400">Playtime</span>
										<span>{model.playtime || 'Unknown'}</span>
									</div>
									<div className="flex justify-between gap-3">
										<span className="text-slate-400">Achievements</span>
										<span>{model.achievementCount ?? 'Unknown'}</span>
									</div>
									<div className="flex justify-between gap-3">
										<span className="text-slate-400">Installed Size</span>
										<span>{model.installedSize || 'Unknown'}</span>
									</div>
								</div>
							</div>
						</div>

						<div className="space-y-5">
							<div className="rounded-3xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm">
								<div className="flex flex-wrap items-start justify-between gap-4">
									<div>
										<p className="text-xs uppercase tracking-[0.2em] text-sky-300">Game Page</p>
										<h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">{model.title}</h1>
										<p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
											{loading ? 'Loading game details...' : model.description || 'No description available for this game yet.'}
										</p>
									</div>
									<div className="text-right text-xs text-slate-400">
										{loading ? 'Syncing Steam data' : steamDetails ? 'Steam data loaded' : 'Using cached data'}
									</div>
								</div>

								{steamError ? (
									<div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">
										{steamError}
									</div>
								) : null}

								{model.tags.length > 0 ? (
									<div className="mt-5 flex flex-wrap gap-2">
										{model.tags.map((tag) => (
											<span
												key={tag}
												className="rounded-full border border-slate-700/70 bg-slate-950/55 px-3 py-1 text-xs uppercase tracking-[0.14em] text-slate-200"
											>
												{tag}
											</span>
										))}
									</div>
								) : null}

								<div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
									<div className="rounded-2xl border border-slate-700/60 bg-slate-950/35 px-4 py-3">
										<p className="text-xs uppercase tracking-[0.18em] text-slate-400">Playtime</p>
										<p className="mt-2 text-2xl font-semibold text-white">{model.playtime || 'Unknown'}</p>
									</div>
									<div className="rounded-2xl border border-slate-700/60 bg-slate-950/35 px-4 py-3">
										<p className="text-xs uppercase tracking-[0.18em] text-slate-400">Achievements</p>
										<p className="mt-2 text-2xl font-semibold text-white">{model.achievementCount ?? 'Unknown'}</p>
									</div>
									<div className="rounded-2xl border border-slate-700/60 bg-slate-950/35 px-4 py-3">
										<p className="text-xs uppercase tracking-[0.18em] text-slate-400">Status</p>
										<p className="mt-2 text-2xl font-semibold text-white">Owned</p>
									</div>
								</div>
							</div>

							<div className="overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-900/45 backdrop-blur-sm">
								<div className="aspect-video bg-slate-800/30">
									{screenshot ? (
										<img
											src={screenshot}
											alt={`${model.title} screenshot`}
											className="h-full w-full object-cover"
										/>
									) : (
										<div className="flex h-full items-center justify-center text-slate-500">No screenshot available</div>
									)}
								</div>

								{model.screenshots.length > 1 ? (
									<div className="grid grid-cols-4 gap-2 border-t border-slate-800/80 p-3 md:grid-cols-6">
										{model.screenshots.slice(0, 6).map((shot, index) => (
											<button
												key={`${shot}-${index}`}
												type="button"
												onClick={() => setCurrentScreenshot(index)}
												className={`overflow-hidden rounded-xl border ${index === currentScreenshot ? 'border-sky-400' : 'border-slate-700/70'} bg-slate-950/40`}
											>
												<img src={shot} alt="" className="h-16 w-full object-cover" />
											</button>
										))}
									</div>
								) : null}
							</div>

							<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
								<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm">
									<h2 className="text-lg font-semibold text-white">About This Game</h2>
									<p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-300">
										{model.description || 'No description available.'}
									</p>
								</div>

								<div className="space-y-5">
									<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm">
										<h2 className="text-lg font-semibold text-white">Available On</h2>
										<div className="mt-3 flex flex-col gap-2">
											{model.sites.map((site, index) => (
												<a
													key={site.id ?? `${site.label}-${index}`}
													href={site.href ?? '#'}
													target="_blank"
													rel="noreferrer"
													className="rounded-xl border border-slate-700/70 bg-slate-950/45 px-4 py-3 text-sm text-slate-200 transition-colors hover:bg-slate-800/80"
												>
													{site.label ?? 'Store'}
												</a>
											))}
										</div>
									</div>

									{model.minimumRequirements ? (
										<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm">
											<h2 className="text-lg font-semibold text-white">Minimum Requirements</h2>
											<div
												className="mt-3 text-sm leading-6 text-slate-300 [&_ul]:ml-5 [&_ul]:list-disc [&_strong]:text-slate-100"
												dangerouslySetInnerHTML={{ __html: model.minimumRequirements }}
											/>
										</div>
									) : null}
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default GamePage;

