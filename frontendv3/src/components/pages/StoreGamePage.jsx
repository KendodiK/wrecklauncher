import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

const fallback = {
	id: null,
	appid: null,
	title: 'Store Game',
	heroImage: '',
	coverImage: '',
	description: '',
	longDescription: '',
	tags: [],
	sites: [],
	screenshots: [],
	minimumRequirements: '',
	price: null,
	platform_name: 'steam',
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
		title: details.name || fallback.title,
		description: raw.short_description || '',
		longDescription: raw.detailed_description || raw.about_the_game || raw.short_description || '',
		tags,
		screenshots,
		minimumRequirements: details.minimum_requirements || '',
		price: typeof details.price_overview === 'number' ? details.price_overview / 100 : null,
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
		longDescription: game?.longDescription || fallback.longDescription,
		tags: Array.isArray(game?.tags) ? game.tags : fallback.tags,
		sites: Array.isArray(game?.sites) ? game.sites : fallback.sites,
		screenshots: Array.isArray(game?.screenshots) ? game.screenshots : fallback.screenshots,
		price: typeof game?.price === 'number' ? game.price : fallback.price,
	};
}

const StoreGamePage = () => {
	const { id } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const [steamDetails, setSteamDetails] = useState(null);
	const [dbDetails, setDbDetails] = useState(null);
	const [errorMessage, setErrorMessage] = useState('');
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
		setSteamDetails(null);
		setDbDetails(null);
		setErrorMessage('');
		setLoading(true);

		(async () => {
			if (!appId) {
				setErrorMessage('Missing store game ID');
				setLoading(false);
				return;
			}

			const api = typeof window !== 'undefined' ? window.electronAPI : null;
			if (!api) {
				setErrorMessage('electronAPI is not available');
				setLoading(false);
				return;
			}

			try {
				const dbData = await api.getAllDetailsByID(appId);
				if (!cancelled && dbData) setDbDetails(dbData);
			} catch {
				// optional enrichment only
			}

			try {
				const details = await api.getSteamGameDetails(appId, 'us');
				if (!cancelled) setSteamDetails(details);
			} catch (error) {
				if (!cancelled) setErrorMessage(error instanceof Error ? error.message : String(error));
			} finally {
				if (!cancelled) setLoading(false);
			}
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
				longDescription: dbDetails.description || routeState.longDescription,
				tags: Array.isArray(dbDetails.genre_names) ? dbDetails.genre_names : [],
				minimumRequirements: dbDetails.minimum_requirements || '',
				price: typeof dbDetails.cost === 'number' ? dbDetails.cost : routeState.price,
			}
			: null;

		const steam = appId ? steamImages(appId) : null;
		const merged = {
			...routeState,
			...(parsedDb || {}),
			...(parsedSteam || {}),
		};

		return {
			...fallback,
			...merged,
			id: merged.id ?? appId ?? null,
			appid: merged.appid ?? appId ?? null,
			coverImage: merged.coverImage || steam?.cover || steam?.capsule || fallback.coverImage,
			heroImage: merged.heroImage || steam?.hero || steam?.header || fallback.heroImage,
			longDescription: merged.longDescription || merged.description || '',
			tags: Array.isArray(merged.tags) ? merged.tags : [],
			screenshots: Array.isArray(merged.screenshots) ? merged.screenshots : [],
			price: typeof merged.price === 'number' ? merged.price : null,
			sites: Array.isArray(merged.sites) && merged.sites.length
				? merged.sites
				: appId
					? [{ id: 'steam', label: 'Steam Store', href: `https://store.steampowered.com/app/${appId}` }]
					: [],
		};
	}, [appId, dbDetails, routeState, steamDetails]);

	const screenshot = model.screenshots[currentScreenshot] || model.heroImage || model.coverImage;

	const handleOpenExternalStore = async () => {
		if (!appId) return;
		try {
			await window.electronAPI.storePageSteam(appId);
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : String(error));
		}
	};

	const handleStartDownload = () => {
		setErrorMessage('Download flow for free store games is not wired yet.');
	};

	return (
		<div className="flex-1 overflow-y-auto text-slate-100">
			<div className="relative min-h-full">
				<div className="absolute inset-x-0 top-0 h-[340px] bg-cover bg-center opacity-30" style={{ backgroundImage: screenshot ? `url(${screenshot})` : undefined }} />
				<div className="absolute inset-x-0 top-0 h-[340px] bg-gradient-to-b from-slate-950/10 via-slate-950/75 to-slate-950" />

				<div className="relative px-4 py-5 md:px-8 md:py-6">
					<div className="mb-6 flex items-center justify-between gap-4">
						<button
							type="button"
							onClick={() => navigate(-1)}
							className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-800/70"
						>
							Back To Store
						</button>
						<div className="text-right text-xs uppercase tracking-[0.18em] text-slate-400">Store Page</div>
					</div>

					<div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
						<div className="space-y-4">
							<div className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/55 shadow-2xl shadow-black/25 backdrop-blur-sm">
								<div className="aspect-[3/4] bg-slate-800/40">
									{model.coverImage ? <img src={model.coverImage} alt={`${model.title} cover`} className="h-full w-full object-cover" /> : null}
								</div>
							</div>

							<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4 backdrop-blur-sm">
								<div className="flex flex-col gap-3">
									<div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
										<p className="text-xs uppercase tracking-[0.18em] text-emerald-300">Price</p>
										<p className="mt-2 text-3xl font-semibold text-white">
											{model.price === 0 ? 'Free' : typeof model.price === 'number' ? `$${model.price.toFixed(2)}` : 'Check Store'}
										</p>
									</div>
									<button
										type="button"
										onClick={model.price === 0 ? handleStartDownload : handleOpenExternalStore}
										disabled={!appId}
										className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
									>
										{model.price === 0 ? 'Start Download' : 'Open In Steam'}
									</button>
								</div>
							</div>
						</div>

						<div className="space-y-5">
							<div className="rounded-3xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm">
								<p className="text-xs uppercase tracking-[0.2em] text-sky-300">Store</p>
								<h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">{model.title}</h1>
								<p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
									{loading ? 'Loading store information...' : model.description || 'No store description available yet.'}
								</p>
								{errorMessage ? <div className="mt-4 rounded-xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm text-rose-200">{errorMessage}</div> : null}
								{model.tags.length > 0 ? (
									<div className="mt-5 flex flex-wrap gap-2">
										{model.tags.map((tag) => (
											<span key={tag} className="rounded-full border border-slate-700/70 bg-slate-950/55 px-3 py-1 text-xs uppercase tracking-[0.14em] text-slate-200">{tag}</span>
										))}
									</div>
								) : null}
							</div>

							<div className="overflow-hidden rounded-3xl border border-slate-700/60 bg-slate-900/45 backdrop-blur-sm">
								<div className="aspect-video bg-slate-800/30">
									{screenshot ? <img src={screenshot} alt={`${model.title} screenshot`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-500">No screenshot available</div>}
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
									<h2 className="text-lg font-semibold text-white">About This Store Listing</h2>
									<p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-300">{model.description || 'No description available.'}</p>
								</div>

								<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm xl:col-span-2">
									<h2 className="text-lg font-semibold text-white">Long Description</h2>
									<div
										className="mt-3 text-sm leading-7 text-slate-300 [&_ul]:ml-5 [&_ul]:list-disc [&_strong]:text-slate-100"
										dangerouslySetInnerHTML={{ __html: model.longDescription || model.description || 'No long description available.' }}
									/>
								</div>

								<div className="space-y-5">
									<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm">
										<h2 className="text-lg font-semibold text-white">Available On</h2>
										<div className="mt-3 flex flex-col gap-2">
											{model.sites.map((site, index) => (
												<a key={site.id ?? `${site.label}-${index}`} href={site.href ?? '#'} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-700/70 bg-slate-950/45 px-4 py-3 text-sm text-slate-200 transition-colors hover:bg-slate-800/80">{site.label ?? 'Store'}</a>
											))}
										</div>
									</div>

									{model.minimumRequirements ? (
										<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm">
											<h2 className="text-lg font-semibold text-white">Requirements</h2>
											<div className="mt-3 text-sm leading-6 text-slate-300 [&_ul]:ml-5 [&_ul]:list-disc [&_strong]:text-slate-100" dangerouslySetInnerHTML={{ __html: model.minimumRequirements }} />
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

export default StoreGamePage;