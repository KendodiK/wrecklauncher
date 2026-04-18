import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { getStorePlatformLabel, normalizeStorePlatform } from '../../utils/storeRouting.js';
import { useDownloadManager } from '../../context/DownloadManagerContext.jsx';

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
	priceLabel: null,
	platform_name: 'steam',
	pirate_links: [],
};

function normalizeCountryCode(value) {
	const raw = String(value || '').trim().toUpperCase();
	return /^[A-Z]{2}$/.test(raw) ? raw : null;
}

function inferCountryCodeFromLocale() {
	const localeCandidates = [];
	try {
		const resolved = Intl?.DateTimeFormat?.().resolvedOptions?.().locale;
		if (resolved) localeCandidates.push(resolved);
	} catch {
		// ignore
	}
	if (typeof navigator !== 'undefined' && navigator?.language) {
		localeCandidates.push(navigator.language);
	}

	for (const locale of localeCandidates) {
		const match = String(locale).match(/[-_](?<cc>[A-Za-z]{2})\b/);
		const code = normalizeCountryCode(match?.groups?.cc || match?.[1]);
		if (code) return code;
	}

	return 'US';
}

async function resolvePreferredCountryCode(api) {
	try {
		const settings = await api?.getSettings?.();
		const candidates = [
			settings?.display?.countryCode,
			settings?.store?.countryCode,
			settings?.account?.countryCode,
		];
		for (const candidate of candidates) {
			const normalized = normalizeCountryCode(candidate);
			if (normalized) return normalized;
		}
	} catch {
		// ignore and use locale fallback
	}

	return inferCountryCodeFromLocale();
}

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

function normalizePlatformName(value) {
	return normalizeStorePlatform(value, 'steam');
}

