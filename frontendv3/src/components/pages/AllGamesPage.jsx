import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FilteredGamesSection from '../store/FilteredGamesSection.jsx';
import {
	normalizeStorePlatformStrict,
	resolveStorePlatformFromGame,
	resolveStorePlatformFromGameStrict,
} from '../../utils/storeRouting.js';

function steamPoster(appid) {
	const id = Number(appid);
	if (!Number.isFinite(id) || id <= 0) return null;
	return `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
}

function pickSpecialsArray(payload) {
	if (Array.isArray(payload)) return payload;
	if (!payload || typeof payload !== 'object') return [];
	const candidates = [payload.items, payload.games, payload.data, payload.results];
	for (const candidate of candidates) {
		if (Array.isArray(candidate)) return candidate;
	}
	return [];
}

async function fetchAllGamesInBatches(api, batchSize = 20) {
	const all = [];
	let from = 0;

	while (true) {
		const batch = await api.getGames(from);
		if (!Array.isArray(batch) || batch.length === 0) break;
		all.push(...batch);
		if (batch.length < batchSize) break;
		from += batchSize;
	}

	return all;
}

function parseDiscountPercent(game) {
	const rawCandidates = [
		game.discount_percent,
		game.discountPercentage,
		game.discount_percentage,
		game.discount,
		game.percentage,
		game.sale_percentage,
	];

	for (const raw of rawCandidates) {
		const value = Number(raw);
		if (!Number.isFinite(value) || value <= 0) continue;
		return value <= 1 ? Math.round(value * 100) : Math.round(value);
	}

	return 0;
}

function normalizePriceValue(raw, platformHint = '') {
	const numeric = Number(raw);
	if (!Number.isFinite(numeric) || numeric <= 0) return 0;

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

function mapGameCard(game) {
	const normalizedPlatform =
		resolveStorePlatformFromGameStrict(game)
		|| resolveStorePlatformFromGame(game, 'steam');
	const normalizedPrice = normalizePriceValue(game.cost ?? game.price, normalizedPlatform);

	return {
		id: game.id,
		app_id: game.app_id,
		appid: game.app_id,
		title: game.name,
		name: game.name,
		image: game.banner_img || steamPoster(game.app_id || game.id),
		banner_img: game.banner_img,
		price: normalizedPrice,
		cost: normalizedPrice,
		description: game.description || '',
		platform: normalizedPlatform,
		platform_name: normalizedPlatform,
		genres: Array.isArray(game.genres) ? game.genres : [],
		tags: Array.isArray(game.tags) ? game.tags : [],
		discountPercent: parseDiscountPercent(game),
	};
}

function getGameIdentity(game) {
	const raw = game?.appid ?? game?.app_id ?? game?.id;
	return String(raw ?? '').trim();
}

function appendUniqueGames(prev, incoming) {
	if (!Array.isArray(incoming) || incoming.length === 0) return prev;
	const seen = new Set(prev.map((game) => getGameIdentity(game)).filter(Boolean));
	const next = [...prev];
	for (const game of incoming) {
		const key = getGameIdentity(game);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		next.push(game);
	}
	return next;
}

const AllGamesPage = () => {
	const navigate = useNavigate();
	const { platform } = useParams();
	const [allGames, setAllGames] = useState([]);
	const [isLoading, setIsLoading] = useState(true);

	const defaultSelectedPlatforms = useMemo(() => {
		const normalized = normalizeStorePlatformStrict(platform);
		if (normalized && ['steam', 'itchio', 'gog'].includes(normalized)) {
			return [normalized];
		}
		return [];
	}, [platform]);

	const handleRemoteResultsUpdate = useCallback((rows) => {
		if (!Array.isArray(rows) || rows.length < 1) return;
		const mapped = rows.map((row) => mapGameCard(row)).filter(Boolean);
		if (mapped.length < 1) return;
		setAllGames((prev) => appendUniqueGames(prev, mapped));
	}, []);

	useEffect(() => {
		let cancelled = false;

		const fetchGames = async () => {
			setIsLoading(true);
			try {
				const [gamesResult, featuredResult, discountedResult, upcomingResult] = await Promise.allSettled([
					fetchAllGamesInBatches(window.electronAPI, 20),
					window.electronAPI.FeaturedGames(0),
					window.electronAPI.DiscountedGames(0),
					window.electronAPI.ComingSoonGames(0),
				]);

				if (gamesResult.status !== 'fulfilled') {
					throw gamesResult.reason;
				}

				const gamesData = gamesResult.value || [];
				const featuredSpecials = featuredResult.status === 'fulfilled' ? pickSpecialsArray(featuredResult.value) : [];
				const discountedSpecials = discountedResult.status === 'fulfilled' ? pickSpecialsArray(discountedResult.value) : [];
				const upcomingSpecials = upcomingResult.status === 'fulfilled' ? pickSpecialsArray(upcomingResult.value) : [];

				const allSpecialIds = new Set(
					[...featuredSpecials, ...discountedSpecials, ...upcomingSpecials]
						.map((entry) => Number(entry?.app_id ?? entry?.appid ?? entry?.id))
						.filter((value) => Number.isFinite(value) && value > 0),
				);

				const mapped = gamesData.map((game) => mapGameCard(game));

				const prioritized = [...mapped].sort((a, b) => {
					const aId = Number(a?.app_id ?? a?.appid ?? a?.id);
					const bId = Number(b?.app_id ?? b?.appid ?? b?.id);

					const aSpecial = allSpecialIds.has(aId);
					const bSpecial = allSpecialIds.has(bId);
					if (aSpecial && !bSpecial) return -1;
					if (bSpecial && !aSpecial) return 1;
					return 0;
				});

				if (!cancelled) setAllGames(prioritized);
			} catch (error) {
				console.error('Failed to load all games page data:', error);
				if (!cancelled) setAllGames([]);
			} finally {
				if (!cancelled) setIsLoading(false);
			}
		};

		fetchGames();
		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<div className="flex-1 px-3 py-4">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-slate-100">All Games</h1>
					<p className="text-sm text-slate-400 mt-1">
						{isLoading ? 'Loading games...' : `${allGames.length} games available`}
					</p>
				</div>
				<button
					onClick={() => navigate(-1)}
					className="px-4 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/50 rounded-lg text-slate-200 transition-all text-sm"
				>
					← Back
				</button>
			</div>

			<FilteredGamesSection
				games={allGames}
				title="Browse Games"
				defaultSelectedPlatforms={defaultSelectedPlatforms}
				onRemoteResultsUpdate={handleRemoteResultsUpdate}
			/>
		</div>
	);
};

export default AllGamesPage;
