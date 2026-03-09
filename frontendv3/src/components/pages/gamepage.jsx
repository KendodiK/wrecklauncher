import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';

const fallback = {
	id: null,
	title: 'Game',
	heroImage: '',
	coverImage: '',
	description: '',
	tags: [],
	sites: [],
	screenshots: [],
	minimumRequirements: '',
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

function safeJson(value) {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function parseSteamDetails(details) {
	if (!details || typeof details !== 'object') return null;
	const appid = Number(details.appid);
	if (!Number.isFinite(appid) || appid <= 0) return null;

	const raw = details.raw && typeof details.raw === 'object' ? details.raw : {};
	const title = typeof details.name === 'string' && details.name.trim() ? details.name.trim() : `steam:${appid}`;
	
	// Get description from short_description
	const description = typeof raw.short_description === 'string' && raw.short_description.trim() 
		? raw.short_description.trim() 
		: '';

	// Get minimum requirements
	const minimumRequirements = typeof details.minimum_requirements === 'string' && details.minimum_requirements.trim()
		? details.minimum_requirements.trim()
		: '';

	// Extract tags/genres
	const tags = Array.isArray(details.genres)
		? details.genres
				.map((g) => (g && typeof g === 'object' ? g.description : null))
				.filter((s) => typeof s === 'string' && s.trim())
		: [];

	// Extract screenshots
	const screenshots = Array.isArray(raw.screenshots)
		? raw.screenshots
				.map((s) => (s && typeof s === 'object' ? s.path_full || s.path_thumbnail : null))
				.filter((url) => typeof url === 'string' && url.trim())
		: [];

	return { id: appid, title, description, tags, screenshots, minimumRequirements };
}

const GamePage = () => {
	const { id } = useParams();
	const location = useLocation();
	const [steamDetails, setSteamDetails] = useState(null);
	const [dbDetails, setDbDetails] = useState(null);
	const [steamError, setSteamError] = useState('');
	const [currentScreenshot, setCurrentScreenshot] = useState(0);
	const [loading, setLoading] = useState(true);

	const appId = useMemo(() => {
		const n = Number(id);
		if (Number.isFinite(n) && n > 0) return n;

		const state = location?.state ?? {};
		
		if (Number.isFinite(fromState) && fromState > 0) return fromState;
		return null;
	}, [id, location?.state]);

	useEffect(() => {
		if (typeof window !== 'undefined') {
			// eslint-disable-next-line no-console
			console.log('[GamePage] route id:', id, 'derived appId:', appId, 'state:', safeJson(location?.state));
		}
	}, [id, appId, location?.state]);

	// Fetch from database first, then Steam API
	useEffect(() => {
		let cancelled = false;
		setSteamError('');
		setSteamDetails(null);
		setDbDetails(null);
		setLoading(true);

		(async () => {
			if (!appId) {
				setSteamError('Missing Steam AppID');
				setLoading(false);
				return;
			}

			const api = typeof window !== 'undefined' ? window.electronAPI : null;
			if (!api) {
				setSteamError('electronAPI is not available');
				setLoading(false);
				return;
			}

			// Try to get from database first
			try {
				const dbData = await api.getAllDetailsByID(appId);
				if (!cancelled && dbData) {
					console.log('\n========== DATABASE DATA ==========');
					console.log('App ID:', dbData.app_id);
					console.log('Name:', dbData.name);
					console.log('Description:', dbData.description?.slice(0, 100) + '...');
					console.log('Genres:', dbData.genre_names);
					console.log('Min Requirements:', dbData.minimum_requirements ? 'YES' : 'NO');
					console.log('===================================\n');
					setDbDetails(dbData);
				}
			} catch (e) {
				console.warn('[GamePage] Failed to fetch from database:', e);
			}

			// Then fetch from Steam API for additional data (screenshots, etc.)
			if (typeof api.getSteamGameDetails === 'function') {
				try {
					const details = await api.getSteamGameDetails(appId, 'us');
					if (!cancelled) {
						console.log('\n========== STEAM API DATA ==========');
						console.log('App ID:', details?.appid);
						console.log('Name:', details?.name);
						console.log('Description:', details?.raw?.short_description?.slice(0, 100) + '...');
						console.log('Genres:', details?.genres?.map(g => g.description).join(', '));
						console.log('Screenshots:', details?.raw?.screenshots?.length || 0);
						console.log('Min Requirements:', details?.minimum_requirements ? 'YES' : 'NO');
						console.log('Price:', details?.price_overview ? `$${(details.price_overview / 100).toFixed(2)}` : 'Free/N/A');
						console.log('====================================\n');
						setSteamDetails(details);
					}
				} catch (e) {
					if (!cancelled) setSteamError(e instanceof Error ? e.message : String(e));
				}
			}

			if (!cancelled) setLoading(false);
		})();

		return () => {
			cancelled = true;
		};
	}, [appId]);

	const model = useMemo(() => {
		const state = location?.state ?? {};
		const stateBase = {
			...fallback,
			...(state.game ?? state ?? {}),
			sites: state.sites ?? state.launchers ?? fallback.sites,
			tags: state.tags ?? fallback.tags,
		};

		// Parse Steam API data
		const parsedSteam = parseSteamDetails(steamDetails);
		
		// Parse database data
		const parsedDb = dbDetails ? {
			id: dbDetails.app_id ? Number(dbDetails.app_id) : null,
			title: dbDetails.name || null,
			description: dbDetails.description || '',
			tags: Array.isArray(dbDetails.genre_names) ? dbDetails.genre_names : [],
			minimumRequirements: dbDetails.minimum_requirements || '',
			screenshots: [], // Database doesn't store screenshots yet
		} : null;

		// Merge all sources: state < db < steam (steam has priority for dynamic data)
		const merged = {
			...stateBase,
			...(parsedDb || {}),
			...(parsedSteam || {}),
			// Prefer Steam data for screenshots and detailed description
			screenshots: parsedSteam?.screenshots?.length ? parsedSteam.screenshots : (parsedDb?.screenshots || stateBase.screenshots),
			// Prefer database or Steam tags
			tags: parsedSteam?.tags?.length ? parsedSteam.tags : (parsedDb?.tags?.length ? parsedDb.tags : stateBase.tags),
			// Description: prefer Steam's short_description, fallback to DB
			description: parsedSteam?.description || parsedDb?.description || stateBase.description,
			// Requirements: prefer Steam, fallback to DB
			minimumRequirements: parsedSteam?.minimumRequirements || parsedDb?.minimumRequirements || stateBase.minimumRequirements,
		};

		const steam = appId ? steamImages(appId) : null;
		const sites =
			Array.isArray(merged.sites) && merged.sites.length
				? merged.sites
				: steam
					? [{ id: 'steam', label: 'Steam', href: `https://store.steampowered.com/app/${appId}` }]
					: merged.sites;

		return {
			...merged,
			id: merged.id ?? appId ?? null,
			heroImage: steam?.hero || steam?.header || stateBase.heroImage,
			coverImage: steam?.cover || steam?.capsule || stateBase.coverImage,
			sites,
		};
	}, [location?.state, appId, steamDetails, dbDetails]);

	return (
		<div className="flex-1 px-3 py-3 text-slate-100">
			<div className="mb-4">
				<h1 className="text-2xl font-semibold">{model.title}</h1>
				<div className="text-sm text-slate-400">
					{model.id ?? ''}
					{loading && <span className="ml-2 text-sky-400">Loading...</span>}
					{!loading && steamDetails && <span className="ml-2 text-emerald-400">✓ Scraped from Steam</span>}
					{!loading && dbDetails && <span className="ml-2 text-blue-400">✓ Database</span>}
				</div>
				{steamError ? <div className="mt-2 text-xs text-rose-300/90">{steamError}</div> : null}
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
				{/* Left: images + carousel + launchers/sites */}
				<div className="flex flex-col gap-4 min-w-0">
					{/* Screenshots Carousel */}
					{model.screenshots && model.screenshots.length > 0 && (
						<div className="rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur overflow-hidden">
							<div className="relative aspect-video bg-slate-800/30">
								<img
									src={model.screenshots[currentScreenshot]}
									alt={`${model.title} screenshot ${currentScreenshot + 1}`}
									className="h-full w-full object-cover"
									decoding="async"
									loading="lazy"
								/>
								{/* Navigation buttons */}
								{model.screenshots.length > 1 && (
									<>
										<button
											onClick={() => setCurrentScreenshot((prev) => 
												prev === 0 ? model.screenshots.length - 1 : prev - 1
											)}
											className="absolute left-2 top-1/2 -translate-y-1/2 bg-slate-900/80 hover:bg-slate-800/80 text-white rounded-full p-2 transition-colors"
											aria-label="Previous screenshot"
										>
											<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
											</svg>
										</button>
										<button
											onClick={() => setCurrentScreenshot((prev) => 
												prev === model.screenshots.length - 1 ? 0 : prev + 1
											)}
											className="absolute right-2 top-1/2 -translate-y-1/2 bg-slate-900/80 hover:bg-slate-800/80 text-white rounded-full p-2 transition-colors"
											aria-label="Next screenshot"
										>
											<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
											</svg>
										</button>
										{/* Indicator dots */}
										<div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
											{model.screenshots.map((_, idx) => (
												<button
													key={idx}
													onClick={() => setCurrentScreenshot(idx)}
													className={`w-2 h-2 rounded-full transition-colors ${
														idx === currentScreenshot ? 'bg-white' : 'bg-white/40 hover:bg-white/60'
													}`}
													aria-label={`Go to screenshot ${idx + 1}`}
												/>
											))}
										</div>
									</>
								)}
							</div>
						</div>
					)}

					{/* Available on section */}
					<div className="rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur p-3">
						<div className="text-sm font-semibold text-slate-100">Available on</div>
						<div className="mt-3 flex flex-col gap-2">
							{(model.sites ?? []).map((s, index) => (
								<a
									key={s.id ?? `${s.label}-${index}`}
									href={s.href ?? '#'}
									className="rounded-lg border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-sm text-slate-100 hover:bg-slate-900/40 transition-colors"
								>
									{s.label ?? 'Unknown'}
								</a>
							))}
						</div>
					</div>
				</div>

				{/* Right: cover + description + tags + requirements */}
				<aside className="rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur p-3 flex flex-col gap-3">
					{/* Cover image */}
					<div className="rounded-lg border border-slate-700/60 bg-slate-950/30 overflow-hidden">
						<div className="aspect-[3/4] bg-slate-800/30">
							<img
								src={model.coverImage}
								alt={`${model.title} cover`}
								className="h-full w-full object-cover"
								decoding="async"
								loading="lazy"
								onError={(e) => {
									if (!appId) return;
									const imgs = steamImages(appId);
									const img = e.currentTarget;
									if (!imgs) return;
									img.onerror = null;
									img.src = imgs.capsule;
								}}
							/>
						</div>
					</div>

					{/* Description */}
					<div className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
						<div className="text-sm font-semibold text-slate-100">Description</div>
						<p className="mt-2 text-sm text-slate-200/90 leading-relaxed whitespace-pre-wrap">
							{model.description || 'No description available'}
						</p>
					</div>

					{/* Tags */}
					{model.tags && model.tags.length > 0 && (
						<div className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
							<div className="text-sm font-semibold text-slate-100">Tags</div>
							<div className="mt-2 flex flex-wrap gap-2">
								{model.tags.map((t) => (
									<span
										key={t}
										className="text-xs rounded-full border border-slate-700/60 bg-slate-900/40 px-2 py-1 text-slate-100"
									>
										{t}
									</span>
								))}
							</div>
						</div>
					)}

					{/* Minimum Requirements */}
					{model.minimumRequirements && (
						<div className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
							<div className="text-sm font-semibold text-slate-100">Minimum Requirements</div>
							<div 
								className="mt-2 text-xs text-slate-200/80 leading-relaxed"
								dangerouslySetInnerHTML={{ __html: model.minimumRequirements }}
							/>
						</div>
					)}
				</aside>
			</div>
		</div>
	);
};

export default GamePage;