function hasFilledText(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function pickFirstFilledText(...values) {
	for (const value of values) {
		if (hasFilledText(value)) return String(value).trim();
	}
	return '';
}

function pickFirstFiniteNumber(...values) {
	for (const value of values) {
		const numeric = Number(value);
		if (Number.isFinite(numeric)) return numeric;
	}
	return null;
}

function normalizePriceValue(raw, platformHint = '') {
	const numeric = Number(raw);
	if (!Number.isFinite(numeric) || numeric < 0) return null;

	const normalizedPlatform = String(platformHint || '').trim().toLowerCase();
	const looksLikeMinorUnits = Number.isInteger(numeric)
		&& (
			(normalizedPlatform === 'gog' || normalizedPlatform === 'gog.com')
				? numeric >= 100
				: numeric >= 1000
		);

	// Some sources return integer minor units (cents), normalize to major units.
	if (looksLikeMinorUnits) {
		return Number((numeric / 100).toFixed(2));
	}

	return Number(numeric.toFixed(2));
}

function formatCurrencyPrice(raw, platformHint = '') {
	const normalized = normalizePriceValue(raw, platformHint);
	if (normalized == null) return '';
	return `$${normalized.toFixed(2)}`;
}

function pickFirstNonEmptyArray(...values) {
	for (const value of values) {
		if (!Array.isArray(value)) continue;
		if (value.length < 1) continue;
		return value;
	}
	return [];
}

function pickFirstPositiveNumber(...values) {
	for (const value of values) {
		const numeric = Number(value);
		if (Number.isFinite(numeric) && numeric > 0) return numeric;
	}
	return null;
}

function normalizeTagValue(value) {
	if (value == null) return '';

	if (typeof value === 'object') {
		const candidates = [
			value.description,
			value.genre,
			value.name,
			value.tag,
			value.label,
			value.title,
		];
		for (const candidate of candidates) {
			if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
		}
		return '';
	}

	if (typeof value === 'string') return value.trim();
	return '';
}

function normalizeTagList(input) {
	const source = Array.isArray(input) ? input : [input];
	const out = [];
	const seen = new Set();

	for (const entry of source) {
		const label = normalizeTagValue(entry);
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

function mergeTagLists(...lists) {
	return normalizeTagList(lists.flat());
}

function normalizeTrimmedTitle(value) {
	return String(value || '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();
}

const TITLE_NOISE_WORDS = new Set([
	'the',
	'a',
	'an',
	'edition',
	'definitive',
	'remastered',
	'remake',
	'enhanced',
	'game',
	'of',
	'year',
	'goty',
	'ultimate',
	'complete',
	'deluxe',
	'gold',
	'collection',
	'bundle',
	'pack',
	'director',
	'directors',
	'cut',
	'vr',
	'hd',
	'dx',
	'ii',
	'iii',
	'iv',
	'v',
	'vi',
	'vii',
	'viii',
	'ix',
	'x',
]);

function splitTitleTokens(value, options = {}) {
	const normalized = normalizeTitleForCompare(value);
	if (!normalized) return [];

	const source = normalized.split(' ').filter(Boolean);
	if (options?.dropNoiseWords !== true) return source;

	return source.filter((token) => token.length > 1 && !TITLE_NOISE_WORDS.has(token));
}

function normalizeTitleCore(value) {
	return splitTitleTokens(value, { dropNoiseWords: true }).join(' ');
}

function getPairTitleMatchScore(left, right) {
	const leftNormalized = normalizeTitleForCompare(left);
	const rightNormalized = normalizeTitleForCompare(right);
	if (!leftNormalized || !rightNormalized) return 0;
	if (leftNormalized === rightNormalized) return 1;

	const leftCore = normalizeTitleCore(leftNormalized);
	const rightCore = normalizeTitleCore(rightNormalized);
	if (leftCore && rightCore && leftCore === rightCore) return 0.95;

	const shortText = leftNormalized.length <= rightNormalized.length ? leftNormalized : rightNormalized;
	const longText = shortText === leftNormalized ? rightNormalized : leftNormalized;
	if (shortText.length >= 3 && longText.includes(shortText)) {
		const ratio = shortText.length / Math.max(1, longText.length);
		if (ratio >= 0.62) return 0.9;
		return 0.76;
	}

	const leftTokens = new Set(splitTitleTokens(left, { dropNoiseWords: false }).filter((token) => token.length > 1));
	const rightTokens = new Set(splitTitleTokens(right, { dropNoiseWords: false }).filter((token) => token.length > 1));
	if (leftTokens.size < 1 || rightTokens.size < 1) return 0;

	let overlap = 0;
	for (const token of leftTokens) {
		if (rightTokens.has(token)) overlap += 1;
	}

	if (overlap < 1) {
		const leftPrefix = leftNormalized.slice(0, 12);
		const rightPrefix = rightNormalized.slice(0, 12);
		if (leftPrefix && rightPrefix && (leftPrefix.startsWith(rightPrefix) || rightPrefix.startsWith(leftPrefix))) {
			return 0.26;
		}
		return 0;
	}

	const union = leftTokens.size + rightTokens.size - overlap;
	const jaccard = union > 0 ? overlap / union : 0;
	const coverage = overlap / Math.min(leftTokens.size, rightTokens.size);
	const lengthBalance = Math.min(leftNormalized.length, rightNormalized.length) / Math.max(leftNormalized.length, rightNormalized.length);

	const score = Math.max(
		(jaccard * 0.78) + (coverage * 0.2) + (lengthBalance * 0.02),
		coverage * 0.88,
	);

	return Number(score.toFixed(4));
}

function titlesMatchWhenTrimmed(left, right) {
	return getPairTitleMatchScore(left, right) >= 0.78;
}

function normalizeTitleForCompare(value) {
	return String(value || '')
		.toLowerCase()
		.replace(/[\u00a9\u00ae\u2122]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function isPlaceholderTitle(value) {
	const normalized = normalizeTitleForCompare(value);
	if (!normalized) return true;
	if (normalized === normalizeTitleForCompare(fallback.title)) return true;
	if (/^game \d+$/.test(normalized)) return true;
	if (/^steam app \d+$/.test(normalized)) return true;
	if (normalized === 'unknown' || normalized === 'unknown steam title') return true;
	return false;
}

function collectExpectedTitles(routeState, dbData) {
	const candidates = [
		dbData?.name,
		routeState?.title,
		routeState?.name,
	];

	const expected = [];
	const seen = new Set();

	for (const candidate of candidates) {
		if (!hasFilledText(candidate) || isPlaceholderTitle(candidate)) continue;
		const comparable = normalizeTitleForCompare(candidate);
		if (!comparable || seen.has(comparable)) continue;
		seen.add(comparable);
		expected.push(String(candidate).trim());
	}

	return expected;
}

function getBestTitleMatchScore(title, expectedTitles) {
	if (!Array.isArray(expectedTitles) || expectedTitles.length < 1) return 1;
	let best = 0;
	for (const expectedTitle of expectedTitles) {
		const score = getPairTitleMatchScore(title, expectedTitle);
		if (score > best) best = score;
	}
	return best;
}

function evaluateParsedCompleteness(parsed) {
	const data = parsed && typeof parsed === 'object' ? parsed : {};
	const numericId = Number(data.appid ?? data.id);

	const missingRequired = [
		!hasFilledText(data.title),
		!hasFilledText(data.description) && !hasFilledText(data.longDescription),
		!hasFilledText(data.coverImage) && !hasFilledText(data.heroImage),
		!(Number.isFinite(numericId) && numericId > 0),
		!Array.isArray(data.sites) || data.sites.length < 1,
	].filter(Boolean).length;

	const missingOptional = [
		!Array.isArray(data.tags) || data.tags.length < 1,
		!Array.isArray(data.screenshots) || data.screenshots.length < 1,
		!hasFilledText(data.minimumRequirements),
		data.price == null || !Number.isFinite(Number(data.price)),
	].filter(Boolean).length;

	const filledScore = (5 - missingRequired) * 10 + (4 - missingOptional);
	return {
		missingRequired,
		missingOptional,
		filledScore,
	};
}

function selectBestScrapeCandidate(candidates, expectedTitles) {
	const list = Array.isArray(candidates) ? candidates : [];
	if (list.length < 1) {
		return { best: null, accepted: [], hasTitleMatch: false };
	}

	const titleHints = Array.isArray(expectedTitles) ? expectedTitles : [];
	const requireTitleMatch = titleHints.length > 0;
	const strictTitleThreshold = 0.28;
	const softTitleThreshold = 0.18;

	const evaluated = list.map((candidate) => {
		const parsed = candidate?.parsed && typeof candidate.parsed === 'object' ? candidate.parsed : null;
		const title = parsed?.title || candidate?.details?.title || candidate?.details?.name || '';
		const titleScore = getBestTitleMatchScore(title, titleHints);
		const titleMatched = requireTitleMatch ? titleScore >= strictTitleThreshold : true;
		const completeness = evaluateParsedCompleteness(parsed);

		return {
			...candidate,
			titleScore,
			titleMatched,
			...completeness,
		};
	});

	const matched = evaluated.filter((candidate) => candidate.titleMatched);
	let accepted = matched.length > 0 ? matched : [];
	let hasTitleMatch = matched.length > 0 || !requireTitleMatch;

	if (requireTitleMatch && accepted.length < 1) {
		const softMatched = evaluated.filter((candidate) => candidate.titleScore >= softTitleThreshold);
		if (softMatched.length > 0) {
			accepted = softMatched;
			hasTitleMatch = true;
		} else {
			accepted = evaluated;
			hasTitleMatch = false;
		}
	} else if (!requireTitleMatch) {
		accepted = evaluated;
	}

	accepted.sort((left, right) => {
		if (left.missingRequired !== right.missingRequired) {
			return left.missingRequired - right.missingRequired;
		}
		if (left.missingOptional !== right.missingOptional) {
			return left.missingOptional - right.missingOptional;
		}
		if (Math.abs(right.titleScore - left.titleScore) > 0.0001) {
			return right.titleScore - left.titleScore;
		}
		if (right.filledScore !== left.filledScore) {
			return right.filledScore - left.filledScore;
		}
		return 0;
	});

	return {
		best: accepted[0] || null,
		accepted,
		hasTitleMatch,
	};
}

function buildLookupTitleCandidates(expectedTitles, routeState) {
	const raw = [
		...(Array.isArray(expectedTitles) ? expectedTitles : []),
		routeState?.title,
		routeState?.name,
	];

	const unique = [];
	const seen = new Set();
	for (const candidate of raw) {
		if (!hasFilledText(candidate) || isPlaceholderTitle(candidate)) continue;
		const normalized = normalizeTrimmedTitle(candidate);
		if (!normalized || seen.has(normalized)) continue;
		seen.add(normalized);
		unique.push(String(candidate).trim());
	}

	return unique;
}

function slugFromTitle(title, separator = '_') {
	return normalizeTitleForCompare(title).split(' ').filter(Boolean).join(separator);
}

function buildGogTitleSlugs(title) {
	const normalized = normalizeTitleForCompare(title);
	if (!normalized) return [];

	const words = normalized.split(' ').filter(Boolean);
	if (words.length < 1) return [];

	const dropTail = new Set([
		'edition',
		'ultimate',
		'complete',
		'game',
		'year',
		'deluxe',
		'definitive',
		'remastered',
		'enhanced',
		'gold',
		'goty',
		'director',
		'directors',
		'cut',
	]);
	const trimmedWords = [...words];
	while (trimmedWords.length > 2 && dropTail.has(trimmedWords[trimmedWords.length - 1])) {
		trimmedWords.pop();
	}

	const noLeadingThe = words[0] === 'the' && words.length > 1 ? words.slice(1) : words;
	const progressive = [];
	for (let length = words.length; length >= 2; length -= 1) {
		progressive.push(words.slice(0, length).join(' '));
	}

	const variants = new Set([
		slugFromTitle(words.join(' '), '_'),
		slugFromTitle(words.join(' '), '-'),
		slugFromTitle(trimmedWords.join(' '), '_'),
		slugFromTitle(trimmedWords.join(' '), '-'),
		slugFromTitle(noLeadingThe.join(' '), '_'),
		slugFromTitle(noLeadingThe.join(' '), '-'),
		...progressive.map((value) => slugFromTitle(value, '_')),
		...progressive.map((value) => slugFromTitle(value, '-')),
	]);

	return Array.from(variants).filter(Boolean).slice(0, 16);
}

async function fetchDetailsByTitleHints(api, platform, titleHints, countryCode) {
	if (!api || !Array.isArray(titleHints) || titleHints.length < 1) return null;
	const cc = String(countryCode || 'US').trim().toLowerCase() || 'us';
	const minAcceptableScore = 0.18;
	let best = null;

	const maybeTrackBest = (details, candidateTitle) => {
		if (!details || typeof details !== 'object') return false;
		const score = getBestTitleMatchScore(candidateTitle, titleHints);
		if (!best || score > best.score) {
			best = { details, score };
		}
		return score >= 0.95;
	};

	if (platform === 'steam') {
		for (const title of titleHints) {
			if (!hasFilledText(title)) continue;
			if (typeof api.getSteamGameDetailsByTitle !== 'function') continue;
			const details = await api.getSteamGameDetailsByTitle(title, cc);
			if (!details || typeof details !== 'object') continue;
			const candidateTitle = details?.name || details?.title || details?.raw?.name || details?.raw?.search_match?.title || '';
			if (maybeTrackBest(details, candidateTitle)) return details;
		}
		return best && best.score >= minAcceptableScore ? best.details : null;
	}

	if (platform === 'gog') {
		for (const title of titleHints) {
			if (!hasFilledText(title)) continue;
			if (typeof api.getGogGameDetailsByTitle === 'function') {
				const details = await api.getGogGameDetailsByTitle(title);
				if (details && typeof details === 'object' && maybeTrackBest(details, details?.title || details?.name || '')) {
					return details;
				}
			}

			const slugCandidates = buildGogTitleSlugs(title);
			for (const slug of slugCandidates) {
				const details = await api.getGogGameDetails(slug);
				if (details && typeof details === 'object' && maybeTrackBest(details, details?.title || details?.name || '')) {
					return details;
				}
			}
		}
		return best && best.score >= minAcceptableScore ? best.details : null;
	}

	if (platform === 'itchio') {
		for (const title of titleHints) {
			if (!hasFilledText(title)) continue;
			if (typeof api.getItchGameDetailsByTitle !== 'function') continue;
			const details = await api.getItchGameDetailsByTitle(title);
			if (!details || typeof details !== 'object') continue;
			if (maybeTrackBest(details, details?.title || details?.name || '')) return details;
		}
		return best && best.score >= minAcceptableScore ? best.details : null;
	}

	return null;
}

function toPositiveNumber(value) {
	const numeric = Number(value);
	return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function normalizeSiteLinksFromAny(value) {
	if (!value) return [];
	if (Array.isArray(value)) {
		return value
			.map((entry, index) => {
				if (!entry) return null;
				if (typeof entry === 'string') {
					if (!/^https?:\/\//i.test(entry)) return null;
					return { id: `site-${index}`, label: 'Store', href: entry };
				}
				const href = String(entry.href || entry.url || entry.link || '').trim();
				if (!/^https?:\/\//i.test(href)) return null;
				return {
					id: String(entry.id || entry.label || entry.name || `site-${index}`),
					label: String(entry.label || entry.name || entry.platform || 'Store'),
					href,
				};
			})
			.filter(Boolean);
	}
	if (typeof value === 'object') {
		return Object.entries(value)
			.map(([key, entry], index) => {
				if (typeof entry === 'string') {
					if (!/^https?:\/\//i.test(entry)) return null;
					return { id: key, label: key, href: entry };
				}
				if (!entry || typeof entry !== 'object') return null;
				const href = String(entry.href || entry.url || entry.link || '').trim();
				if (!/^https?:\/\//i.test(href)) return null;
				return {
					id: String(entry.id || key || `site-${index}`),
					label: String(entry.label || entry.name || key || 'Store'),
					href,
				};
			})
			.filter(Boolean);
	}
	return [];
}

function normalizePirateLinksFromAny(value) {
	if (!value) return [];

	const source = Array.isArray(value)
		? value
		: (typeof value === 'object' ? Object.values(value) : []);

	const out = [];
	const seen = new Set();

	for (let index = 0; index < source.length; index += 1) {
		const entry = source[index];
		if (!entry) continue;

		let href = '';
		let label = 'Pirate Download';

		if (typeof entry === 'string') {
			href = entry.trim();
		} else if (typeof entry === 'object') {
			href = String(entry.link || entry.url || entry.href || '').trim();
			label = String(entry.site_name || entry.siteName || entry.name || entry.label || 'Pirate Download').trim() || 'Pirate Download';
		}

		if (!href) continue;
		if (!/^https?:\/\//i.test(href) && !/^magnet:\?/i.test(href)) continue;

		const key = href.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);

		out.push({
			id: `pirate-${index}`,
			label,
			href,
		});
	}

	return out;
}

function decodeHtmlAmpersands(value) {
	return String(value || '')
		.replace(/&#0*38;/g, '&')
		.replace(/&amp;/gi, '&')
		.trim();
}

function extractSlugFromUrl(href) {
	if (!hasFilledText(href)) return '';
	try {
		const parsed = new URL(String(href));
		const chunks = parsed.pathname
			.split('/')
			.map((chunk) => decodeURIComponent(chunk).trim())
			.filter(Boolean);
		if (chunks.length < 1) return '';
		return chunks[chunks.length - 1].replace(/\.html?$/i, '').trim();
	} catch {
		return '';
	}
}

function pirateEntryKey(entry, fallback = '') {
	const fromId = String(entry?.id || '').trim();
	if (fromId) return fromId;
	const fromHref = String(entry?.href || '').trim().toLowerCase();
	if (fromHref) return fromHref;
	const fromLabel = String(entry?.label || '').trim().toLowerCase();
	if (fromLabel) return fromLabel;
	return String(fallback || '').trim().toLowerCase();
}

function defaultSiteForPlatform(platform, appId) {
	if (!appId) return [];
	if (platform === 'gog') {
		return [{ id: 'gog', label: 'GoG', href: `https://www.gog.com/en/game/${appId}` }];
	}
	if (platform === 'itchio') {
		return [{ id: 'itchio', label: 'Itch.io', href: 'https://itch.io/' }];
	}
	return [{ id: 'steam', label: 'Steam', href: `https://store.steampowered.com/app/${appId}` }];
}

function inferPlatformFromSite(site) {
	const label = String(site?.label || '').toLowerCase();
	const href = String(site?.href || '').toLowerCase();
	const text = `${label} ${href}`;
	if (text.includes('steampowered.com') || /\bsteam\b/.test(text)) return 'steam';
	if (text.includes('gog.com') || /\bgog\b/.test(text)) return 'gog';
	if (text.includes('itch.io') || text.includes('itchio') || /\bitch\b/.test(text)) return 'itchio';
	return null;
}

function inferPlatformAppId(platform, href) {
	if (!href || typeof href !== 'string') return null;
	if (platform === 'steam') {
		const match = href.match(/store\.steampowered\.com\/app\/(\d+)/i);
		const value = Number(match?.[1]);
		return Number.isFinite(value) && value > 0 ? value : null;
	}
	if (platform === 'gog') {
		const match = href.match(/gog\.com\/(?:[a-z]{2}\/)?game\/(\d+)/i);
		const value = Number(match?.[1]);
		return Number.isFinite(value) && value > 0 ? value : null;
	}
	return null;
}

function extractScrapedAppId(platform, details, fallbackAppId) {
	const candidates = platform === 'steam'
		? [details?.appid, details?.app_id, details?.id, fallbackAppId]
		: platform === 'gog'
			? [details?.productId, details?.app_id, details?.id, fallbackAppId]
			: [details?.gameId, details?.app_id, details?.id, fallbackAppId];

	for (const candidate of candidates) {
		const numeric = toPositiveNumber(candidate);
		if (numeric) return numeric;
	}

	return toPositiveNumber(fallbackAppId);
}

function extractScrapedStoreHref(platform, details, appId) {
	const siteLinks = normalizeSiteLinksFromAny(
		details?.url || details?.store_url || details?.storeUrl || details?.links || details?.sites
	);
	const preferred = siteLinks.find((site) => {
		const inferred = inferPlatformFromSite(site);
		const normalizedInferred = normalizePlatformName(inferred || platform);
		return normalizedInferred === platform;
	});

	if (preferred?.href) return preferred.href;
	if (siteLinks[0]?.href) return siteLinks[0].href;
	return defaultSiteForPlatform(platform, appId)?.[0]?.href || null;
}

function parseSteamDetails(details) {
	if (!details || typeof details !== 'object') return null;
	const appid = Number(details.appid);
	if (!Number.isFinite(appid) || appid <= 0) return null;

	const raw = details.raw && typeof details.raw === 'object' ? details.raw : {};
	const tags = normalizeTagList(details.genre_names ?? details.genreNames ?? details.genres);
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
		price: normalizePriceValue(typeof details.price_overview === 'number' ? details.price_overview / 100 : null, 'steam'),
	};
}

function parsePlatformDetails(platform, details, appId) {
	if (!details || typeof details !== 'object') return null;

	if (platform === 'steam') {
		const parsedSteam = parseSteamDetails(details);
		if (!parsedSteam) return null;
		return {
			...parsedSteam,
			platform_name: 'steam',
		};
	}

	if (platform === 'gog') {
		const genres = normalizeTagList(details.genre_names ?? details.genreNames ?? details.genres);
		const minimumRequirements = details.minimum_requirements || details.minimumRequirements || '';
		const parsedAppId = toPositiveNumber(details.productId ?? details.app_id ?? details.id ?? appId);
		const price = [details.cost, details.min_price, details.minPrice, details.price]
			.map((value) => normalizePriceValue(value, 'gog'))
			.find((value) => value !== null);
		const banner = details.bannerImg || details.banner_img || details.coverUrl || details.cover_url || '';
		const siteLinks = normalizeSiteLinksFromAny(details.url || details.store_url || details.storeUrl || details.links || details.sites);
		return {
			id: parsedAppId,
			appid: parsedAppId,
			title: details.title || fallback.title,
			description: details.description || details.shortText || details.short_text || '',
			longDescription: details.description || details.shortText || details.short_text || '',
			tags: genres,
			screenshots: [],
			minimumRequirements,
			price,
			coverImage: banner,
			heroImage: banner,
			platform_name: 'gog',
			sites: siteLinks,
		};
	}

	if (platform === 'itchio') {
		const parsedAppId = toPositiveNumber(details.gameId ?? details.app_id ?? details.id ?? appId);
		const price = [details.minPrice, details.min_price, details.cost, details.price]
			.map((value) => normalizePriceValue(value, 'itchio'))
			.find((value) => value !== null);
		const banner = details.coverUrl || details.cover_url || details.banner_img || '';
		const siteLinks = normalizeSiteLinksFromAny(details.url || details.store_url || details.storeUrl || details.links || details.sites);
		const genres = normalizeTagList(details.genre_names ?? details.genreNames ?? details.genres);
		return {
			id: parsedAppId,
			appid: parsedAppId,
			title: details.title || fallback.title,
			description: details.shortText || details.short_text || details.description || '',
			longDescription: details.description || details.shortText || details.short_text || '',
			tags: genres,
			screenshots: [],
			minimumRequirements: details.minimum_requirements || details.minimumRequirements || '',
			price,
			coverImage: banner,
			heroImage: banner,
			platform_name: 'itchio',
			sites: siteLinks,
		};
	}

	return null;
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
		sites: normalizeSiteLinksFromAny(game?.sites),
		screenshots: Array.isArray(game?.screenshots) ? game.screenshots : fallback.screenshots,
		price: typeof game?.price === 'number' ? game.price : fallback.price,
		platform_name: normalizePlatformName(game?.platform_name || game?.platform || fallback.platform_name),
	};
}

const StoreGamePage = () => {
	const { id, platform } = useParams();
	const location = useLocation();
	const navigate = useNavigate();
	const { startDownload } = useDownloadManager();
	const [platformDetails, setPlatformDetails] = useState(null);
	const [dbDetails, setDbDetails] = useState(null);
	const [scrapedTargets, setScrapedTargets] = useState([]);
	const [errorMessage, setErrorMessage] = useState('');
	const [currentScreenshot, setCurrentScreenshot] = useState(0);
	const [startingPirateKeys, setStartingPirateKeys] = useState([]);
	const [loading, setLoading] = useState(true);

	const routeState = useMemo(() => normalizeLocationState(location?.state), [location?.state]);
	const requestedPlatform = useMemo(() => normalizePlatformName(platform || routeState.platform_name), [platform, routeState.platform_name]);

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
		setPlatformDetails(null);
		setDbDetails(null);
		setScrapedTargets([]);
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

			const countryCode = await resolvePreferredCountryCode(api);

			let effectivePlatform = requestedPlatform;
			let hasDbData = false;
			let expectedTitles = collectExpectedTitles(routeState, null);

			try {
				const dbData = await api.getAllDetailsByAppIDAndPlatform(appId, requestedPlatform, countryCode);
				if (dbData) {
					hasDbData = true;
					expectedTitles = collectExpectedTitles(routeState, dbData);
				}
				if (!cancelled && dbData) setDbDetails(dbData);
			} catch {
				// optional enrichment only
			}

			try {
				const probeOrder = [effectivePlatform, 'steam', 'gog', 'itchio']
					.map((entry) => normalizePlatformName(entry))
					.filter((entry, index, arr) => entry && arr.indexOf(entry) === index);
				const titleHints = buildLookupTitleCandidates(expectedTitles, routeState);

				const scrapedCandidates = [];
				let lastError = null;

				for (const probePlatform of probeOrder) {
					try {
						let details = null;
						const shouldUsePlatformAppId = probePlatform === effectivePlatform;

						if (shouldUsePlatformAppId) {
							if (probePlatform === 'gog') {
								details = await api.getGogGameDetails(String(appId));
							} else if (probePlatform === 'itchio') {
								details = await api.getItchGameDetails(Number(appId));
							} else {
								details = await api.getSteamGameDetails(appId, countryCode.toLowerCase());
							}
						}

						if (!details) {
							details = await fetchDetailsByTitleHints(api, probePlatform, titleHints, countryCode);
						}

						if (details && typeof details === 'object') {
							const parsed = parsePlatformDetails(probePlatform, details, appId);
							const scrapedAppId = extractScrapedAppId(probePlatform, details, appId);
							const scrapedHref = extractScrapedStoreHref(probePlatform, details, scrapedAppId || appId);
							scrapedCandidates.push({
								platform: probePlatform,
								details,
								parsed,
								appId: scrapedAppId,
								href: scrapedHref,
							});
						}
					} catch (err) {
						lastError = err;
					}
				}

				const selection = selectBestScrapeCandidate(scrapedCandidates, expectedTitles);
				const preferredCandidate = selection.accepted.find(
					(candidate) => normalizePlatformName(candidate.platform) === effectivePlatform
				) || null;
				const chosenCandidate = preferredCandidate || selection.best;

				if (!cancelled) {
					setScrapedTargets(
						selection.accepted.map((candidate) => ({
							platform: candidate.platform,
							appId: candidate.appId,
							href: candidate.href,
						}))
					);
				}

				if (!cancelled && chosenCandidate) {
					setPlatformDetails({
						...chosenCandidate.details,
						__resolved_platform: chosenCandidate.platform,
					});
				} else if (!cancelled && expectedTitles.length > 0 && scrapedCandidates.length > 0 && !selection.hasTitleMatch) {
					if (!hasDbData) {
						setErrorMessage('No scraped store result matched the expected game title.');
					}
				} else if (!cancelled && !hasDbData && lastError) {
					setErrorMessage(lastError instanceof Error ? lastError.message : String(lastError));
				}

				try {
					const refreshedDbData = await api.getAllDetailsByAppIDAndPlatform(appId, effectivePlatform, countryCode);
					if (!cancelled && refreshedDbData) setDbDetails(refreshedDbData);
				} catch {
					// optional enrichment only
				}
			} catch (error) {
				if (!cancelled) setErrorMessage(error instanceof Error ? error.message : String(error));
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [appId, requestedPlatform]);

	const model = useMemo(() => {
		const routePlatform = normalizePlatformName(requestedPlatform || routeState.platform_name);
		const scrapedPlatform = normalizePlatformName(platformDetails?.__resolved_platform || routePlatform);
		const parsedPlatform = parsePlatformDetails(scrapedPlatform, platformDetails, appId);
		const dbSites = normalizeSiteLinksFromAny(dbDetails?.sites || dbDetails?.links || dbDetails?.store_links || dbDetails?.storeLinks || dbDetails?.urls);
		const dbPlatformName = normalizePlatformName(dbDetails?.platform_name || routePlatform);
		const parsedDb = dbDetails
			? {
				id: Number(dbDetails.app_id) || null,
				appid: Number(dbDetails.app_id) || null,
				title: dbDetails.name || routeState.title,
				description: dbDetails.description || '',
				longDescription: dbDetails.description || routeState.longDescription,
				tags: normalizeTagList(dbDetails.genre_names ?? dbDetails.genres),
				minimumRequirements: dbDetails.minimum_requirements || '',
				price: normalizePriceValue(pickFirstFiniteNumber(dbDetails.cost, routeState.price), dbPlatformName),
				priceLabel:
					dbPlatformName !== 'gog' && typeof dbDetails.formated_price === 'string' && dbDetails.formated_price.trim()
						? dbDetails.formated_price.trim()
						: null,
				platform_name: dbPlatformName,
				sites: dbSites,
			}
			: null;

		const resolvedAppId = pickFirstPositiveNumber(
			parsedPlatform?.appid,
			parsedPlatform?.id,
			parsedDb?.appid,
			parsedDb?.id,
			routeState?.appid,
			routeState?.id,
			appId
		);
		const steam = steamImages(resolvedAppId || appId);
		const description = pickFirstFilledText(
			parsedPlatform?.description,
			parsedDb?.description,
			routeState?.description
		);
		const longDescription = pickFirstFilledText(
			parsedPlatform?.longDescription,
			parsedDb?.longDescription,
			routeState?.longDescription,
			description
		);
		const tags = mergeTagLists(
			parsedDb?.tags,
			parsedPlatform?.tags,
			routeState?.tags,
		);
		const screenshots = pickFirstNonEmptyArray(
			parsedPlatform?.screenshots,
			routeState?.screenshots
		);
		const siteCandidates = pickFirstNonEmptyArray(
			parsedPlatform?.sites,
			parsedDb?.sites,
			routeState?.sites
		);
		const links = siteCandidates.length > 0
			? normalizeSiteLinksFromAny(siteCandidates)
			: defaultSiteForPlatform(routePlatform, resolvedAppId || appId);
		const coverImage = pickFirstFilledText(
			parsedPlatform?.coverImage,
			parsedPlatform?.bannerImg,
			parsedDb?.coverImage,
			parsedDb?.bannerImg,
			routeState?.coverImage,
			routeState?.coverUrl,
			routeState?.image,
			steam?.cover,
			steam?.capsule,
			fallback.coverImage
		);
		const heroImage = pickFirstFilledText(
			parsedPlatform?.heroImage,
			parsedPlatform?.bannerImg,
			parsedDb?.heroImage,
			parsedDb?.bannerImg,
			routeState?.heroImage,
			routeState?.heroUrl,
			routeState?.image,
			steam?.hero,
			steam?.header,
			coverImage,
			fallback.heroImage
		);
		const price = normalizePriceValue(pickFirstFiniteNumber(
			parsedPlatform?.price,
			parsedDb?.price,
			routeState?.price
		), routePlatform);
		const priceLabel = pickFirstFilledText(
			parsedPlatform?.priceLabel,
			parsedDb?.priceLabel,
			routeState?.priceLabel
		);
		const minimumRequirements = pickFirstFilledText(
			parsedPlatform?.minimumRequirements,
			parsedDb?.minimumRequirements,
			routeState?.minimumRequirements
		);
		const pirateLinks = normalizePirateLinksFromAny(
			dbDetails?.pirate_sites || routeState?.pirate_sites || routeState?.pirateSites
		);

		return {
			...fallback,
			id: pickFirstPositiveNumber(parsedDb?.id, routeState?.id, resolvedAppId, appId),
			appid: resolvedAppId,
			title: pickFirstFilledText(parsedPlatform?.title, parsedDb?.title, routeState?.title, routeState?.name, fallback.title),
			description,
			longDescription,
			minimumRequirements,
			platform_name: routePlatform,
			coverImage,
			heroImage,
			tags,
			screenshots,
			price,
			priceLabel: priceLabel || null,
			sites: links,
			pirate_links: pirateLinks,
		};
	}, [appId, dbDetails, platformDetails, requestedPlatform, routeState]);

	const gameDetailsRows = useMemo(() => {
		const platform = normalizePlatformName(model.platform_name);
		const rows = [];

		if (platform === 'steam' && platformDetails && typeof platformDetails === 'object') {
			const steam = platformDetails;
			const genres = Array.isArray(steam.genres)
				? steam.genres
					.map((genre) => (genre && typeof genre === 'object' ? genre.description : ''))
					.filter(Boolean)
					.join(', ')
				: '';
			rows.push(
				{ label: 'App ID', value: steam.appid != null ? String(steam.appid) : '' },
				{ label: 'Name', value: steam.name || '' },
				{ label: 'Country', value: steam.cc || '' },
				{ label: 'Language', value: steam.lang || '' },
				{ label: 'Price', value: formatCurrencyPrice(typeof steam.price_overview === 'number' ? steam.price_overview / 100 : null, 'steam') },
				{ label: 'Genres', value: genres },
				{ label: 'Minimum Requirements', value: steam.minimum_requirements || '' },
				{ label: 'Banner Image', value: steam.bannerimg || '' },
			);
		} else if (platform === 'gog' && platformDetails && typeof platformDetails === 'object') {
			const gog = platformDetails;
			const gogPrice = [gog.cost, gog.min_price, gog.minPrice, gog.price]
				.map((value) => normalizePriceValue(value, 'gog'))
				.find((value) => value !== null);
			const gogGenres = Array.isArray(gog.genreNames)
				? gog.genreNames
				: (Array.isArray(gog.genres)
					? gog.genres.map((entry) => (typeof entry === 'string' ? entry : entry?.name || entry?.genre || entry?.description)).filter(Boolean)
					: []);
			rows.push(
				{ label: 'Product ID', value: gog.productId || gog.app_id || gog.id || '' },
				{ label: 'Title', value: gog.title || '' },
				{ label: 'Price', value: formatCurrencyPrice(gogPrice, 'gog') },
				{ label: 'Genres', value: gogGenres.join(', ') },
				{ label: 'Banner Image', value: gog.bannerImg || gog.banner_img || gog.coverUrl || gog.cover_url || '' },
				{ label: 'Minimum Requirements', value: gog.minimum_requirements || gog.minimumRequirements || '' },
				{ label: 'Description', value: gog.description || '' },
			);
		} else if (platform === 'itchio' && platformDetails && typeof platformDetails === 'object') {
			const itch = platformDetails;
			const itchPrice = [itch.minPrice, itch.min_price, itch.cost, itch.price]
				.map((value) => normalizePriceValue(value, 'itchio'))
				.find((value) => value !== null);
			rows.push(
				{ label: 'Game ID', value: itch.gameId != null ? String(itch.gameId) : (itch.app_id != null ? String(itch.app_id) : '') },
				{ label: 'Title', value: itch.title || '' },
				{ label: 'Minimum Price', value: formatCurrencyPrice(itchPrice, 'itchio') },
				{ label: 'Cover', value: itch.coverUrl || itch.cover_url || itch.banner_img || '' },
				{ label: 'Description', value: itch.shortText || itch.short_text || itch.description || '' },
				{ label: 'Store URL', value: itch.url || itch.store_url || itch.storeUrl || '' },
			);
		}

		if (dbDetails && typeof dbDetails === 'object') {
			const dbPlatform = normalizePlatformName(dbDetails.platform_name || model.platform_name);
			const dbGenres = Array.isArray(dbDetails.genre_names) ? dbDetails.genre_names.filter(Boolean).join(', ') : '';
			const dbPriceText =
				dbPlatform !== 'gog' && typeof dbDetails.formated_price === 'string' && dbDetails.formated_price.trim()
					? dbDetails.formated_price.trim()
					: formatCurrencyPrice(dbDetails.cost, dbPlatform);
			rows.push(
				{ label: 'DB App ID', value: dbDetails.app_id != null ? String(dbDetails.app_id) : '' },
				{ label: 'DB Platform', value: dbDetails.platform_name || '' },
				{ label: 'DB Name', value: dbDetails.name || '' },
				{ label: 'DB Country', value: dbDetails.country_code || '' },
				{ label: 'DB Price', value: dbPriceText },
				{ label: 'DB Banner', value: dbDetails.banner_img || '' },
				{ label: 'DB Genres', value: dbGenres },
				{ label: 'DB Minimum Requirements', value: dbDetails.minimum_requirements || '' },
				{ label: 'DB Description', value: dbDetails.description || '' },
			);
		}

		const deduped = [];
		const seen = new Set();
		for (const row of rows) {
			const value = String(row.value || '').trim();
			if (!value) continue;
			const key = `${row.label}:${value}`;
			if (seen.has(key)) continue;
			seen.add(key);
			deduped.push({ label: row.label, value });
		}

		return deduped;
	}, [dbDetails, model.platform_name, platformDetails]);

	const screenshot = model.screenshots[currentScreenshot] || model.heroImage || model.coverImage;
	const activePlatform = normalizePlatformName(model.platform_name);

	const platformActionTargets = useMemo(() => {
		const byPlatform = new Map();

		const addTarget = (platform, href, appIdHint) => {
			const normalizedPlatform = normalizePlatformName(platform);
			if (!['steam', 'gog', 'itchio'].includes(normalizedPlatform)) return;

			const appIdFromHref = inferPlatformAppId(normalizedPlatform, href);
			const numericHint = Number(appIdHint);
			const resolvedAppId = Number.isFinite(appIdFromHref) && appIdFromHref > 0
				? appIdFromHref
				: (Number.isFinite(numericHint) && numericHint > 0 ? numericHint : null);

			const current = byPlatform.get(normalizedPlatform);
			if (!current) {
				byPlatform.set(normalizedPlatform, {
					platform: normalizedPlatform,
					label: getStorePlatformLabel(normalizedPlatform),
					href: href || null,
					appId: resolvedAppId,
				});
				return;
			}

			if (!current.href && href) current.href = href;
			if ((!current.appId || current.appId <= 0) && resolvedAppId) current.appId = resolvedAppId;
		};

		for (const target of scrapedTargets || []) {
			addTarget(target?.platform, target?.href || null, target?.appId);
		}

		const primaryHref = defaultSiteForPlatform(activePlatform, appId)?.[0]?.href || null;
		addTarget(activePlatform, primaryHref, appId);

		for (const site of model.sites || []) {
			const inferredPlatform = inferPlatformFromSite(site) || activePlatform;
			addTarget(inferredPlatform, site?.href || null, appId);
		}

		return Array.from(byPlatform.values());
	}, [activePlatform, appId, model.sites, scrapedTargets]);

	const openExternalUrl = (href) => {
		if (!href || typeof href !== 'string') return false;
		try {
			window.open(href, '_blank', 'noopener,noreferrer');
			return true;
		} catch {
			return false;
		}
	};

	const handleOpenPlatform = async (target) => {
		if (!target) return;
		const targetAppId = Number(target.appId ?? appId);
		try {
			if (target.platform === 'gog' && Number.isFinite(targetAppId) && targetAppId > 0) {
				await window.electronAPI.openGogGame(String(targetAppId));
				return;
			}
			if (target.platform === 'itchio' && Number.isFinite(targetAppId) && targetAppId > 0) {
				await window.electronAPI.openItchGame(Number(targetAppId));
				return;
			}
			if (target.platform === 'steam' && Number.isFinite(targetAppId) && targetAppId > 0) {
				await window.electronAPI.storePageSteam(targetAppId);
				return;
			}

			if (openExternalUrl(target.href)) return;
			throw new Error(`No launcher action is available for ${target.label}.`);
		} catch (error) {
			if (openExternalUrl(target.href)) return;
			setErrorMessage(error instanceof Error ? error.message : String(error));
		}
	};

	const handlePurchasePlatform = async (target) => {
		if (!target) return;
		if (openExternalUrl(target.href)) return;
		await handleOpenPlatform(target);
	};

	const handleOpenPirateLink = async (entry) => {
		const rawHref = String(entry?.href || '').trim();
		if (!rawHref) return;

		const entryKey = pirateEntryKey(entry, rawHref);
		setStartingPirateKeys((prev) => (prev.includes(entryKey) ? prev : [...prev, entryKey]));
		setErrorMessage('');

		try {
			let torrentId = decodeHtmlAmpersands(rawHref);
			const lowerHref = torrentId.toLowerCase();
			const label = String(entry?.label || '').toLowerCase();

			if (!/^magnet:\?/i.test(torrentId)) {
				const api = typeof window !== 'undefined' ? window.electronAPI : null;
				const slugFallback = slugFromTitle(model.title, '-') || '';
				const slugFromLink = extractSlugFromUrl(torrentId);
				const slug = slugFromLink || slugFallback;

				if ((/fitgirl-repacks\.site/.test(lowerHref) || label.includes('fitgirl')) && slug && typeof api?.fitGirlMagnetLink === 'function') {
					const resolved = await api.fitGirlMagnetLink(slug);
					if (hasFilledText(resolved)) {
						torrentId = decodeHtmlAmpersands(resolved);
					}
				} else if ((/pcgamestorrents?\.com/.test(lowerHref) || /igg-games\.com/.test(lowerHref) || label.includes('pcgamestorrent')) && slug && typeof api?.pcGamesTorrentMagnetLink === 'function') {
					const resolved = await api.pcGamesTorrentMagnetLink(slug);
					if (hasFilledText(resolved)) {
						torrentId = decodeHtmlAmpersands(resolved);
					}
				}
			}

			if (!/^magnet:\?/i.test(torrentId) && !/^https?:\/\//i.test(torrentId)) {
				throw new Error('Unsupported pirate download link.');
			}

			let configuredPirateSavePath = '';
			try {
				if (typeof window.electronAPI.getSettings === 'function') {
					const settings = await window.electronAPI.getSettings();
					configuredPirateSavePath = String(
						settings?.downloads?.pirateTorrentsPath || settings?.downloads?.path || '',
					).trim();
				}
			} catch {
				configuredPirateSavePath = '';
			}

			await startDownload({
				magnetUri: torrentId,
				savePath: configuredPirateSavePath || undefined,
				artwork: {
					imageUrl: model.heroImage || model.coverImage || '',
					thumbnailUrl: model.coverImage || model.heroImage || '',
					coverUrl: model.coverImage || model.heroImage || '',
					image: model.coverImage || model.heroImage || '',
				},
			});

			navigate('/downloads');
		} catch (error) {
			setErrorMessage(error instanceof Error ? error.message : 'Could not start pirate download.');
		} finally {
			setStartingPirateKeys((prev) => prev.filter((key) => key !== entryKey));
		}
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
											{model.price === 0
												? 'Free'
												: ((activePlatform !== 'gog' && model.priceLabel) || formatCurrencyPrice(model.price, activePlatform) || 'Check Store')}
										</p>
									</div>
									{platformActionTargets.map((target) => {
										const openDisabled = !target?.href && !(Number.isFinite(Number(target?.appId)) && Number(target?.appId) > 0);
										const purchaseDisabled = !target?.href && openDisabled;
										return (
											<div key={target.platform} className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
												<p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">{target.label}</p>
												<div className="mt-2 grid grid-cols-2 gap-2">
													<button
														type="button"
														onClick={() => handleOpenPlatform(target)}
														disabled={openDisabled}
														className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
													>
														Open
													</button>
													<button
														type="button"
														onClick={() => handlePurchasePlatform(target)}
														disabled={purchaseDisabled}
														className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
													>
														Purchase
													</button>
												</div>
											</div>
										);
									})}
									{Array.isArray(model.pirate_links) && model.pirate_links.length > 0 ? (
										<div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
											<p className="text-[11px] uppercase tracking-[0.18em] text-amber-200">Pirate Downloads</p>
											<div className="mt-2 flex flex-col gap-2">
												{model.pirate_links.map((entry, index) => {
													const pirateKey = pirateEntryKey(entry, index);
													const isStartingPirate = startingPirateKeys.includes(pirateKey);
													return (
													<button
														key={entry.id || `${entry.label}-${index}`}
														type="button"
														onClick={() => handleOpenPirateLink(entry)}
														disabled={isStartingPirate}
														className="w-full rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
													>
														{isStartingPirate ? 'Starting Download...' : entry.label}
													</button>
													);
												})}
											</div>
										</div>
									) : null}
								</div>
							</div>

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
									<h2 className="text-lg font-semibold text-white">Minimum Requirements</h2>
									<div className="mt-3 text-sm leading-6 text-slate-300 [&_ul]:ml-5 [&_ul]:list-disc [&_strong]:text-slate-100" dangerouslySetInnerHTML={{ __html: model.minimumRequirements }} />
								</div>
							) : null}
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

							<div className="grid gap-5">
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

							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default StoreGamePage;