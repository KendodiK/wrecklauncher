import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { runSmokeControllers } from '../../smokeControllers.js';
const fallback = {
	id: null,
	title: 'Game',
	heroImage: '',
	coverImage: '',
	description: '',
	tags: [],
	sites: [],
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
	const description =
		(typeof raw.short_description === 'string' && raw.short_description.trim() ? raw.short_description.trim() : '') ||
		(typeof details.minimum_requirements === 'string' && details.minimum_requirements.trim() ? details.minimum_requirements.trim() : '');

	const tags = Array.isArray(details.genres)
		? details.genres
				.map((g) => (g && typeof g === 'object' ? g.description : null))
				.filter((s) => typeof s === 'string' && s.trim())
		: [];

	return { id: appid, title, description, tags };
}

const GamePage = () => {

	const { id } = useParams();
	const location = useLocation();
	const [steamDetails, setSteamDetails] = useState(null);
	const [steamError, setSteamError] = useState('');

	const appId = useMemo(() => {
		const n = Number(id);
		if (Number.isFinite(n) && n > 0) return n;

		const state = location?.state ?? {};
		const fromState = Number(
			state?.appid ??
			state?.appId ??
			state?.id ??
			state?.app_id ??
			state?.game?.appid ??
			state?.game?.appId ??
			state?.game?.id ??
			state?.game?.app_id
		);
		if (Number.isFinite(fromState) && fromState > 0) return fromState;
		return null;
	}, [id, location?.state]);

	useEffect(() => {
		if (typeof window !== 'undefined') {
			// eslint-disable-next-line no-console
			console.log('[GamePage] route id:', id, 'derived appId:', appId, 'state:', safeJson(location?.state));
		}
	}, [id, appId, location?.state]);

	useEffect(() => {
		let cancelled = false;
		setSteamError('');
		setSteamDetails(null);

		(async () => {
			if (!appId) {
				setSteamError('Missing Steam AppID');
				return;
			}

			const api = typeof window !== 'undefined' ? window.electronAPI : null;
			const fn = api?.getSteamGameDetails;
			if (typeof fn !== 'function') {
				setSteamError('electronAPI.getSteamGameDetails is not available');
				return;
			}

			try {
				const details = await fn(appId, 'us');
				if (!cancelled) setSteamDetails(details);
			} catch (e) {
				if (!cancelled) setSteamError(e instanceof Error ? e.message : String(e));
			}
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

		const parsedSteam = parseSteamDetails(steamDetails);
		const merged = parsedSteam
			? {
				...stateBase,
				...parsedSteam,
				tags: parsedSteam.tags?.length ? parsedSteam.tags : stateBase.tags,
			}
			: stateBase;

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
	}, [location?.state, appId, steamDetails]);

	return (
		<div className="flex-1 px-3 py-3 text-slate-100">
			<div className="mb-4">
				<h1 className="text-2xl font-semibold">{model.title}</h1>
				<div className="text-sm text-slate-400">{model.id ?? ''}</div>
				{steamError ? <div className="mt-2 text-xs text-rose-300/90">{steamError}</div> : null}
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
				{/* Left: images + launchers/sites */}
				<div className="flex flex-col gap-4 min-w-0">
					<div className="rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur overflow-hidden">
						<div className="aspect-video bg-slate-800/30">
							<img
								src={model.heroImage}
								alt={`${model.title} screenshots`}
								className="h-full w-full object-cover"
								decoding="async"
								loading="eager"
								onError={(e) => {
									if (!appId) return;
									const imgs = steamImages(appId);
									const img = e.currentTarget;
									if (!imgs) return;
									img.onerror = null;
									img.src = imgs.header;
								}}
							/>
						</div>
					</div>

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

				{/* Right: cover + description + tags */}
				<aside className="rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur p-3 flex flex-col gap-3">
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

					<div className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
						<div className="text-sm font-semibold text-slate-100">Description</div>
						<p className="mt-2 text-sm text-slate-200/90 leading-relaxed whitespace-pre-wrap">
							{model.description}
						</p>
					</div>

					<div className="rounded-lg border border-slate-700/60 bg-slate-950/30 p-3">
						<div className="text-sm font-semibold text-slate-100">Tags</div>
						<div className="mt-2 flex flex-wrap gap-2">
							{(model.tags ?? []).map((t) => (
								<span
									key={t}
									className="text-xs rounded-full border border-slate-700/60 bg-slate-900/40 px-2 py-1 text-slate-100"
								>
									{t}
								</span>
							))}
						</div>
					</div>
				</aside>
			</div>
		</div>
	);
};

export default GamePage;

