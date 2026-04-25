import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const SCREENSHOT_AUTOSTEP_MS = 3000;

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
			settings?.store?.countryCode,
			settings?.display?.countryCode,
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

const PIRATE_LINK_RESOLVE_TIMEOUT_MS = 10_000;
const STORE_STEAM_IMAGE_PROBE_TIMEOUT_MS = 5_500;
const STORE_RATING_FETCH_TIMEOUT_MS = 9_000;
const LOCAL_HARDWARE_PROFILE_TIMEOUT_MS = 8_000;
const LOCAL_HARDWARE_PROFILE_CACHE_TTL_MS = 90_000;
const STORE_STEAM_IMAGE_CDN_HOSTS = [
	'https://cdn.cloudflare.steamstatic.com',
	'https://cdn.akamai.steamstatic.com',
];

const storeSteamImageProbeCache = new Map();

const REQUIREMENT_CHECK_SHOULD_RUN = 'Should run';
const REQUIREMENT_CHECK_HOPES = 'will run on hopes and prayers';
const REQUIREMENT_CHECK_PROBABLY_NOT = 'will probably not run';

function htmlToRequirementLines(value) {
	const normalized = normalizeUtf8Text(String(value ?? ''));
	if (!normalized) return [];

	const withLineHints = normalized
		.replace(/<\s*br\s*\/?>/gi, '\n')
		.replace(/<\/(p|div|li|tr|h[1-6]|section|article|table)>/gi, '\n')
		.replace(/<\/?(td|th)[^>]*>/gi, ' ');

	const decoded = decodeHtmlEntities(withLineHints);
	const flattened = String(decoded || '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\r/g, '')
		.replace(/[ \t]+\n/g, '\n')
		.replace(/\n[ \t]+/g, '\n')
		.replace(/\n{2,}/g, '\n')
		.replace(/[ \t]{2,}/g, ' ')
		.trim();

	return flattened
		.split(/\n|;|•|\u2022/g)
		.map((line) => normalizeUtf8Text(String(line || '').trim()))
		.filter(Boolean);
}

function parseSizeInGb(text) {
	const raw = String(text || '').toLowerCase();
	if (!raw) return null;

	const matches = Array.from(raw.matchAll(/(\d+(?:[.,]\d+)?)\s*(tb|gb|gib|mb|mib)\b/g));
	if (matches.length < 1) return null;

	let best = null;
	for (const match of matches) {
		const numeric = Number(String(match[1] || '').replace(',', '.'));
		if (!Number.isFinite(numeric) || numeric <= 0) continue;
		const unit = String(match[2] || '').toLowerCase();

		let gbValue = numeric;
		if (unit === 'tb') gbValue = numeric * 1024;
		if (unit === 'mb' || unit === 'mib') gbValue = numeric / 1024;

		if (!Number.isFinite(gbValue) || gbValue <= 0) continue;
		best = best == null ? gbValue : Math.max(best, gbValue);
	}

	return best == null ? null : Number(best.toFixed(2));
}

function collectCpuScores(value) {
	const text = String(value || '').toLowerCase();
	if (!text) return [];

	const scores = [];

	for (const match of text.matchAll(/(?:intel\s*(?:core\s*)?)?i([3579])[-\s]?(\d{3,5})?/g)) {
		const tier = Number(match[1]);
		const digits = String(match[2] || '').replace(/\D/g, '');
		if (!Number.isFinite(tier) || tier <= 0) continue;

		let generation = 0;
		if (digits.length >= 5) generation = Number(digits.slice(0, 2));
		else if (digits.length >= 4) generation = Number(digits.slice(0, 1));
		else if (digits.length >= 3) generation = Number(digits.slice(0, 1));

		const modelWeight = digits.length > 0 ? Number(digits.slice(-2)) / 100 : 0;
		scores.push((tier * 100) + (generation * 8) + modelWeight);
	}

	for (const match of text.matchAll(/ryzen\s*([3579])\s*(\d{3,5})?/g)) {
		const tier = Number(match[1]);
		const digits = String(match[2] || '').replace(/\D/g, '');
		if (!Number.isFinite(tier) || tier <= 0) continue;

		let generation = 0;
		if (digits.length >= 5) generation = Number(digits.slice(0, 2));
		else if (digits.length >= 4) generation = Number(digits.slice(0, 1));
		else if (digits.length >= 3) generation = Number(digits.slice(0, 1));

		const modelWeight = digits.length > 0 ? Number(digits.slice(-2)) / 100 : 0;
		scores.push((tier * 100) + (generation * 8) + modelWeight);
	}

	for (const match of text.matchAll(/\bfx[-\s]?(\d{3,4})\b/g)) {
		const fxModel = Number(match[1]);
		if (!Number.isFinite(fxModel) || fxModel <= 0) continue;
		scores.push(250 + (fxModel / 100));
	}

	return scores;
}

function collectGpuScores(value) {
	const text = String(value || '').toLowerCase();
	if (!text) return [];

	const scores = [];

	for (const match of text.matchAll(/rtx\s*(\d{3,4})/g)) {
		const model = Number(match[1]);
		if (!Number.isFinite(model) || model <= 0) continue;
		scores.push(5000 + model);
	}

	for (const match of text.matchAll(/gtx\s*(\d{3,4})/g)) {
		const model = Number(match[1]);
		if (!Number.isFinite(model) || model <= 0) continue;
		scores.push(4000 + model);
	}

	for (const match of text.matchAll(/(?:^|[^a-z])rx\s*([4-9]\d{2,3})/g)) {
		const model = Number(match[1]);
		if (!Number.isFinite(model) || model <= 0) continue;
		scores.push(3600 + model);
	}

	for (const match of text.matchAll(/radeon\s*hd\s*(\d{3,4})/g)) {
		const model = Number(match[1]);
		if (!Number.isFinite(model) || model <= 0) continue;
		scores.push(2400 + model);
	}

	for (const match of text.matchAll(/arc\s*([a-z])?\s*(\d{3})/g)) {
		const letter = String(match[1] || '').toUpperCase();
		const model = Number(match[2]);
		if (!Number.isFinite(model) || model <= 0) continue;
		const letterWeight = letter ? Math.max(0, letter.charCodeAt(0) - 64) : 1;
		scores.push(3500 + (letterWeight * 10) + model);
	}

	if (scores.length < 1 && /(uhd|iris|integrated|vega)/i.test(text)) {
		scores.push(2200);
	}

	return scores;
}

function parseCpuFrequencyRequirementGhz(value) {
	const text = String(value || '').toLowerCase();
	if (!text) return null;

	const matches = Array.from(text.matchAll(/(\d+(?:[.,]\d+)?)\s*(ghz|mhz)\b/g));
	if (matches.length < 1) return null;

	let best = null;
	for (const match of matches) {
		const numeric = Number(String(match[1] || '').replace(',', '.'));
		if (!Number.isFinite(numeric) || numeric <= 0) continue;
		const unit = String(match[2] || '').toLowerCase();

		const ghz = unit === 'mhz' ? (numeric / 1000) : numeric;
		if (!Number.isFinite(ghz) || ghz <= 0) continue;
		best = best == null ? ghz : Math.max(best, ghz);
	}

	return best == null ? null : Number(best.toFixed(2));
}

function parseGpuVramRequirementMb(value) {
	const text = String(value || '').toLowerCase();
	if (!text) return null;
	if (!/\b(graphics|gpu|video\s*card|videocard|nvidia|geforce|radeon|arc|intel\s*arc|amd|rtx|gtx|\brx\s*\d|vram|video\s*memory)\b/.test(text)) {
		return null;
	}

	const parseNumericToken = (rawToken) => {
		let numericText = String(rawToken || '').replace(/\s+/g, '');
		if (!numericText) return null;

		if (numericText.includes(',') && numericText.includes('.')) {
			const lastComma = numericText.lastIndexOf(',');
			const lastDot = numericText.lastIndexOf('.');
			if (lastComma > lastDot) {
				numericText = numericText.replace(/\./g, '').replace(',', '.');
			} else {
				numericText = numericText.replace(/,/g, '');
			}
		} else if (numericText.includes(',')) {
			if (/^\d{1,3}(,\d{3})+$/.test(numericText)) {
				numericText = numericText.replace(/,/g, '');
			} else {
				numericText = numericText.replace(',', '.');
			}
		} else if (numericText.includes('.')) {
			if (/^\d{1,3}(\.\d{3})+$/.test(numericText)) {
				numericText = numericText.replace(/\./g, '');
			}
		}

		const numeric = Number(numericText);
		if (!Number.isFinite(numeric) || numeric <= 0) return null;
		return numeric;
	};

	/** @type {number[]} */
	const candidates = [];
	const pushCandidate = (rawNumeric, rawUnit) => {
		const numeric = parseNumericToken(rawNumeric);
		if (!Number.isFinite(numeric) || numeric <= 0) return;

		const unit = String(rawUnit || '').toLowerCase();
		let mb = numeric;
		if (unit === 'g' || unit === 'gb' || unit === 'gib') mb = numeric * 1024;
		if (unit === 'm' || unit === 'mb' || unit === 'mib') mb = numeric;
		if (!Number.isFinite(mb) || mb <= 0) return;

		candidates.push(Number(mb.toFixed(2)));
	};

	const directMatches = Array.from(
		text.matchAll(/(\d+(?:[.,]\d+)?)\s*(g|gb|gib|m|mb|mib)\s*(?:of\s*)?(?:video\s*)?(?:memory|vram)\b/g)
	);
	for (const match of directMatches) {
		pushCandidate(match[1], match[2]);
	}

	const modelScopedMatches = Array.from(
		text.matchAll(/(?:gtx|rtx|rx|radeon|geforce|arc|intel\s*arc|nvidia|amd)[^,;\n]{0,32}?(\d+(?:[.,]\d+)?)\s*(g|gb|gib|m|mb|mib)\b/g)
	);
	for (const match of modelScopedMatches) {
		const contextWindow = String(match[0] || '');
		if (/\b(storage|space|disk|hdd|ssd)\b/.test(contextWindow)) continue;
		pushCandidate(match[1], match[2]);
	}

	const sizeThenModelMatches = Array.from(
		text.matchAll(/(\d+(?:[.,]\d+)?)\s*(g|gb|gib|m|mb|mib)\b[^,;\n]{0,24}?(?:gtx|rtx|rx|radeon|geforce|arc|intel\s*arc|nvidia|amd)\b/g)
	);
	for (const match of sizeThenModelMatches) {
		const contextWindow = String(match[0] || '');
		if (/\b(ram|system\s*memory|storage|space|disk|hdd|ssd)\b/.test(contextWindow)) continue;
		pushCandidate(match[1], match[2]);
	}

	if (candidates.length > 0) {
		// Treat "or" alternatives as alternative minimum branches; choose the smallest valid VRAM threshold.
		return Number(Math.min(...candidates).toFixed(2));
	}

	return null;
}

function parseShaderModelRequirement(value) {
	const text = String(value || '').toLowerCase();
	if (!text) return null;

	const match = text.match(/shader\s*model\s*(\d+(?:[.,]\d+)?)/i);
	if (!match || !match[1]) return null;

	const parsed = Number(String(match[1]).replace(',', '.'));
	if (!Number.isFinite(parsed) || parsed <= 0) return null;
	return Number(parsed.toFixed(2));
}

function inferLikelyShaderModelFromGpuNames(gpuNames) {
	const names = Array.isArray(gpuNames) ? gpuNames : [];
	if (names.length < 1) return null;

	let best = null;
	for (const name of names) {
		const lower = String(name || '').toLowerCase();
		if (!lower) continue;
		if (/swiftshader|microsoft basic render driver|software rasterizer|llvmpipe|virtualbox|vmware/.test(lower)) {
			continue;
		}

		let inferred = null;
		if (/rtx|gtx|geforce|radeon\s*rx|\brx\s*\d|arc\s*[a-z]?\s*\d|iris\s*xe|uhd\s*graphics|vega|intel\s*arc/.test(lower)) {
			inferred = 6;
		} else if (/radeon|intel\s*hd|nvidia|amd/.test(lower)) {
			inferred = 5;
		}

		if (inferred != null) {
			best = best == null ? inferred : Math.max(best, inferred);
		}
	}

	return best == null ? null : Number(best.toFixed(2));
}

function pickRequirementScore(scores) {
	const valid = Array.isArray(scores) ? scores.filter((entry) => Number.isFinite(entry) && entry > 0) : [];
	if (valid.length < 1) return null;
	return Math.min(...valid);
}

function pickLocalScore(scores) {
	const valid = Array.isArray(scores) ? scores.filter((entry) => Number.isFinite(entry) && entry > 0) : [];
	if (valid.length < 1) return null;
	return Math.max(...valid);
}

function parseMinimumRequirementsProfile(minimumRequirementsHtml) {
	const lines = htmlToRequirementLines(minimumRequirementsHtml);
	const fullText = lines.join(' ');

	let ramGb = null;
	let storageGb = null;
	let cpuScores = [];
	let gpuScores = [];
	let cpuMinGhz = null;
	let gpuVramMb = null;
	let shaderModelMin = null;

	for (const line of lines) {
		const lower = String(line || '').toLowerCase();

		if (/\b(memory|ram)\b/.test(lower)) {
			const parsed = parseSizeInGb(lower);
			if (parsed != null) ramGb = ramGb == null ? parsed : Math.max(ramGb, parsed);
		}

		if (/\b(storage|available\s*space|hard\s*drive|disk\s*space|hdd|ssd)\b/.test(lower)) {
			const parsed = parseSizeInGb(lower);
			if (parsed != null) storageGb = storageGb == null ? parsed : Math.max(storageGb, parsed);
		}

		if (/\b(processor|cpu)\b/.test(lower)) {
			cpuScores = cpuScores.concat(collectCpuScores(lower));
			const parsedCpuFrequency = parseCpuFrequencyRequirementGhz(lower);
			if (parsedCpuFrequency != null) {
				cpuMinGhz = cpuMinGhz == null ? parsedCpuFrequency : Math.max(cpuMinGhz, parsedCpuFrequency);
			}
		}

		if (/\b(graphics|gpu|video\s*card|videocard|nvidia|geforce|radeon|rtx|gtx|\brx\s*\d)\b/.test(lower)) {
			gpuScores = gpuScores.concat(collectGpuScores(lower));
			const parsedGpuVram = parseGpuVramRequirementMb(lower);
			if (parsedGpuVram != null) {
				gpuVramMb = gpuVramMb == null ? parsedGpuVram : Math.min(gpuVramMb, parsedGpuVram);
			}

			const parsedShaderModel = parseShaderModelRequirement(lower);
			if (parsedShaderModel != null) {
				shaderModelMin = shaderModelMin == null ? parsedShaderModel : Math.max(shaderModelMin, parsedShaderModel);
			}
		}
	}

	if (ramGb == null) {
		const fullRam = /\b(memory|ram)\b/.test(fullText.toLowerCase()) ? parseSizeInGb(fullText) : null;
		if (fullRam != null) ramGb = fullRam;
	}
	if (storageGb == null) {
		const fullStorage = /\b(storage|available\s*space|hard\s*drive|disk\s*space|hdd|ssd)\b/.test(fullText.toLowerCase())
			? parseSizeInGb(fullText)
			: null;
		if (fullStorage != null) storageGb = fullStorage;
	}

	if (cpuScores.length < 1) cpuScores = collectCpuScores(fullText);
	if (gpuScores.length < 1) gpuScores = collectGpuScores(fullText);
	if (cpuMinGhz == null) cpuMinGhz = parseCpuFrequencyRequirementGhz(fullText);
	if (gpuVramMb == null && /\b(vram|video\s*memory)\b/.test(fullText.toLowerCase())) {
		gpuVramMb = parseGpuVramRequirementMb(fullText);
	}
	if (shaderModelMin == null) shaderModelMin = parseShaderModelRequirement(fullText);

	return {
		ramGb,
		storageGb,
		cpuScore: pickRequirementScore(cpuScores),
		gpuScore: pickRequirementScore(gpuScores),
		cpuMinGhz,
		gpuVramMb,
		shaderModelMin,
	};
}

function compareRequirementMetric(localValue, requiredValue) {
	if (!Number.isFinite(requiredValue) || requiredValue <= 0) return null;
	if (!Number.isFinite(localValue) || localValue <= 0) return 'borderline';

	const ratio = localValue / requiredValue;
	if (ratio < 0.97) return 'fail';
	if (ratio <= 1.12) return 'borderline';
	return 'pass';
}

function compareGpuPerformanceMetric(localValue, requiredValue) {
	if (!Number.isFinite(requiredValue) || requiredValue <= 0) return null;
	if (!Number.isFinite(localValue) || localValue <= 0) return 'borderline';

	const ratio = localValue / requiredValue;
	// GPU model parsing is heuristic. Keep this slightly looser so close classes become "borderline".
	if (ratio < 0.8) return 'fail';
	if (ratio <= 1.08) return 'borderline';
	return 'pass';
}

function formatNumberCompact(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return 'unknown';
	return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2);
}

function evaluateMinimumRequirements(minimumRequirementsHtml, hardwareProfile) {
	const requirements = parseMinimumRequirementsProfile(minimumRequirementsHtml);

	const localRamGb = Number(hardwareProfile?.totalMemoryGb || 0);
	const localFreeDiskGb = Number(hardwareProfile?.freeDiskGbMax || 0);
	const localCpuGhz = Number(hardwareProfile?.cpuSpeedGhz || 0);
	const localCpuScore = pickLocalScore(collectCpuScores(hardwareProfile?.cpuModel || ''));
	const localGpuScore = pickLocalScore(
		(Array.isArray(hardwareProfile?.gpuModels) ? hardwareProfile.gpuModels : [])
			.flatMap((entry) => collectGpuScores(entry))
	);
	const localGpuVramMb = Number(hardwareProfile?.gpuMemoryMbMax || 0);
	const localShaderModel = inferLikelyShaderModelFromGpuNames(hardwareProfile?.gpuModels);
	const hasNamedGpuModel = (Array.isArray(hardwareProfile?.gpuModels) ? hardwareProfile.gpuModels : [])
		.some((entry) => {
			const lower = String(entry || '').toLowerCase();
			if (!lower) return false;
			return !/swiftshader|microsoft basic render driver|software rasterizer|llvmpipe|virtualbox|vmware/.test(lower);
		});

	const checks = [];
	const details = [];
	let cpuComparisonLogged = false;

	if (requirements.ramGb != null) {
		const state = compareRequirementMetric(localRamGb, requirements.ramGb);
		if (state) checks.push(state);
		details.push(`RAM: required ${formatNumberCompact(requirements.ramGb)} GB, detected ${formatNumberCompact(localRamGb)} GB`);
	}

	if (requirements.storageGb != null) {
		if (Number.isFinite(localFreeDiskGb) && localFreeDiskGb > 0) {
			const state = compareRequirementMetric(localFreeDiskGb, requirements.storageGb);
			if (state) checks.push(state);
			details.push(`Storage: required ${formatNumberCompact(requirements.storageGb)} GB free, detected ${formatNumberCompact(localFreeDiskGb)} GB free`);
		} else {
			details.push(`Storage: required ${formatNumberCompact(requirements.storageGb)} GB (free space check unavailable)`);
		}
	}

	if (requirements.cpuScore != null) {
		const state = compareRequirementMetric(localCpuScore, requirements.cpuScore);
		if (state) checks.push(state);
		details.push(`CPU: requirement parsed, detected CPU ${String(hardwareProfile?.cpuModel || 'unknown')}`);
		const comparedPercent = Number.isFinite(localCpuScore) && localCpuScore > 0 && Number.isFinite(requirements.cpuScore) && requirements.cpuScore > 0
			? ((localCpuScore / requirements.cpuScore) * 100)
			: null;
		if (comparedPercent != null && Number.isFinite(comparedPercent)) {
			details.push(
				`CPU compared: ${formatNumberCompact(localCpuScore)} / ${formatNumberCompact(requirements.cpuScore)} (${comparedPercent.toFixed(1)}%)`
			);
		} else {
			details.push('CPU compared: numerical comparison unavailable for this requirement format');
		}
		cpuComparisonLogged = true;
	}

	if (requirements.cpuMinGhz != null) {
		const state = compareRequirementMetric(localCpuGhz, requirements.cpuMinGhz);
		if (state) checks.push(state);
		details.push(
			`CPU Clock: required ${formatNumberCompact(requirements.cpuMinGhz)} GHz, detected ${formatNumberCompact(localCpuGhz)} GHz`
		);
		cpuComparisonLogged = true;
	}

	if (!cpuComparisonLogged) {
		details.push('CPU compared: requirement could not be parsed numerically from the minimum spec text');
	}

	if (requirements.gpuScore != null) {
		const state = compareGpuPerformanceMetric(localGpuScore, requirements.gpuScore);
		if (state) checks.push(state);
		details.push(`GPU: requirement parsed, detected GPU ${(Array.isArray(hardwareProfile?.gpuModels) ? hardwareProfile.gpuModels.join(', ') : '') || 'unknown'}`);
	}

	if (requirements.gpuVramMb != null) {
		if (Number.isFinite(localGpuVramMb) && localGpuVramMb > 0) {
			const state = compareRequirementMetric(localGpuVramMb, requirements.gpuVramMb);
			if (state) checks.push(state);
			const comparedPercent = Number.isFinite(requirements.gpuVramMb) && requirements.gpuVramMb > 0
				? ((localGpuVramMb / requirements.gpuVramMb) * 100)
				: null;
			details.push(
				`GPU Memory: required ${formatNumberCompact(requirements.gpuVramMb)} MB, detected ${formatNumberCompact(localGpuVramMb)} MB`
			);
			if (comparedPercent != null && Number.isFinite(comparedPercent)) {
				details.push(
					`GPU Memory compared: ${formatNumberCompact(localGpuVramMb)} / ${formatNumberCompact(requirements.gpuVramMb)} MB (${comparedPercent.toFixed(1)}%)`
				);
			}
		} else if (hasNamedGpuModel && Number(requirements.gpuVramMb) <= 512) {
			checks.push('pass');
			details.push(
				`GPU Memory: required ${formatNumberCompact(requirements.gpuVramMb)} MB, VRAM unavailable (legacy-sized requirement assumed met from detected adapter)`
			);
		} else {
			checks.push('borderline');
			details.push(
				`GPU Memory: required ${formatNumberCompact(requirements.gpuVramMb)} MB (local VRAM detection unavailable)`
			);
		}
	}

	if (requirements.shaderModelMin != null) {
		if (Number.isFinite(localShaderModel) && localShaderModel > 0) {
			const state = compareRequirementMetric(localShaderModel, requirements.shaderModelMin);
			if (state) checks.push(state);
			details.push(
				`Shader Model: required ${formatNumberCompact(requirements.shaderModelMin)}+, inferred ${formatNumberCompact(localShaderModel)}`
			);
		} else if (hasNamedGpuModel && Number(requirements.shaderModelMin) <= 3) {
			checks.push('pass');
			details.push(
				`Shader Model: required ${formatNumberCompact(requirements.shaderModelMin)}+, detected adapter is assumed compatible`
			);
		} else {
			checks.push('borderline');
			details.push(
				`Shader Model: required ${formatNumberCompact(requirements.shaderModelMin)}+ (local support could not be inferred)`
			);
		}
	}

	if (checks.length < 1) {
		return {
			verdict: REQUIREMENT_CHECK_HOPES,
			details: ['Could not reliably parse minimum requirements.'],
		};
	}

	if (checks.includes('fail')) {
		return {
			verdict: REQUIREMENT_CHECK_PROBABLY_NOT,
			details,
		};
	}

	if (checks.includes('borderline')) {
		return {
			verdict: REQUIREMENT_CHECK_HOPES,
			details,
		};
	}

	return {
		verdict: REQUIREMENT_CHECK_SHOULD_RUN,
		details,
	};
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
	return new Promise((resolve, reject) => {
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			reject(new Error(timeoutMessage || `Operation timed out after ${timeoutMs}ms`));
		}, Math.max(0, Number(timeoutMs) || 0));

		Promise.resolve(promise)
			.then((value) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				resolve(value);
			})
			.catch((error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				reject(error);
			});
	});
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

function isHttpImageUrl(value) {
	return /^https?:\/\//i.test(String(value || '').trim());
}

function uniqueImageCandidates(values) {
	const out = [];
	const seen = new Set();

	for (const value of Array.isArray(values) ? values : []) {
		const href = String(value || '').trim();
		if (!href || !isHttpImageUrl(href)) continue;
		const key = href.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(href);
	}

	return out;
}

function buildSteamAssetCandidates(appId, fileNames) {
	const numericAppId = Number(appId);
	if (!Number.isFinite(numericAppId) || numericAppId <= 0) return [];

	const out = [];
	const seen = new Set();

	for (const host of STORE_STEAM_IMAGE_CDN_HOSTS) {
		for (const fileName of fileNames || []) {
			const name = String(fileName || '').trim();
			if (!name) continue;
			const href = `${host}/steam/apps/${Math.trunc(numericAppId)}/${name}`;
			const key = href.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(href);
		}
	}

	return out;
}

function buildSteamCoverCandidates(appId) {
	return buildSteamAssetCandidates(appId, [
		'library_600x900_2x.jpg',
		'library_600x900.jpg',
		'library_600x900_2x.png',
		'library_600x900.png',
		'header.jpg',
		'capsule_616x353.jpg',
	]);
}

function buildSteamHeroCandidates(appId) {
	return buildSteamAssetCandidates(appId, [
		'library_hero.jpg',
		'header.jpg',
		'capsule_616x353.jpg',
		'capsule_467x181.jpg',
	]);
}

function buildSteamBannerCandidates(appId) {
	// Banner candidates prioritized for DB: prefer header / capsule (wide) over vertical library hero
	const candidates = buildSteamAssetCandidates(appId, [
		'header.jpg',
		'capsule_616x353.jpg',
		'library_hero.jpg',
		'capsule_467x181.jpg',
	]);

	// Also include the shared.akamai store_item_assets host variant which some Steam images use
	const id = Number(appId);
	if (Number.isFinite(id) && id > 0) {
		candidates.push(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${Math.trunc(id)}/header.jpg`);
		candidates.push(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${Math.trunc(id)}/capsule_616x353.jpg`);
	}

	return candidates;
}

async function probeImageUrlReachable(url, timeoutMs = STORE_STEAM_IMAGE_PROBE_TIMEOUT_MS) {
	const href = String(url || '').trim();
	if (!isHttpImageUrl(href)) return false;
	if (typeof Image === 'undefined') return false;

	const cacheKey = href.toLowerCase();
	const cached = storeSteamImageProbeCache.get(cacheKey);
	if (cached === true) return true;
	if (cached && typeof cached.then === 'function') {
		const result = await cached;
		return result === true;
	}

	const probePromise = new Promise((resolve) => {
		let settled = false;
		const image = new Image();

		const finish = (ok) => {
			if (settled) return;
			settled = true;
			image.onload = null;
			image.onerror = null;
			resolve(ok === true);
		};

		const timer = window.setTimeout(() => {
			finish(false);
		}, Math.max(1200, Number(timeoutMs) || STORE_STEAM_IMAGE_PROBE_TIMEOUT_MS));

		image.onload = () => {
			window.clearTimeout(timer);
			finish(true);
		};
		image.onerror = () => {
			window.clearTimeout(timer);
			finish(false);
		};

		image.decoding = 'async';
		image.loading = 'eager';
		image.src = href;
	});

	storeSteamImageProbeCache.set(cacheKey, probePromise);
	const reachable = await probePromise;

	if (reachable) {
		storeSteamImageProbeCache.set(cacheKey, true);
	} else {
		storeSteamImageProbeCache.delete(cacheKey);
	}

	return reachable;
}

async function resolveFirstLoadableImageUrl(candidates) {
	for (const candidate of uniqueImageCandidates(candidates)) {
		// eslint-disable-next-line no-await-in-loop
		const reachable = await probeImageUrlReachable(candidate);
		if (reachable) return candidate;
	}

	return '';
}

function normalizePlatformName(value) {
	return normalizeStorePlatform(value, 'steam');
}

function hasFilledText(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function normalizeUtf8Text(value) {
	if (typeof value !== 'string') return '';
	const input = value.replace(/\u0000/g, '').trim();
	if (!input) return '';

	if (/[ÃÂâ]/.test(input)) {
		try {
			const bytes = Uint8Array.from([...input].map((char) => char.charCodeAt(0) & 0xff));
			const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes).trim();
			if (decoded && !decoded.includes('\uFFFD')) {
				return decoded.normalize('NFC');
			}
		} catch {
			// keep original
		}
	}

	return input.normalize('NFC');
}

function decodeHtmlEntities(value) {
	const normalized = normalizeUtf8Text(String(value ?? ''));
	if (!normalized) return '';
	if (typeof window === 'undefined' || typeof window.DOMParser !== 'function') return normalized;
	try {
		const parser = new window.DOMParser();
		const doc = parser.parseFromString(`<!doctype html><body>${normalized}`, 'text/html');
		return normalizeUtf8Text(doc?.body?.textContent || normalized);
	} catch {
		return normalized;
	}
}

function stripTagArtifacts(value) {
	const normalized = normalizeUtf8Text(String(value ?? ''));
	if (!normalized) return '';
	return normalizeUtf8Text(
		normalized
			.replace(/<\/?[^>]+>/g, ' ')
			.replace(/\s{2,}/g, ' ')
			.trim()
	);
}

function htmlToText(value) {
	const normalized = normalizeUtf8Text(String(value ?? ''));
	if (!normalized) return '';
	if (typeof window === 'undefined' || typeof window.DOMParser !== 'function') {
		return stripTagArtifacts(normalized);
	}

	try {
		const parser = new window.DOMParser();
		const doc = parser.parseFromString(normalized, 'text/html');
		const firstPass = normalizeUtf8Text(doc?.body?.textContent || normalized);
		const decoded = decodeHtmlEntities(firstPass);

		if (decoded.includes('<') && decoded.includes('>')) {
			const secondDoc = parser.parseFromString(decoded, 'text/html');
			const secondPass = normalizeUtf8Text(secondDoc?.body?.textContent || decoded);
			return stripTagArtifacts(secondPass);
		}

		return stripTagArtifacts(decoded);
	} catch {
		return stripTagArtifacts(normalized);
	}
}

function sanitizeHtml(value) {
	const normalized = normalizeUtf8Text(String(value ?? ''));
	if (!normalized) return '';
	if (typeof window === 'undefined' || typeof window.DOMParser !== 'function') return normalized;

	try {
		const parser = new window.DOMParser();
		const doc = parser.parseFromString(normalized, 'text/html');
		doc.querySelectorAll('script, style, iframe, object, embed').forEach((node) => node.remove());
		doc.querySelectorAll('*').forEach((node) => {
			for (const attr of [...node.attributes]) {
				const key = String(attr.name || '').toLowerCase();
				if (key.startsWith('on')) node.removeAttribute(attr.name);
			}
		});
		return normalizeUtf8Text(doc?.body?.innerHTML || normalized);
	} catch {
		return normalized;
	}
}

function normalizeScreenshotList(values) {
	const source = Array.isArray(values) ? values : [values];
	const out = [];
	const seen = new Set();

	for (const value of source) {
		const href = normalizeUtf8Text(String(value ?? ''));
		if (!href) continue;
		const key = href.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(href);
	}

	return out;
}

function pickFirstFilledText(...values) {
	for (const value of values) {
		if (hasFilledText(value)) return String(value).trim();
	}
	return '';
}

function resolveTemplatedImageHref(value, formatter = '1600') {
	const raw = String(value || '').trim();
	if (!raw) return '';
	if (raw.includes('_{formatter}')) return raw.replace('_{formatter}', `_${formatter}`);
	if (raw.includes('{formatter}')) return raw.replace('{formatter}', formatter);
	return raw;
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

const ZERO_DECIMAL_CURRENCIES = new Set([
	'BIF',
	'CLP',
	'DJF',
	'GNF',
	'ISK',
	'JPY',
	'KMF',
	'KRW',
	'PYG',
	'RWF',
	'UGX',
	'VND',
	'VUV',
	'XAF',
	'XOF',
	'XPF',
]);

function parsePriceFromFormattedText(rawValue) {
	const text = String(rawValue || '').trim();
	if (!text) return null;
	if (/^free$/i.test(text)) return 0;

	const compact = text.replace(/\s+/g, '');
	const numericLike = compact.replace(/[^0-9,.-]/g, '');
	if (!/[0-9]/.test(numericLike)) return null;

	const lastDot = numericLike.lastIndexOf('.');
	const lastComma = numericLike.lastIndexOf(',');
	const decimalSep = lastDot > lastComma ? '.' : (lastComma > -1 ? ',' : '');

	let normalized = numericLike;
	if (decimalSep) {
		const sepPattern = decimalSep === '.' ? /,/g : /\./g;
		normalized = normalized.replace(sepPattern, '');

		const lastDecimalIndex = normalized.lastIndexOf(decimalSep);
		if (lastDecimalIndex >= 0) {
			const left = normalized.slice(0, lastDecimalIndex).replace(new RegExp(`\\${decimalSep}`, 'g'), '');
			const right = normalized.slice(lastDecimalIndex + 1);
			if (right.length === 0) {
				normalized = left;
			} else if (right.length > 2 && left.length > 0) {
				// Likely thousands separator-only format (e.g. "1.999").
				normalized = `${left}${right}`;
			} else {
				normalized = `${left}.${right}`;
			}
		}
	} else {
		normalized = normalized.replace(/[.,]/g, '');
	}

	const parsed = Number(normalized);
	if (!Number.isFinite(parsed) || parsed < 0) return null;
	return Number(parsed.toFixed(2));
}

function resolveSteamPriceValue(details) {
	const raw = details?.raw && typeof details.raw === 'object' ? details.raw : {};
	const overview = raw?.price_overview && typeof raw.price_overview === 'object' ? raw.price_overview : null;

	if (overview) {
		const formattedFromOverview = parsePriceFromFormattedText(
			overview.final_formatted || overview.initial_formatted || ''
		);
		if (formattedFromOverview !== null) return formattedFromOverview;

		const finalNumeric = Number(overview.final);
		if (Number.isFinite(finalNumeric) && finalNumeric >= 0) {
			const currency = String(overview.currency || '').trim().toUpperCase();
			if (ZERO_DECIMAL_CURRENCIES.has(currency)) {
				return Number(finalNumeric.toFixed(2));
			}

			if (Number.isInteger(finalNumeric)) {
				if (finalNumeric >= 100) return Number((finalNumeric / 100).toFixed(2));
				return Number(finalNumeric.toFixed(2));
			}

			return Number(finalNumeric.toFixed(2));
		}
	}

	const directCandidates = [
		details?.price,
		details?.cost,
		details?.price_overview,
	];

	for (const candidate of directCandidates) {
		const normalized = normalizePriceValue(candidate, 'steam');
		if (normalized !== null) return normalized;
	}

	if (raw?.is_free === true || details?.raw?.is_free === true) return 0;
	return null;
}

function resolveSteamPriceLabel(details) {
	const raw = details?.raw && typeof details.raw === 'object' ? details.raw : {};
	const candidates = [
		raw?.price_overview?.final_formatted,
		raw?.price_overview?.initial_formatted,
		details?.priceLabel,
	];

	for (const candidate of candidates) {
		const label = String(candidate || '').trim();
		if (!label) continue;
		if (!/[0-9]/.test(label) && !/^free$/i.test(label)) continue;
		return label;
	}

	return null;
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

function pickBestAvailablePrice(...values) {
	let zeroPrice = null;

	for (const value of values) {
		const numeric = Number(value);
		if (!Number.isFinite(numeric) || numeric < 0) continue;
		if (numeric > 0) return Number(numeric.toFixed(2));
		if (numeric === 0 && zeroPrice == null) {
			zeroPrice = 0;
		}
	}

	return zeroPrice;
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

function isExactTitleMatch(candidateTitle, expectedTitles) {
	if (!Array.isArray(expectedTitles) || expectedTitles.length < 1) return true;
	const normalizedCandidate = normalizeTitleForCompare(candidateTitle);
	if (!normalizedCandidate) return false;
	return expectedTitles.some((expectedTitle) => normalizeTitleForCompare(expectedTitle) === normalizedCandidate);
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
	const strictTitleThreshold = 0.18;
	const softTitleThreshold = 0.1;

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
	return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, separator);
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

	if (platform === 'steam') {
		const getByTitle = typeof api?.getSteamGameDetailsByTitle === 'function' ? api.getSteamGameDetailsByTitle : null;
		if (!getByTitle) return null;
		for (const title of titleHints) {
			if (!hasFilledText(title)) continue;
			const details = await getByTitle(title, cc);
			if (!details || typeof details !== 'object') continue;
			const candidateTitle = details?.name || details?.title || details?.raw?.name || details?.raw?.search_match?.title || '';
			if (isExactTitleMatch(candidateTitle, titleHints)) return details;
		}
		return null;
	}

	if (platform === 'gog') {
		const getByTitle = typeof api?.getGogGameDetailsByTitle === 'function' ? api.getGogGameDetailsByTitle : null;
		const getBySlug = typeof api?.getGogGameDetails === 'function' ? api.getGogGameDetails : null;
		for (const title of titleHints) {
			if (!hasFilledText(title)) continue;
			if (getByTitle) {
				const details = await getByTitle(title);
				if (details && typeof details === 'object' && isExactTitleMatch(details?.title || details?.name || '', titleHints)) {
					return details;
				}
			}

			const slugCandidates = buildGogTitleSlugs(title);
			for (const slug of slugCandidates) {
				if (!getBySlug) continue;
				const details = await getBySlug(slug);
				if (details && typeof details === 'object' && isExactTitleMatch(details?.title || details?.name || '', titleHints)) {
					return details;
				}
			}
		}
		return null;
	}

	if (platform === 'itchio') {
		const getByTitle = typeof api?.getItchGameDetailsByTitle === 'function' ? api.getItchGameDetailsByTitle : null;
		if (!getByTitle) return null;
		for (const title of titleHints) {
			if (!hasFilledText(title)) continue;
			const details = await getByTitle(title);
			if (!details || typeof details !== 'object') continue;
			if (isExactTitleMatch(details?.title || details?.name || '', titleHints)) return details;
		}
		return null;
	}

	return null;
}

function toPositiveNumber(value) {
	const numeric = Number(value);
	return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function toAbsoluteStoreHref(platform, href) {
	const raw = String(href || '').trim();
	if (!raw) return '';
	if (/^https?:\/\//i.test(raw)) return raw;
	if (raw.startsWith('//')) return `https:${raw}`;
	if (raw.startsWith('/')) {
		if (platform === 'gog') return `https://www.gog.com${raw}`;
		if (platform === 'steam') return `https://store.steampowered.com${raw}`;
		if (platform === 'itchio') return `https://itch.io${raw}`;
	}
	return raw;
}

function parseLooseNumber(value) {
	if (typeof value === 'number' && Number.isFinite(value)) return value;

	const raw = String(value ?? '').trim();
	if (!raw) return null;

	const cleaned = raw.replace(/\s+/g, '').replace(/[^0-9,.-]/g, '');
	if (!cleaned || !/[0-9]/.test(cleaned)) return null;

	const lastDot = cleaned.lastIndexOf('.');
	const lastComma = cleaned.lastIndexOf(',');
	let normalized = cleaned;

	if (lastDot > -1 || lastComma > -1) {
		const decimalIndex = Math.max(lastDot, lastComma);
		const integerPart = cleaned.slice(0, decimalIndex).replace(/[.,]/g, '');
		const fractionPart = cleaned.slice(decimalIndex + 1).replace(/[.,]/g, '');

		if (fractionPart.length > 0 && fractionPart.length <= 2) {
			normalized = `${integerPart}.${fractionPart}`;
		} else {
			normalized = `${integerPart}${fractionPart}`;
		}
	} else {
		normalized = cleaned;
	}

	const numeric = Number(normalized);
	return Number.isFinite(numeric) ? numeric : null;
}

function formatReviewCount(value) {
	const numeric = Number(value);
	if (!Number.isFinite(numeric) || numeric <= 0) return '';
	return new Intl.NumberFormat().format(Math.round(numeric));
}

function getRendererCloudscraperFetch() {
	if (typeof window === 'undefined') return null;
	const candidate = window?.electronAPI?.cloudscraperFetch;
	return typeof candidate === 'function' ? candidate : null;
}

function isCrossOriginUrlInBrowser(url) {
	if (typeof window === 'undefined') return false;

	try {
		const origin = String(window?.location?.origin || '').trim();
		if (!origin) return false;
		const resolved = new URL(String(url || '').trim(), window.location.href);
		return resolved.origin !== origin;
	} catch {
		return false;
	}
}

async function fetchViaElectronCloudscraper(cloudscraperFetch, url, options = {}, timeoutMs = STORE_RATING_FETCH_TIMEOUT_MS) {
	if (typeof cloudscraperFetch !== 'function') return null;

	const payload = await withTimeout(
		cloudscraperFetch(url, options),
		Math.max(1200, Number(timeoutMs) || STORE_RATING_FETCH_TIMEOUT_MS),
		`Cloudscraper request timed out after ${timeoutMs}ms`,
	);

	const statusCode = Number(payload?.statusCode || 0);
	const ok = payload?.ok === true || (statusCode >= 200 && statusCode < 300);
	if (!ok) {
		throw new Error(`HTTP ${statusCode || 0}`);
	}

	return payload;
}

async function fetchJsonWithTimeout(url, timeoutMs = STORE_RATING_FETCH_TIMEOUT_MS) {
	const href = String(url || '').trim();
	if (!href) return null;

	const cloudscraperFetch = getRendererCloudscraperFetch();
	if (cloudscraperFetch) {
		const payload = await fetchViaElectronCloudscraper(
			cloudscraperFetch,
			href,
			{
				method: 'GET',
				headers: {
					Accept: 'application/json',
				},
			},
			timeoutMs,
		);

		const body = String(payload?.body || '').trim();
		if (!body) return null;
		return JSON.parse(body);
	}

	if (isCrossOriginUrlInBrowser(href)) {
		return null;
	}

	const controller = typeof AbortController === 'function' ? new AbortController() : null;
	const timer = controller
		? setTimeout(() => controller.abort(), Math.max(1200, Number(timeoutMs) || STORE_RATING_FETCH_TIMEOUT_MS))
		: null;

	try {
		const response = await fetch(href, {
			method: 'GET',
			headers: {
				Accept: 'application/json',
			},
			credentials: 'omit',
			cache: 'no-store',
			signal: controller?.signal,
		});

		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return await response.json();
	} finally {
		if (timer != null) clearTimeout(timer);
	}
}

async function fetchTextWithTimeout(url, timeoutMs = STORE_RATING_FETCH_TIMEOUT_MS) {
	const href = String(url || '').trim();
	if (!href) return '';

	const cloudscraperFetch = getRendererCloudscraperFetch();
	if (cloudscraperFetch) {
		const payload = await fetchViaElectronCloudscraper(
			cloudscraperFetch,
			href,
			{
				method: 'GET',
				headers: {
					Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				},
			},
			timeoutMs,
		);

		return String(payload?.body || '');
	}

	if (isCrossOriginUrlInBrowser(href)) {
		return '';
	}

	const controller = typeof AbortController === 'function' ? new AbortController() : null;
	const timer = controller
		? setTimeout(() => controller.abort(), Math.max(1200, Number(timeoutMs) || STORE_RATING_FETCH_TIMEOUT_MS))
		: null;

	try {
		const response = await fetch(href, {
			method: 'GET',
			headers: {
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			},
			credentials: 'omit',
			cache: 'no-store',
			signal: controller?.signal,
		});

		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return await response.text();
	} finally {
		if (timer != null) clearTimeout(timer);
	}
}

async function fetchSteamUserRating(appId) {
	const numericAppId = toPositiveNumber(appId);
	if (!numericAppId) return null;

	const payload = await fetchJsonWithTimeout(
		`https://store.steampowered.com/appreviews/${Math.trunc(numericAppId)}?json=1&language=all&purchase_type=all&num_per_page=0&filter=summary`,
	);
	const summary = payload && typeof payload === 'object' ? payload.query_summary : null;
	if (!summary || typeof summary !== 'object') return null;

	const totalReviews = Number(summary.total_reviews ?? 0);
	const totalPositive = Number(summary.total_positive ?? 0);
	const scorePercent = totalReviews > 0 && totalPositive >= 0
		? Math.round((totalPositive / Math.max(1, totalReviews)) * 100)
		: null;

	return {
		platform: 'steam',
		available: Number.isFinite(totalReviews) && totalReviews > 0,
		score: Number.isFinite(scorePercent) ? scorePercent : null,
		scoreScale: 100,
		reviewCount: Number.isFinite(totalReviews) && totalReviews > 0 ? Math.round(totalReviews) : null,
		summary: pickFirstFilledText(summary.review_score_desc),
		href: `https://store.steampowered.com/app/${Math.trunc(numericAppId)}`,
	};
}

function parseItchRatingFromHtml(html) {
	const source = String(html || '');
	if (!source) return null;

	const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
	let match;

	while ((match = scriptRegex.exec(source)) != null) {
		const jsonText = String(match[1] || '').trim();
		if (!jsonText) continue;

		let parsed;
		try {
			parsed = JSON.parse(jsonText);
		} catch {
			continue;
		}

		const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
		while (queue.length > 0) {
			const node = queue.shift();
			if (!node || typeof node !== 'object') continue;

			if (Array.isArray(node['@graph'])) {
				queue.push(...node['@graph']);
			}

			const aggregate = node.aggregateRating;
			if (!aggregate || typeof aggregate !== 'object') continue;

			const score = parseLooseNumber(aggregate.ratingValue);
			const reviewCount = parseLooseNumber(aggregate.ratingCount ?? aggregate.reviewCount);
			if (!Number.isFinite(score) || score <= 0) continue;

			return {
				score: Number(score.toFixed(1)),
				reviewCount: Number.isFinite(reviewCount) && reviewCount > 0 ? Math.round(reviewCount) : null,
				scoreScale: 5,
			};
		}
	}

	return null;
}

async function fetchItchUserRating(href) {
	const absoluteHref = toAbsoluteStoreHref('itchio', href);
	if (!isSpecificItchGameHref(absoluteHref)) return null;

	const html = await fetchTextWithTimeout(absoluteHref);
	const parsed = parseItchRatingFromHtml(html);
	if (!parsed) return null;

	return {
		platform: 'itchio',
		available: true,
		score: parsed.score,
		scoreScale: parsed.scoreScale,
		reviewCount: parsed.reviewCount,
		summary: 'Community rating',
		href: absoluteHref,
	};
}

function parseGogRatingFromHtml(html) {
	const source = String(html || '');
	if (!source) return null;

	let score = null;
	let scoreSource = '';

	// Pattern 1: OpenCritic recommend score circle text, e.g. <span class="circle-score__text">66 <span ...>%</span>
	const circleScoreMatch = source.match(/circle-score__text[^>]*>\s*([0-9]{1,3}(?:[.,][0-9]+)?)\s*<span[^>]*circle-score__text-percentage/i);
	if (circleScoreMatch) {
		score = parseLooseNumber(circleScoreMatch[1]);
		scoreSource = 'opencritic-circle-text';
	}

	// Pattern 2: OpenCritic stroke-dasharray progress, e.g. stroke-dasharray="66, 100"
	if (!Number.isFinite(score)) {
		const dashArrayMatch = source.match(/class="circle-score[^\"]*__(?:stroke|main)"[^>]*stroke-dasharray="\s*([0-9]{1,3}(?:[.,][0-9]+)?)\s*,\s*100\s*"/i);
		if (dashArrayMatch) {
			score = parseLooseNumber(dashArrayMatch[1]);
			scoreSource = 'opencritic-dasharray';
		}
	}

	// Pattern 3: Fallback to averaging critic tile scores, e.g. 78/100, 9/10, etc.
	if (!Number.isFinite(score)) {
		const reviewScoreRegex = /content-summary-item__review-score[^>]*>\s*([0-9]{1,3}(?:[.,][0-9]+)?)\s*\/\s*([0-9]{1,3})\s*</gi;
		const samples = [];
		let match = null;
		while ((match = reviewScoreRegex.exec(source)) != null) {
			const value = parseLooseNumber(match[1]);
			const scale = parseLooseNumber(match[2]);
			if (!Number.isFinite(value) || !Number.isFinite(scale) || scale <= 0) continue;
			samples.push((value / scale) * 100);
		}
		if (samples.length > 0) {
			const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
			score = Number.isFinite(average) ? average : null;
			scoreSource = 'critic-review-tiles-average';
		}
	}

	// Pattern 4: Last-resort fallback for any clear percent in the critics section
	if (!Number.isFinite(score)) {
		const criticsBlockMatch = source.match(/critics-ratings[\s\S]{0,1800}?([0-9]{1,3}(?:[.,][0-9]+)?)\s*%/i);
		if (criticsBlockMatch) {
			score = parseLooseNumber(criticsBlockMatch[1]);
			scoreSource = 'critics-block-percent';
		}
	}

	const normalizedScore = Number.isFinite(score) ? Number(score) : null;
	if (!Number.isFinite(normalizedScore) || normalizedScore <= 0) {
		console.warn('[parseGogRatingFromHtml] No critics score parsed', {
			htmlLength: source.length,
			hasOpencritic: /opencritic/i.test(source),
			hasCriticsRatingsBlock: /critics-ratings/i.test(source),
		});
		return null;
	}

	const clamped = Math.max(0, Math.min(100, normalizedScore));


	return {
		score: Number(clamped.toFixed(1)),
		reviewCount: null,
		scoreScale: 100,
		isCriticsScore: true,
	};
}

async function fetchGogUserRating(href) {
	const absoluteHref = toAbsoluteStoreHref('gog', href);
	
	if (!/^https?:\/\//i.test(absoluteHref)) {
		console.warn('[fetchGogUserRating] Invalid href format');
		return null;
	}

	// Try multiple URL formats in case GOG requires slug
	const urlsToTry = [absoluteHref];

	try {
		let html = null;
		
		for (const tryUrl of urlsToTry) {
			try {
				html = await fetchTextWithTimeout(tryUrl);
				if (html && html.length > 1000) {
					break;
				}
			} catch (error) {
				console.warn('[fetchGogUserRating] Failed URL:', tryUrl, error);
				continue;
			}
		}
		
		if (!html) {
			console.warn('[fetchGogUserRating] Failed all URL attempts');
			return null;
		}
		
		const parsed = parseGogRatingFromHtml(html);
		
		if (!parsed) return null;

		return {
			platform: 'gog',
			available: true,
			score: parsed.score,
			scoreScale: parsed.scoreScale,
			reviewCount: parsed.reviewCount,
			summary: parsed.isCriticsScore ? 'GOG critics score' : 'GOG user rating',
			href: absoluteHref,
		};
	} catch (error) {
		console.error('[fetchGogUserRating] Error:', error);
		return null;
	}
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

	const source = Array.isArray(value) ? value : (typeof value === 'object' ? Object.values(value) : []);

	const out = [];
	const seen = new Set();

	for (let index = 0; index < source.length; index += 1) {
		const entry = source[index];
		if (!entry) continue;

		let rawHref = '';
		let rawMagnet = '';
		let rawSitelink = '';
		let label = 'Pirate Download';

		if (typeof entry === 'string') {
			rawHref = entry.trim();
		} else if (typeof entry === 'object') {
			rawHref = String(entry.link || entry.url || entry.href || '').trim();
			rawMagnet = String(entry.magnet || entry.magnet_uri || entry.magnetUri || entry.magnetLink || entry.torrent || '').trim();
			rawSitelink = String(entry.sitelink || entry.site_link || entry.siteLink || entry.page || entry.pageUrl || '').trim();
			label = String(entry.site_name || entry.siteName || entry.name || entry.label || 'Pirate Download').trim() || 'Pirate Download';
		}

		// Prefer explicit sitelink as the page href if provided
		const hrefCandidate = rawSitelink || rawHref || '';
		const magnetCandidate = rawMagnet || (hrefCandidate && /^magnet:\?/i.test(hrefCandidate) ? hrefCandidate : '');

		if (!magnetCandidate && !hrefCandidate) continue;

		const key = (magnetCandidate || hrefCandidate).toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);

		const outEntry = {
			id: String((typeof entry === 'object' && (entry.id || entry.label)) ? (entry.id || entry.label) : `pirate-${index}`),
			label,
		};

		if (hrefCandidate && /^https?:\/\//i.test(hrefCandidate)) outEntry.href = hrefCandidate;
		if (magnetCandidate && /^magnet:\?/i.test(magnetCandidate)) outEntry.magnet = magnetCandidate;
		if (rawSitelink && /^https?:\/\//i.test(rawSitelink)) outEntry.sitelink = rawSitelink;

		out.push(outEntry);
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

function resolvePirateSitePageHref(entry, gameTitle = '') {
	const rawHref = decodeHtmlAmpersands(String(entry?.sitelink || entry?.site_link || entry?.siteLink || entry?.href || '').trim());
	if (/^https?:\/\//i.test(rawHref)) return rawHref;

	const lowerHref = rawHref.toLowerCase();
	const label = String(entry?.label || '').toLowerCase();
	const slugfromtitle = slugFromTitle(gameTitle, '-') || '';
	const slug = slugfromtitle;
	const encodedTitle = encodeURIComponent(String(gameTitle || '').trim());

	if (/fitgirl-repacks\.site/.test(lowerHref) || label.includes('fitgirl')) {
		if (!slug) {
			return encodedTitle ? `https://fitgirl-repacks.site/?s=${encodedTitle}` : 'https://fitgirl-repacks.site/';
		}
		// FitGirl expects space-encoded slugs (e.g. "Night%20Shippers") rather than
		// our slugified hyphen form — use the encoded title to preserve spaces.
		return `https://fitgirl-repacks.site/${encodedTitle}/`;
	}

	if (
		/pcgamestorrents?\.com/.test(lowerHref)
		|| /igg-games\./.test(lowerHref)
		|| label.includes('pcgamestorrent')
		|| label.includes('pc games torrent')
		|| label.includes('igg')
	) {
		// Match the same first-step source page that the PCGames resolver starts from.
		if (!slug) {
			return encodedTitle ? `https://igg-games.com/?s=${encodedTitle}` : 'https://igg-games.com/';
		}
		return `https://igg-games.com/${slug}.html`;
	}

	if (/byxatab\.com/.test(lowerHref) || label.includes('xatab') || label.includes('byxatab')) {
		if (/^https?:\/\//i.test(rawHref)) {
			try {
				const parsed = new URL(rawHref);
				const host = String(parsed.hostname || '').toLowerCase();
				const path = String(parsed.pathname || '').toLowerCase();
				if (/byxatab\.com$/.test(host) && (path.includes('/games/') || path.includes('/search/'))) {
					return parsed.toString();
				}
			} catch {
				// Fall through to title-based search URL.
			}
		} else if (/^\/(games|search)\//i.test(rawHref)) {
			try {
				return new URL(rawHref, 'https://byxatab.com/').toString();
			} catch {
				// Fall through to title-based search URL.
			}
		}
		return encodedTitle ? `https://byxatab.com/search/${encodedTitle}/` : 'https://byxatab.com/';
	}

	if (!slug) return '';

	if (/igg-games\./.test(lowerHref) || label.includes('igg')) {
		return `https://igg-games.com/${slug}.html`;
	}

	return '';
}

function defaultSiteForPlatform(platform, appId, titleHint = '') {
	const normalizedPlatform = normalizePlatformName(platform);
	if (normalizedPlatform === 'gog') {
		const slugFromAppId = String(appId || '').trim();
		const normalizedSlugFromAppId = /^\d+$/.test(slugFromAppId) ? '' : slugFromAppId.toLowerCase();
		const slugFromTitle = buildGogTitleSlugs(titleHint)[0] || '';
		const resolvedSlug = pickFirstFilledText(normalizedSlugFromAppId, slugFromTitle);
		if (!resolvedSlug) return [];
		return [{ id: 'gog', label: 'GoG', href: `https://www.gog.com/en/game/${resolvedSlug}` }];
	}

	if (!appId) return [];
	if (normalizedPlatform === 'itchio') {
		return [{ id: 'itchio', label: 'Itch.io', href: 'https://itch.io/' }];
	}
	return [{ id: 'steam', label: 'Steam', href: `https://store.steampowered.com/app/${appId}` }];
}

function buildItchSearchHref(gameTitle = '') {
	const normalizedTitle = String(gameTitle || '').trim();
	if (!normalizedTitle) return 'https://itch.io/';
	return `https://itch.io/search?q=${encodeURIComponent(normalizedTitle)}`;
}

function isItchStoreHref(href) {
	const rawHref = String(href || '').trim();
	if (!/^https?:\/\//i.test(rawHref)) return false;
	try {
		const parsed = new URL(rawHref);
		const host = String(parsed.hostname || '').toLowerCase();
		return host === 'itch.io' || host.endsWith('.itch.io');
	} catch {
		return false;
	}
}

function isSpecificItchGameHref(href) {
	const rawHref = String(href || '').trim();
	if (!/^https?:\/\//i.test(rawHref)) return false;
	try {
		const parsed = new URL(rawHref);
		const host = String(parsed.hostname || '').toLowerCase();
		const pathname = String(parsed.pathname || '/').replace(/\/+$/, '') || '/';

		if (host.endsWith('.itch.io')) {
			return pathname !== '/';
		}

		if (host === 'itch.io') {
			if (pathname === '/' || pathname === '/search') return false;
			return true;
		}

		return false;
	} catch {
		return false;
	}
}

function collectItchHrefCandidates(details) {
	const candidates = [
		details?.url,
		details?.store_url,
		details?.storeUrl,
		details?.raw?.search_match?.url,
		details?.raw?.searchMatch?.url,
		details?.raw?.url,
		details?.raw?.store_url,
		details?.raw?.storeUrl,
	];

	const out = [];
	const seen = new Set();

	for (const candidate of candidates) {
		const href = String(candidate || '').trim();
		if (!/^https?:\/\//i.test(href)) continue;
		const key = href.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(href);
	}

	return out;
}

function collectItchTitleHintsFromSite(site) {
	const hints = [];
	const seen = new Set();

	const addHint = (value) => {
		const raw = String(value || '').trim();
		if (!raw) return;
		const normalized = normalizeTitleForCompare(raw);
		if (!normalized) return;
		if (
			normalized === 'store'
			|| normalized === 'store page'
			|| normalized === 'itch io'
			|| normalized === 'itchio'
			|| normalized === 'itch'
		) {
			return;
		}
		if (seen.has(normalized)) return;
		seen.add(normalized);
		hints.push(raw);
	};

	addHint(site?.label);
	addHint(site?.title);

	const href = String(site?.href || '').trim();
	if (!isItchStoreHref(href)) return hints;

	try {
		const parsed = new URL(href);
		const pathname = String(parsed.pathname || '/').replace(/\/+$/, '') || '/';

		if (pathname === '/search') {
			addHint(parsed.searchParams.get('q'));
		} else {
			const slug = extractSlugFromUrl(href);
			if (slug) {
				addHint(slug.replace(/[-_]+/g, ' '));
			}
		}
	} catch {
		// ignore malformed URL hints
	}

	return hints;
}

function itchSiteMatchesGameTitle(site, gameTitle) {
	const expectedTitle = String(gameTitle || '').trim();
	if (!hasFilledText(expectedTitle) || isPlaceholderTitle(expectedTitle)) return true;

	const titleHints = collectItchTitleHintsFromSite(site);
	if (titleHints.length < 1) return true;

	return titleHints.some((hint) => isExactTitleMatch(hint, [expectedTitle]));
}

function shouldPreferItchAvailableTarget(nextTarget, currentTarget, gameTitle) {
	if (!currentTarget) return true;

	const currentMatches = itchSiteMatchesGameTitle(currentTarget, gameTitle);
	const nextMatches = itchSiteMatchesGameTitle(nextTarget, gameTitle);
	if (currentMatches !== nextMatches) return nextMatches;

	const currentSpecific = isSpecificItchGameHref(currentTarget?.href);
	const nextSpecific = isSpecificItchGameHref(nextTarget?.href);
	if (currentSpecific !== nextSpecific) return nextSpecific;

	const currentSearch = /\/search\b/i.test(String(currentTarget?.href || ''));
	const nextSearch = /\/search\b/i.test(String(nextTarget?.href || ''));
	if (currentSearch !== nextSearch) return !nextSearch;

	return false;
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

function extractGogSlugFromStoreHref(href) {
	const rawHref = String(href || '').trim();
	if (!rawHref) return '';

	const directMatch = rawHref.match(/gog\.com\/(?:[a-z]{2}\/)?game\/([a-z0-9_-]+)/i);
	const fallbackMatch = rawHref.match(/\/game\/([a-z0-9_-]+)/i);
	const slug = String(directMatch?.[1] || fallbackMatch?.[1] || '').trim().toLowerCase();
	if (!slug) return '';
	if (/^\d+$/.test(slug)) return '';
	return slug;
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
	if (platform === 'itchio') {
		const directCandidates = [
			...collectItchHrefCandidates(details),
			...siteLinks.map((site) => String(site?.href || '').trim()),
		];
		const specificItchLink = directCandidates.find((href) => isSpecificItchGameHref(href));
		if (specificItchLink) return specificItchLink;

		const directItchLink = directCandidates.find((href) => isItchStoreHref(href));
		if (directItchLink) return directItchLink;
	}
	const preferred = siteLinks.find((site) => {
		const inferred = inferPlatformFromSite(site);
		const normalizedInferred = normalizePlatformName(inferred || platform);
		return normalizedInferred === platform;
	});

	if (preferred?.href) return preferred.href;
	if (siteLinks[0]?.href) return siteLinks[0].href;
	const titleHint = pickFirstFilledText(details?.title, details?.name);
	return defaultSiteForPlatform(platform, appId, titleHint)?.[0]?.href || null;
}

function parseSteamDetails(details) {
	if (!details || typeof details !== 'object') return null;
	const appid = Number(details.appid);
	if (!Number.isFinite(appid) || appid <= 0) return null;

	const raw = details.raw && typeof details.raw === 'object' ? details.raw : {};
	const steamImageSet = steamImages(appid);
	const stableSteamBanner = pickFirstFilledText(
		details.bannerimg,
		details.banner_img,
		raw.header_image,
		raw.capsule_image,
		steamImageSet?.header,
		steamImageSet?.capsule,
	);
	const stableSteamHero = pickFirstFilledText(
		raw.background_raw,
		raw.background,
		stableSteamBanner,
		steamImageSet?.hero,
		steamImageSet?.header,
	);
	const stableSteamCover = pickFirstFilledText(
		stableSteamBanner,
		steamImageSet?.capsule,
		steamImageSet?.cover,
	);
	const tags = normalizeTagList(details.genre_names ?? details.genreNames ?? details.genres);
	const screenshots = Array.isArray(raw.screenshots)
		? raw.screenshots
			.map((shot) => (shot && typeof shot === 'object' ? shot.path_full || shot.path_thumbnail : null))
			.filter((value) => typeof value === 'string' && value.trim())
		: [];

	return {
		id: appid,
		appid,
		title: normalizeUtf8Text(details.name || fallback.title),
		description: htmlToText(raw.short_description || ''),
		longDescription: sanitizeHtml(raw.detailed_description || raw.about_the_game || raw.short_description || ''),
		tags,
		screenshots: normalizeScreenshotList(screenshots),
		minimumRequirements: sanitizeHtml(raw?.pc_requirements?.minimum || details.minimum_requirements || ''),
		price: resolveSteamPriceValue(details),
		priceLabel: resolveSteamPriceLabel(details),
		coverImage: stableSteamCover || '',
		heroImage: stableSteamHero || '',
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
		const raw = details.raw && typeof details.raw === 'object' ? details.raw : {};
		const boxArt = pickFirstFilledText(
			details.boxArtImage,
			details.box_art_img,
			raw.boxArtImage,
			raw.box_art_img,
			details?._links?.boxArtImage?.href,
			raw?._links?.boxArtImage?.href,
			raw?._embedded?.product?._links?.boxArtImage?.href,
			resolveTemplatedImageHref(details?._embedded?.product?._links?.image?.href, 'product_630'),
			resolveTemplatedImageHref(raw?._embedded?.product?._links?.image?.href, 'product_630'),
			resolveTemplatedImageHref(details?._embedded?.product?._links?.image?.href, '1600'),
			resolveTemplatedImageHref(raw?._embedded?.product?._links?.image?.href, '1600'),
		);
		const galaxyBackground = pickFirstFilledText(
			details.galaxyBackgroundImage,
			details.galaxy_background_img,
			raw.galaxyBackgroundImage,
			raw.galaxy_background_img,
			details?._links?.galaxyBackgroundImage?.href,
			raw?._links?.galaxyBackgroundImage?.href,
			details.backgroundImage,
			raw.backgroundImage,
			details?._links?.backgroundImage?.href,
			raw?._links?.backgroundImage?.href,
		);
		const portraitCover = pickFirstFilledText(
			boxArt,
			details.coverUrl,
			details.cover_url,
			raw.coverUrl,
			raw.cover_url,
		);
		const banner = pickFirstFilledText(
			galaxyBackground,
			details.bannerImg,
			details.banner_img,
			raw.bannerImg,
			raw.banner_img,
			raw.db_banner_img,
			raw.local_banner_img,
			details.heroImage,
			details.hero_image,
			raw.heroImage,
			raw.hero_image,
		);
		const siteLinks = normalizeSiteLinksFromAny(details.url || details.store_url || details.storeUrl || details.links || details.sites);
		return {
			id: parsedAppId,
			appid: parsedAppId,
			title: normalizeUtf8Text(details.title || fallback.title),
			description: htmlToText(details.description || details.shortText || details.short_text || ''),
			longDescription: sanitizeHtml(details.description || details.shortText || details.short_text || ''),
			tags: genres,
			screenshots: [],
			minimumRequirements: sanitizeHtml(minimumRequirements),
			price,
			coverImage: banner || portraitCover,
			heroImage: banner || portraitCover,
			boxArtImage: boxArt || '',
			platform_name: 'gog',
			sites: siteLinks,
		};
	}

	if (platform === 'itchio') {
		const parsedAppId = toPositiveNumber(details.gameId ?? details.app_id ?? details.id ?? appId);
		const price = [details.minPrice, details.min_price, details.cost, details.price]
			.map((value) => normalizePriceValue(value, 'itchio'))
			.find((value) => value !== null);
		const raw = details.raw && typeof details.raw === 'object' ? details.raw : {};
		const banner = pickFirstFilledText(
			details.bannerImg,
			details.banner_img,
			details.headerImage,
			details.header_image,
			details.heroImage,
			details.hero_image,
			details.coverUrl,
			details.cover_url,
			raw.bannerImg,
			raw.banner_img,
			raw.headerImage,
			raw.header_image,
			raw.heroImage,
			raw.hero_image,
			raw.coverUrl,
			raw.cover_url,
		);
		const portraitFallback = pickFirstFilledText(
			details.still_cover_url,
			details.thumb_url,
			raw.still_cover_url,
			raw.thumb_url,
			details.coverUrl,
			details.cover_url,
			raw.coverUrl,
			raw.cover_url,
		);
		const siteLinks = normalizeSiteLinksFromAny(details.url || details.store_url || details.storeUrl || details.links || details.sites);
		const genres = normalizeTagList(details.genre_names ?? details.genreNames ?? details.genres);
		return {
			id: parsedAppId,
			appid: parsedAppId,
			title: normalizeUtf8Text(details.title || fallback.title),
			description: htmlToText(details.shortText || details.short_text || details.description || ''),
			longDescription: sanitizeHtml(details.description || details.shortText || details.short_text || ''),
			tags: genres,
			screenshots: [],
			minimumRequirements: sanitizeHtml(details.minimum_requirements || details.minimumRequirements || ''),
			price,
			coverImage: banner || portraitFallback,
			heroImage: banner || portraitFallback,
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
		title: normalizeUtf8Text(game?.title || game?.name || fallback.title),
		coverImage: normalizeUtf8Text(game?.coverImage || game?.coverUrl || game?.image || fallback.coverImage),
		heroImage: normalizeUtf8Text(game?.heroImage || game?.heroUrl || fallback.heroImage),
		description: htmlToText(game?.description || fallback.description),
		longDescription: sanitizeHtml(game?.longDescription || game?.description || fallback.longDescription),
		tags: Array.isArray(game?.tags) ? game.tags : fallback.tags,
		sites: normalizeSiteLinksFromAny(game?.sites),
		screenshots: normalizeScreenshotList(Array.isArray(game?.screenshots) ? game.screenshots : fallback.screenshots),
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
	const [livePirateSites, setLivePirateSites] = useState([]);
	const [scrapedTargets, setScrapedTargets] = useState([]);
	const [minimumRequirementsCheck, setMinimumRequirementsCheck] = useState({
		status: 'idle',
		verdict: '',
		details: [],
		error: '',
	});
	const [errorMessage, setErrorMessage] = useState('');
	const [currentScreenshot, setCurrentScreenshot] = useState(0);
	const [startingPirateKeys, setStartingPirateKeys] = useState([]);
	const [loading, setLoading] = useState(true);
	const [ratingsByPlatform, setRatingsByPlatform] = useState({
		steam: { loading: false, data: null },
		gog: { loading: false, data: null },
		itchio: { loading: false, data: null },
	});
	const localHardwareProfileRef = useRef({ value: null, fetchedAt: 0 });
	const lastDbScrapeSyncKeyRef = useRef('');
	const lastDbPriceSyncKeyRef = useRef('');
	const lastDbBannerSyncKeyRef = useRef('');

	const routeState = useMemo(() => normalizeLocationState(location?.state), [location?.state]);
	const requestedPlatform = useMemo(() => normalizePlatformName(platform || routeState.platform_name), [platform, routeState.platform_name]);

	const appId = useMemo(() => {
		const routeId = Number(id);
		if (Number.isFinite(routeId) && routeId > 0) return routeId;
		const stateCandidates = [Number(routeState?.appid), Number(routeState?.id)];
		return stateCandidates.find((value) => Number.isFinite(value) && value > 0) ?? null;
	}, [id, routeState]);

	useEffect(() => {
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || !appId) return;

		const unsubscribe = typeof api.onPirateSitesUpdated === 'function'
			? api.onPirateSitesUpdated((payload) => {
			const incoming = payload && typeof payload === 'object' ? payload : null;
			if (!incoming) return;

			const payloadAppId = Number(incoming.appId);
			if (!Number.isFinite(payloadAppId) || payloadAppId <= 0 || payloadAppId !== appId) return;

			const incomingSites = Array.isArray(incoming.pirate_sites)
				? incoming.pirate_sites
				: (Array.isArray(incoming.pirateSites) ? incoming.pirateSites : []);
			if (incomingSites.length < 1) return;

			setLivePirateSites((prev) => {
				const merged = normalizePirateLinksFromAny([
					...(Array.isArray(prev) ? prev : []),
					...incomingSites,
				]);

				return merged
					.map((entry) => {
						const label = String(entry?.label || 'Pirate Download').trim() || 'Pirate Download';
						const href = String(entry?.href || '').trim();
						const magnet = String(entry?.magnet || entry?.magnet_uri || entry?.magnetUri || '').trim();
						const sitelink = String(entry?.sitelink || entry?.site_link || entry?.siteLink || '').trim();
						const link = magnet || href || sitelink || '';
						return {
							site_name: label,
							link,
							magnet: magnet || undefined,
							href: href || undefined,
							sitelink: sitelink || undefined,
						};
					})
					.filter((entry) => /^https?:\/\//i.test(entry.link) || /^magnet:\?/i.test(entry.link));
			});
		}) : null;

		return () => {
			if (typeof unsubscribe === 'function') {
				unsubscribe();
			}
		};
	}, [appId]);

	useEffect(() => {
		setCurrentScreenshot(0);
	}, [appId]);

	useEffect(() => {
		setMinimumRequirementsCheck({
			status: 'idle',
			verdict: '',
			details: [],
			error: '',
		});
	}, [appId]);

	useEffect(() => {
		let cancelled = false;
		setPlatformDetails(null);
		setDbDetails(null);
		setLivePirateSites([]);
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
			const scrapedCandidates = [];
			let lastError = null;

			/**
			 * Applies the currently fetched scrape candidates immediately so UI updates
			 * step-by-step as each promise resolves.
			 */
			const applyScrapeProgress = () => {
				const selection = selectBestScrapeCandidate(scrapedCandidates, expectedTitles);
				const steamCandidate = selection.accepted.find(
					(candidate) => normalizePlatformName(candidate.platform) === 'steam'
				) || null;
				const preferredCandidate = selection.accepted.find(
					(candidate) => normalizePlatformName(candidate.platform) === effectivePlatform
				) || null;
				const chosenCandidate = steamCandidate || preferredCandidate || selection.best;

				if (!cancelled) {
					setScrapedTargets(
						selection.accepted.map((candidate) => ({
							platform: candidate.platform,
							appId: candidate.appId,
							href: candidate.href,
							price: candidate?.parsed?.price ?? null,
						}))
					);

					if (chosenCandidate) {
						setPlatformDetails({
							...chosenCandidate.details,
							__resolved_platform: chosenCandidate.platform,
						});
					}
				}

				return { selection, chosenCandidate };
			};

			/**
			 * Fetches DB details for one platform and applies them immediately when resolved.
			 * Returns a promise resolving with the DB payload or null.
			 */
			const fetchDbDetailsStep = async (platformName) => {
				try {
					const dbData = await api.getAllDetailsByAppIDAndPlatform(appId, platformName, countryCode);
					if (!dbData) return null;

					hasDbData = true;
					expectedTitles = collectExpectedTitles(routeState, dbData);
					if (!cancelled) setDbDetails(dbData);
					return dbData;
				} catch {
					return null;
				}
			};

			try {
				// Step 1: fetch DB details first, then update UI immediately.
				await fetchDbDetailsStep(requestedPlatform);

				// Step 2: fetch each platform candidate one-by-one and apply progress after each promise.
				const probeOrder = [effectivePlatform, 'steam', 'gog', 'itchio']
					.map((entry) => normalizePlatformName(entry))
					.filter((entry, index, arr) => entry && arr.indexOf(entry) === index);
				const titleHints = buildLookupTitleCandidates(expectedTitles, routeState);

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
							applyScrapeProgress();
						}
					} catch (err) {
						lastError = err;
					}
				}

				const finalSelection = selectBestScrapeCandidate(scrapedCandidates, expectedTitles);
				const steamCandidate = finalSelection.accepted.find(
					(candidate) => normalizePlatformName(candidate.platform) === 'steam'
				) || null;
				const preferredCandidate = finalSelection.accepted.find(
					(candidate) => normalizePlatformName(candidate.platform) === effectivePlatform
				) || null;
				const chosenCandidate = steamCandidate || preferredCandidate || finalSelection.best;

				if (!cancelled && chosenCandidate) {
					effectivePlatform = normalizePlatformName(chosenCandidate.platform || effectivePlatform);
					setPlatformDetails({
						...chosenCandidate.details,
						__resolved_platform: chosenCandidate.platform,
					});
				} else if (!cancelled && expectedTitles.length > 0 && scrapedCandidates.length > 0 && !finalSelection.hasTitleMatch) {
					if (!hasDbData) {
						setErrorMessage('No scraped store result matched the expected game title.');
					}
				} else if (!cancelled && !hasDbData && lastError) {
					setErrorMessage(lastError instanceof Error ? lastError.message : String(lastError));
				}

				// Step 3: refresh DB details for the final platform (again, step-by-step).
				const requestedNormalized = normalizePlatformName(requestedPlatform);
				const shouldRefreshDb = !hasDbData || effectivePlatform !== requestedNormalized;
				if (shouldRefreshDb) {
					await fetchDbDetailsStep(effectivePlatform);
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
				title: normalizeUtf8Text(dbDetails.name || routeState.title),
				description: htmlToText(dbDetails.description || ''),
				longDescription: sanitizeHtml(dbDetails.description || routeState.longDescription),
				bannerImg: pickFirstFilledText(
					dbDetails.banner_img,
					dbDetails.bannerImg,
					dbDetails.db_banner_img,
					dbDetails.cover_url,
					dbDetails.coverUrl,
					dbDetails.heroImage,
					dbDetails.image,
					dbDetails.image_url,
					dbDetails.thumbnail,
				),
				tags: normalizeTagList(dbDetails.genre_names ?? dbDetails.genres),
				minimumRequirements: sanitizeHtml(dbDetails.minimum_requirements || ''),
				price: normalizePriceValue(pickFirstFiniteNumber(dbDetails.cost, routeState.price), dbPlatformName),
				priceLabel:
					dbPlatformName !== 'gog' && dbPlatformName !== 'steam' && typeof dbDetails.formated_price === 'string' && dbDetails.formated_price.trim()
						? dbDetails.formated_price.trim()
						: null,
				platform_name: dbPlatformName,
				sites: dbSites,
			}
			: null;

		if (parsedDb && parsedDb.bannerImg) {
			parsedDb.coverImage = parsedDb.bannerImg;
			parsedDb.heroImage = parsedDb.bannerImg;
		}

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
		const normalizedDescription = htmlToText(description);
		const longDescription = pickFirstFilledText(
			parsedPlatform?.longDescription,
			parsedDb?.longDescription,
			routeState?.longDescription,
			normalizedDescription
		);
		const normalizedLongDescription = sanitizeHtml(longDescription);
		const tags = mergeTagLists(
			parsedDb?.tags,
			parsedPlatform?.tags,
			routeState?.tags,
		);
		const screenshots = pickFirstNonEmptyArray(
			parsedPlatform?.screenshots,
			routeState?.screenshots
		);
		const normalizedScreenshots = normalizeScreenshotList(screenshots);
		const resolvedTitle = normalizeUtf8Text(
			pickFirstFilledText(parsedPlatform?.title, parsedDb?.title, routeState?.title, routeState?.name, fallback.title)
		);
		const siteCandidates = pickFirstNonEmptyArray(
			parsedPlatform?.sites,
			parsedDb?.sites,
			routeState?.sites
		);
		const links = siteCandidates.length > 0
			? normalizeSiteLinksFromAny(siteCandidates)
			: defaultSiteForPlatform(routePlatform, resolvedAppId || appId, resolvedTitle);
		const parsedPrimaryImage = scrapedPlatform === 'gog'
			? pickFirstFilledText(parsedPlatform?.heroImage, parsedPlatform?.coverImage)
			: pickFirstFilledText(parsedPlatform?.coverImage, parsedPlatform?.boxArtImage, parsedPlatform?.heroImage);
		const coverImage = pickFirstFilledText(
			// For Steam games prefer the vertical library poster first (library_600x900)
			steam?.cover,
			steam?.capsule,
			parsedPrimaryImage,
			parsedPlatform?.coverImage,
			parsedPlatform?.heroImage,
			routeState?.coverImage,
			routeState?.coverUrl,
			routeState?.image,
			parsedDb?.coverImage,
			parsedDb?.bannerImg,
			parsedDb?.heroImage,
			fallback.coverImage
		);
		const heroImage = pickFirstFilledText(
			parsedPlatform?.heroImage,
			parsedDb?.heroImage,
			parsedDb?.bannerImg,
			parsedDb?.coverImage,
			parsedPlatform?.bannerImg,
			routeState?.heroImage,
			routeState?.heroUrl,
			routeState?.image,
			steam?.cover,
			steam?.hero,
			steam?.header,
			coverImage,
			fallback.heroImage
		);
		const crossPlatformScrapedPrices = Array.isArray(scrapedTargets)
			? scrapedTargets
				.map((target) => normalizePriceValue(target?.price, normalizePlatformName(target?.platform)))
				.filter((value) => value !== null)
			: [];
		const price = pickBestAvailablePrice(
			normalizePriceValue(parsedPlatform?.price, scrapedPlatform),
			normalizePriceValue(parsedDb?.price, dbPlatformName),
			...crossPlatformScrapedPrices,
			normalizePriceValue(routeState?.price, routePlatform),
		);
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
		const normalizedMinimumRequirements = sanitizeHtml(minimumRequirements);
		const pirateLinks = normalizePirateLinksFromAny([
			...(Array.isArray(dbDetails?.pirate_sites) ? dbDetails.pirate_sites : []),
			...(Array.isArray(dbDetails?.pirateSites) ? dbDetails.pirateSites : []),
			...(Array.isArray(dbDetails?.pirate_links) ? dbDetails.pirate_links : []),
			...(Array.isArray(livePirateSites) ? livePirateSites : []),
			...(Array.isArray(routeState?.pirate_sites) ? routeState.pirate_sites : []),
			...(Array.isArray(routeState?.pirateSites) ? routeState.pirateSites : []),
		]);

		return {
			...fallback,
			id: pickFirstPositiveNumber(parsedDb?.id, routeState?.id, resolvedAppId, appId),
			appid: resolvedAppId,
			title: resolvedTitle,
			description: normalizedDescription,
			longDescription: normalizedLongDescription,
			minimumRequirements: normalizedMinimumRequirements,
			platform_name: routePlatform,
			coverImage: normalizeUtf8Text(coverImage),
			heroImage: normalizeUtf8Text(heroImage),
			tags,
			screenshots: normalizedScreenshots,
			price,
			priceLabel: priceLabel || null,
			sites: links,
			pirate_links: pirateLinks,
		};
	}, [appId, dbDetails, livePirateSites, platformDetails, requestedPlatform, routeState, scrapedTargets]);

	useEffect(() => {
		setMinimumRequirementsCheck({
			status: 'idle',
			verdict: '',
			details: [],
			error: '',
		});
	}, [model.minimumRequirements]);

	const screenshotSources = useMemo(() => {
		return normalizeScreenshotList([
			...(Array.isArray(model.screenshots) ? model.screenshots : []),
			model.heroImage,
			model.coverImage,
		]);
	}, [model.coverImage, model.heroImage, model.screenshots]);

	useEffect(() => {
		if (currentScreenshot >= screenshotSources.length) {
			setCurrentScreenshot(0);
		}
	}, [currentScreenshot, screenshotSources.length]);

	const goPrevScreenshot = useCallback(() => {
		if (screenshotSources.length < 2) return;
		setCurrentScreenshot((prev) => (prev - 1 + screenshotSources.length) % screenshotSources.length);
	}, [screenshotSources.length]);

	const goNextScreenshot = useCallback(() => {
		if (screenshotSources.length < 2) return;
		setCurrentScreenshot((prev) => (prev + 1) % screenshotSources.length);
	}, [screenshotSources.length]);

	useEffect(() => {
		if (loading || screenshotSources.length < 2) return;
		const intervalId = window.setInterval(() => {
			setCurrentScreenshot((prev) => (prev + 1) % screenshotSources.length);
		}, SCREENSHOT_AUTOSTEP_MS);
		return () => window.clearInterval(intervalId);
	}, [loading, screenshotSources.length]);

	useEffect(() => {
		let cancelled = false;
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api) return;

		const scrapedPlatform = normalizePlatformName(platformDetails?.__resolved_platform || requestedPlatform);
		const parsedScraped = parsePlatformDetails(scrapedPlatform, platformDetails, appId);
		if (!parsedScraped) return;

		const resolvedAppId = pickFirstPositiveNumber(
			parsedScraped?.appid,
			parsedScraped?.id,
			appId,
		);
		if (!resolvedAppId) return;

		const resolvedTitle = pickFirstFilledText(parsedScraped?.title, dbDetails?.name, routeState?.title);
		if (!resolvedTitle || isPlaceholderTitle(resolvedTitle)) return;

		const resolvedBanner = pickFirstFilledText(
			parsedScraped?.heroImage,
			parsedScraped?.coverImage,
			routeState?.heroImage,
			routeState?.coverImage,
			dbDetails?.banner_img,
			dbDetails?.bannerImg,
			dbDetails?.db_banner_img,
			dbDetails?.cover_url,
			dbDetails?.coverUrl,
		);
		const resolvedDescription = pickFirstFilledText(
			parsedScraped?.longDescription,
			parsedScraped?.description,
			routeState?.longDescription,
			routeState?.description,
		);
		const resolvedMinimumRequirements = pickFirstFilledText(
			parsedScraped?.minimumRequirements,
			routeState?.minimumRequirements,
		);
		const resolvedGenres = normalizeTagList(parsedScraped?.tags);
		const resolvedCost = normalizePriceValue(parsedScraped?.price, scrapedPlatform);
		const knownCountryCode = normalizeCountryCode(dbDetails?.country_code) || null;

		const syncPayload = {
			appId: resolvedAppId,
			platform: scrapedPlatform,
			name: resolvedTitle,
			banner_img: resolvedBanner || undefined,
			description: resolvedDescription || undefined,
			minimum_requirements: resolvedMinimumRequirements || undefined,
			genre_names: resolvedGenres,
			cost: Number.isFinite(resolvedCost) && resolvedCost >= 0 ? resolvedCost : undefined,
		};

		const syncKey = JSON.stringify({
			appId: syncPayload.appId,
			platform: syncPayload.platform,
			name: syncPayload.name,
			banner_img: syncPayload.banner_img || '',
			description: syncPayload.description || '',
			minimum_requirements: syncPayload.minimum_requirements || '',
			genre_names: syncPayload.genre_names,
			cost: syncPayload.cost ?? null,
			countryCode: knownCountryCode || '',
		});
		if (lastDbScrapeSyncKeyRef.current === syncKey) return;
		lastDbScrapeSyncKeyRef.current = syncKey;

		void (async () => {
			try {
				const countryCode = knownCountryCode || await resolvePreferredCountryCode(api);
				if (typeof api.syncScrapedGameDetailsByAppIdAndPlatform === 'function') {
					const result = await api.syncScrapedGameDetailsByAppIdAndPlatform({
						...syncPayload,
						countryCode,
					});

					if (!result || result.ok !== true || result.action === 'skipped') return;

					if (typeof api.getAllDetailsByAppIDAndPlatform === 'function') {
						const refreshed = await api.getAllDetailsByAppIDAndPlatform(resolvedAppId, scrapedPlatform, countryCode);
						if (!cancelled && refreshed) {
							setDbDetails(refreshed);
						}
					}
				}
			} catch (err) {
				if (!cancelled) {
					console.warn('Failed to sync scraped store details to DB:', err);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [
		appId,
		dbDetails?.banner_img,
		dbDetails?.bannerImg,
		dbDetails?.cover_url,
		dbDetails?.country_code,
		dbDetails?.name,
		platformDetails,
		requestedPlatform,
		routeState?.coverImage,
		routeState?.description,
		routeState?.heroImage,
		routeState?.longDescription,
		routeState?.minimumRequirements,
		routeState?.title,
	]);

	useEffect(() => {
		let cancelled = false;
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api) return;

		const currentPlatform = normalizePlatformName(
			dbDetails?.platform_name
			|| platformDetails?.__resolved_platform
			|| requestedPlatform
		);
		if (!['steam', 'gog', 'itchio'].includes(currentPlatform)) return;

		const currentAppId = pickFirstPositiveNumber(
			dbDetails?.app_id,
			model?.appid,
			appId,
		);
		if (!currentAppId) return;

		const parsedCurrentPlatform = parsePlatformDetails(currentPlatform, platformDetails, currentAppId);
		const dbBanner = pickFirstFilledText(
			dbDetails?.banner_img,
			dbDetails?.bannerImg,
			dbDetails?.db_banner_img,
			dbDetails?.cover_url,
			dbDetails?.coverUrl,
		);

		const platformSpecificBannerCandidates = currentPlatform === 'steam'
			? buildSteamBannerCandidates(currentAppId)
			: [];

		const platformSpecificCoverCandidates = currentPlatform === 'steam'
			? buildSteamCoverCandidates(currentAppId)
			: [];

		const coverCandidates = uniqueImageCandidates([
			parsedCurrentPlatform?.heroImage,
			parsedCurrentPlatform?.coverImage,
			routeState?.heroImage,
			routeState?.coverImage,
			model?.heroImage,
			model?.coverImage,
			...platformSpecificCoverCandidates,
			dbBanner,
		]);
		if (coverCandidates.length < 1) return;

		const bannerCandidates = uniqueImageCandidates([
			parsedCurrentPlatform?.heroImage,
			parsedCurrentPlatform?.coverImage,
			...platformSpecificBannerCandidates,
			...platformSpecificCoverCandidates,
			routeState?.heroImage,
			routeState?.coverImage,
			model?.heroImage,
			model?.coverImage,
			dbBanner,
		]);

		void (async () => {
			try {
				// Resolve the UI cover (vertical) separately and prefer banner (header/capsule) for DB sync
				const resolvedCover = await resolveFirstLoadableImageUrl(coverCandidates);
				const resolvedBanner = await resolveFirstLoadableImageUrl(bannerCandidates);

				if (cancelled) return;

				let finalBanner = '';
				if (currentPlatform === 'steam' && Number.isFinite(currentAppId) && currentAppId > 0) {
					// Prefer canonical Steam header/capsule variants from multiple known hosts
					const hosts = Array.isArray(STORE_STEAM_IMAGE_CDN_HOSTS) && STORE_STEAM_IMAGE_CDN_HOSTS.length > 0
						? STORE_STEAM_IMAGE_CDN_HOSTS
						: ['https://cdn.cloudflare.steamstatic.com'];
					const canonicalCandidates = [];
					for (const h of hosts) {
						canonicalCandidates.push(`${h}/steam/apps/${Math.trunc(currentAppId)}/header.jpg`);
						canonicalCandidates.push(`${h}/steam/apps/${Math.trunc(currentAppId)}/capsule_616x353.jpg`);
					}
					// also include the shared.akamai store_item_assets variant
					canonicalCandidates.push(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${Math.trunc(currentAppId)}/header.jpg`);
					canonicalCandidates.push(`https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${Math.trunc(currentAppId)}/capsule_616x353.jpg`);

					finalBanner = pickFirstFilledText(
						...canonicalCandidates,
						parsedCurrentPlatform?.bannerImg,
						resolvedBanner,
						resolvedCover,
					);
				} else {
					finalBanner = pickFirstFilledText(resolvedBanner, resolvedCover);
				}
				if (!finalBanner) return;

				const previousDbBanner = String(dbBanner || '').trim().toLowerCase();
				const nextBanner = finalBanner.toLowerCase();
				if (previousDbBanner !== nextBanner) {
					setDbDetails((previous) => {
						if (!previous || typeof previous !== 'object') return previous;
						const current = pickFirstFilledText(
							previous.banner_img,
							previous.bannerImg,
							previous.db_banner_img,
							previous.cover_url,
							previous.coverUrl,
						).toLowerCase();
						if (current === nextBanner) return previous;
						return {
							...previous,
							banner_img: finalBanner,
						};
					});
				}

				const resolvedTitle = pickFirstFilledText(dbDetails?.name, parsedCurrentPlatform?.title, model?.title, routeState?.title);
				if (!resolvedTitle || isPlaceholderTitle(resolvedTitle)) return;

				const knownCountryCode = normalizeCountryCode(dbDetails?.country_code) || null;
				const syncKey = `${currentAppId}|${currentPlatform}|${nextBanner}|${String(knownCountryCode || '').toUpperCase()}`;
				if (lastDbBannerSyncKeyRef.current === syncKey) return;
				lastDbBannerSyncKeyRef.current = syncKey;

				const countryCode = knownCountryCode || await resolvePreferredCountryCode(api);
				if (typeof api.syncScrapedGameDetailsByAppIdAndPlatform === 'function') {
					const result = await api.syncScrapedGameDetailsByAppIdAndPlatform({
						appId: currentAppId,
						platform: currentPlatform,
						name: resolvedTitle,
						banner_img: finalBanner,
						countryCode,
					});

					if (!result || result.ok !== true || result.action === 'skipped') return;

					if (typeof api.getAllDetailsByAppIDAndPlatform === 'function') {
						const refreshed = await api.getAllDetailsByAppIDAndPlatform(currentAppId, currentPlatform, countryCode);
						if (!cancelled && refreshed) {
							setDbDetails(refreshed);
						}
					}
				}
			} catch (err) {
				if (!cancelled) {
					console.warn(`Failed to validate and sync ${String(currentPlatform).toUpperCase()} store image in background:`, err);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [
		appId,
		dbDetails?.app_id,
		dbDetails?.banner_img,
		dbDetails?.bannerImg,
		dbDetails?.country_code,
		dbDetails?.cover_url,
		dbDetails?.name,
		model?.appid,
		model?.coverImage,
		model?.heroImage,
		model?.title,
		platformDetails,
		requestedPlatform,
		routeState?.coverImage,
		routeState?.heroImage,
		routeState?.title,
	]);

	useEffect(() => {
		let cancelled = false;
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api) return;

		const currentPlatform = normalizePlatformName(dbDetails?.platform_name || requestedPlatform);
		const currentAppId = Number(dbDetails?.app_id ?? appId);
		if (!Number.isFinite(currentAppId) || currentAppId <= 0) return;

		const resolvedPrice = normalizePriceValue(model?.price, currentPlatform);
		if (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0) return;

		const toNullableNumber = (value) => {
			if (value === null || value === undefined) return null;
			if (typeof value === 'string' && value.trim() === '') return null;
			const numeric = Number(value);
			return Number.isFinite(numeric) ? numeric : null;
		};

		const dbRawPrice = toNullableNumber(dbDetails?.cost) ?? toNullableNumber(dbDetails?.price);
		const normalizedDbPrice = dbRawPrice === null ? null : normalizePriceValue(dbRawPrice, currentPlatform);
		if (normalizedDbPrice !== null && Math.abs(normalizedDbPrice - resolvedPrice) <= 0.009) return;

		const syncKey = `${currentAppId}|${currentPlatform}|${String(dbDetails?.country_code || '').trim().toUpperCase()}|${resolvedPrice.toFixed(2)}`;
		if (lastDbPriceSyncKeyRef.current === syncKey) return;
		lastDbPriceSyncKeyRef.current = syncKey;

		void (async () => {
			try {
				const countryCode = normalizeCountryCode(dbDetails?.country_code) || await resolvePreferredCountryCode(api);
				if (typeof api.syncGamePriceByAppIdAndPlatform === 'function') {
					const result = await api.syncGamePriceByAppIdAndPlatform(currentAppId, currentPlatform, resolvedPrice, countryCode);
					if (!result || result.updated !== true) return;

					if (typeof api.getAllDetailsByAppIDAndPlatform === 'function') {
						const refreshed = await api.getAllDetailsByAppIDAndPlatform(currentAppId, currentPlatform, countryCode);
						if (!cancelled && refreshed) {
							setDbDetails(refreshed);
						}
					}
				}
			} catch (err) {
				if (!cancelled) {
					console.warn('Failed to sync resolved store price to DB:', err);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [appId, dbDetails?.app_id, dbDetails?.cost, dbDetails?.country_code, dbDetails?.platform_name, dbDetails?.price, model?.price, requestedPlatform]);

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
				{ label: 'Price', value: resolveSteamPriceLabel(steam) || formatCurrencyPrice(resolveSteamPriceValue(steam), 'steam') },
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
				dbPlatform !== 'gog' && dbPlatform !== 'steam' && typeof dbDetails.formated_price === 'string' && dbDetails.formated_price.trim()
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

	const activePlatform = normalizePlatformName(model.platform_name);
	const activeShot = screenshotSources[currentScreenshot] || '';
	const topBackdropImage = model.heroImage || model.coverImage || screenshotSources[0] || '';
	const showcaseImage = activeShot || model.heroImage || model.coverImage || '';

	const platformActionTargets = useMemo(() => {
		const byPlatform = new Map();

		const addTarget = (platform, href, appIdHint, options = {}) => {
			const normalizedPlatform = normalizePlatformName(platform);
			if (!['steam', 'gog', 'itchio'].includes(normalizedPlatform)) return;

			const normalizedHref = String(href || '').trim();
			let safeHref = normalizedHref;
			if (normalizedPlatform === 'itchio' && normalizedHref && !isItchStoreHref(normalizedHref)) {
				safeHref = '';
			}
			if (normalizedPlatform === 'gog' && normalizedHref && !extractGogSlugFromStoreHref(normalizedHref)) {
				safeHref = '';
			}

			const appIdFromHref = inferPlatformAppId(normalizedPlatform, safeHref);
			const numericHint = Number(appIdHint);
			const allowItchIdHint = options?.allowItchIdHint === true;
			const resolvedAppId = Number.isFinite(appIdFromHref) && appIdFromHref > 0
				? appIdFromHref
				: normalizedPlatform === 'itchio'
					? (allowItchIdHint && Number.isFinite(numericHint) && numericHint > 0 ? numericHint : null)
					: (Number.isFinite(numericHint) && numericHint > 0 ? numericHint : null);

			const current = byPlatform.get(normalizedPlatform);
			if (!current) {
				byPlatform.set(normalizedPlatform, {
					platform: normalizedPlatform,
					label: getStorePlatformLabel(normalizedPlatform),
					href: safeHref || null,
					appId: resolvedAppId,
				});
				return;
			}

			if (!current.href && safeHref) current.href = safeHref;
			if ((!current.appId || current.appId <= 0) && resolvedAppId) current.appId = resolvedAppId;
		};

		for (const target of scrapedTargets || []) {
			addTarget(target?.platform, target?.href || null, target?.appId, { allowItchIdHint: true });
		}

		const primaryHref = defaultSiteForPlatform(activePlatform, appId, model.title || model.name || '')?.[0]?.href || null;
		addTarget(activePlatform, primaryHref, appId, { allowItchIdHint: activePlatform === 'itchio' });

		for (const site of model.sites || []) {
			const inferredPlatform = inferPlatformFromSite(site) || activePlatform;
			addTarget(inferredPlatform, site?.href || null, appId, { allowItchIdHint: false });
		}

		return Array.from(byPlatform.values());
	}, [activePlatform, appId, model.name, model.sites, model.title, scrapedTargets]);

	const ratingTargets = useMemo(() => {
		const targets = {
			steam: { appId: null, href: '' },
			gog: { appId: null, href: '' },
			itchio: { appId: null, href: '' },
		};

		const upsert = (platformName, appIdCandidate, hrefCandidate) => {
			const normalizedPlatform = normalizePlatformName(platformName);
			if (!targets[normalizedPlatform]) return;

			const numericAppId = toPositiveNumber(appIdCandidate);
			if (!targets[normalizedPlatform].appId && numericAppId) {
				targets[normalizedPlatform].appId = numericAppId;
			}

			const absoluteHref = toAbsoluteStoreHref(normalizedPlatform, hrefCandidate);
			if (normalizedPlatform === 'gog' && absoluteHref && !extractGogSlugFromStoreHref(absoluteHref)) {
				return;
			}
			if (!targets[normalizedPlatform].href && /^https?:\/\//i.test(absoluteHref)) {
				targets[normalizedPlatform].href = absoluteHref;
			}
		};

		// Try scraped targets first
		for (const target of scrapedTargets || []) {
			upsert(target?.platform, target?.appId ?? appId, target?.href);
		}

		for (const target of platformActionTargets || []) {
			upsert(target?.platform, target?.appId ?? appId, target?.href);
		}

		for (const site of model.sites || []) {
			const siteHref = String(site?.href || '').trim();
			const inferredPlatform = inferPlatformFromSite(site);
			
			// For GOG, validate the slug before using it
			if (inferredPlatform === 'gog' || siteHref.includes('gog.com')) {
				const gogSlugMatch = siteHref.match(/\/game\/([a-z0-9_-]+)/i);
				if (gogSlugMatch && gogSlugMatch[1]) {
					const extractedSlug = gogSlugMatch[1];
					// Check if it's just a numeric ID (invalid GOG slug)
					const isNumericOnly = /^\d+$/.test(extractedSlug);
					if (!isNumericOnly) {
						// Use the full URL if it's valid, otherwise reconstruct
						const gogHref = /^https?:\/\//i.test(siteHref) ? siteHref : `https://www.gog.com/en/game/${extractedSlug}`;
						upsert('gog', extractedSlug, gogHref);
					} else {
						console.warn('[ratingTargets] GOG numeric ID found (invalid slug), skipping:', { numericId: extractedSlug });
					}
				}
			} else {
				// Non-GOG sites, process normally
				upsert(inferredPlatform, appId, siteHref);
			}
		}

		if (activePlatform === 'steam') {
			const steamAppId = toPositiveNumber(model.appid ?? appId);
			if (steamAppId) {
				upsert('steam', steamAppId, defaultSiteForPlatform('steam', steamAppId)?.[0]?.href || '');
			}
		}
		if (activePlatform === 'gog') {
			// First check if we already have a valid GOG URL from model.sites
			if (!targets.gog.href) {
				// Try to build a proper GOG URL from the title slug
				const gameTitle = String(model.title || model.name || '').trim();
				const gogSlugs = buildGogTitleSlugs(gameTitle);
				if (gogSlugs.length > 0) {
					// Use the first slug candidate
					const gogUrl = `https://www.gog.com/en/game/${gogSlugs[0]}`;
					upsert('gog', gogSlugs[0], gogUrl);
				}
			}
		}
		if (activePlatform === 'itchio') {
			upsert('itchio', model.appid ?? appId, buildItchSearchHref(model.title || model.name || ''));
		}

		return targets;
	}, [activePlatform, appId, model.appid, model.name, model.sites, model.title, platformActionTargets, scrapedTargets, platformDetails]);

	useEffect(() => {
		let cancelled = false;

		const steamAppId = toPositiveNumber(ratingTargets.steam.appId);
		const gogHref = toAbsoluteStoreHref('gog', ratingTargets.gog.href);
		const itchHref = toAbsoluteStoreHref('itchio', ratingTargets.itchio.href);



		setRatingsByPlatform({
			steam: { loading: !!steamAppId, data: null },
			gog: { loading: !!gogHref, data: null },
			itchio: { loading: !!itchHref, data: null },
		});

		void (async () => {
			const [steamData, gogData, itchioData] = await Promise.all([
				steamAppId ? fetchSteamUserRating(steamAppId).catch(() => null) : Promise.resolve(null),
				gogHref ? fetchGogUserRating(gogHref).catch(() => null) : Promise.resolve(null),
				itchHref ? fetchItchUserRating(itchHref).catch(() => null) : Promise.resolve(null),
			]);

			if (cancelled) return;

			setRatingsByPlatform({
				steam: { loading: false, data: steamData },
				gog: { loading: false, data: gogData },
				itchio: { loading: false, data: itchioData },
			});
		})();

		return () => {
			cancelled = true;
		};
	}, [ratingTargets.gog.href, ratingTargets.gog.appId, ratingTargets.itchio.href, ratingTargets.steam.appId, activePlatform, appId, model.appid, platformDetails?.id, platformDetails?.productId]);

	const availableOnTargets = useMemo(() => {
		const targets = [];
		const seen = new Set();
		const platformTargetIndex = new Map();
		const gameTitle = String(model.title || model.name || '').trim();

		const isOfficialStorePlatform = (platformName) => (
			platformName === 'steam' || platformName === 'gog' || platformName === 'itchio'
		);

		const addTarget = (id, label, href, platformHint = '') => {
			const normalizedHref = String(href || '').trim();
			if (!/^https?:\/\//i.test(normalizedHref)) return;
			const hrefKey = normalizedHref.toLowerCase();
			if (seen.has(hrefKey)) return;

			const normalizedPlatform = normalizePlatformName(
				platformHint || inferPlatformFromSite({ label, href: normalizedHref }) || ''
			);
			if (normalizedPlatform === 'gog' && !extractGogSlugFromStoreHref(normalizedHref)) return;
			const nextTarget = {
				id: String(id || hrefKey),
				label: String(label || 'Store').trim() || 'Store',
				href: normalizedHref,
			};

			if (isOfficialStorePlatform(normalizedPlatform)) {
				const existingIndex = platformTargetIndex.get(normalizedPlatform);
				if (typeof existingIndex === 'number') {
					if (normalizedPlatform === 'itchio') {
						const currentTarget = targets[existingIndex];
						if (shouldPreferItchAvailableTarget(nextTarget, currentTarget, gameTitle)) {
							const currentHrefKey = String(currentTarget?.href || '').trim().toLowerCase();
							if (currentHrefKey) seen.delete(currentHrefKey);
							targets[existingIndex] = nextTarget;
							seen.add(hrefKey);
						}
					}
					return;
				}
				platformTargetIndex.set(normalizedPlatform, targets.length);
			}

			seen.add(hrefKey);
			targets.push(nextTarget);
		};

		for (let index = 0; index < (platformActionTargets || []).length; index += 1) {
			const target = platformActionTargets[index];
			const targetPlatform = normalizePlatformName(target?.platform);
			const targetAppId = Number(target?.appId ?? appId);
			const fallbackHref = targetPlatform === 'itchio'
				? buildItchSearchHref(model.title || model.name || '')
				: (defaultSiteForPlatform(
					targetPlatform,
					Number.isFinite(targetAppId) && targetAppId > 0 ? targetAppId : appId,
					model.title || model.name || ''
				)?.[0]?.href || '');
			const targetHref = targetPlatform === 'itchio' && !isSpecificItchGameHref(target?.href)
				? fallbackHref
				: (target?.href || fallbackHref);
			addTarget(
				target?.id || `platform-${targetPlatform || index}`,
				target?.label || getStorePlatformLabel(targetPlatform || activePlatform),
				targetHref,
				targetPlatform,
			);
		}

		for (let index = 0; index < (model.sites || []).length; index += 1) {
			const site = model.sites[index];
			const inferredPlatform = normalizePlatformName(inferPlatformFromSite(site) || '');
			if (inferredPlatform === 'itchio' && !itchSiteMatchesGameTitle(site, gameTitle)) {
				continue;
			}
			const siteHref = inferredPlatform === 'itchio' && !isSpecificItchGameHref(site?.href)
				? buildItchSearchHref(model.title || model.name || '')
				: site?.href;
			addTarget(site?.id || `site-${index}`, site?.label || 'Store', siteHref, inferredPlatform);
		}

		for (let index = 0; index < (model.pirate_links || []).length; index += 1) {
			const entry = model.pirate_links[index];
			const piratePageHref = resolvePirateSitePageHref(entry, model.title || model.name || '');
			const baseLabel = String(entry?.label || `Pirate Source ${index + 1}`).trim() || `Pirate Source ${index + 1}`;
			const pirateLabel = /\bpirate\b/i.test(baseLabel) ? baseLabel : `${baseLabel} (Pirate)`;
			addTarget(entry?.id || `pirate-page-${index}`, pirateLabel, piratePageHref);
		}

		return targets;
	}, [activePlatform, appId, model.name, model.pirate_links, model.sites, model.title, platformActionTargets]);

	const ratingDisplayRows = useMemo(() => {
		const orderedPlatforms = ['steam', 'gog', 'itchio'];

		return orderedPlatforms.map((platformName) => {
			const state = ratingsByPlatform?.[platformName] || { loading: false, data: null };
			const data = state?.data && typeof state.data === 'object' ? state.data : null;
			const numericScore = Number(data?.score);
			const numericScale = Number(data?.scoreScale);
			const numericCount = Number(data?.reviewCount);
			const safeScale = Number.isFinite(numericScale) && numericScale > 0 ? numericScale : 100;
			const normalizedPercent = Number.isFinite(numericScore) && numericScore > 0
				? (numericScore / safeScale) * 100
				: null;

			let valueText = 'N/A';
			let detailText = 'No public rating available';
			let valueColorClass = 'text-slate-100';

			if (state?.loading) {
				valueText = 'Loading...';
				detailText = 'Fetching public rating';
			} else if (data?.available === true && Number.isFinite(numericScore) && numericScore > 0) {
				if (numericScale === 100) {
					valueText = `${Math.round(numericScore)}%`;
				} else {
					const displayScale = Number.isFinite(numericScale) && numericScale > 0 ? numericScale : 5;
					valueText = `${numericScore.toFixed(1)} / ${displayScale}`;
				}

				if (Number.isFinite(normalizedPercent)) {
					if (normalizedPercent < 33.3334) {
						valueColorClass = 'text-rose-400';
					} else if (normalizedPercent < 66.6667) {
						valueColorClass = 'text-amber-300';
					} else {
						valueColorClass = 'text-emerald-400';
					}
				}

				const details = [];
				if (hasFilledText(data?.summary)) details.push(String(data.summary).trim());
				if (Number.isFinite(numericCount) && numericCount > 0) {
					details.push(`${formatReviewCount(numericCount)} ${Math.round(numericCount) === 1 ? 'review' : 'reviews'}`);
				}
				detailText = details.length > 0 ? details.join(' · ') : 'User rating';
			}

			return {
				platform: platformName,
				label: getStorePlatformLabel(platformName),
				valueText,
				valueColorClass,
				detailText,
				href: String(data?.href || ratingTargets?.[platformName]?.href || '').trim(),
			};
		});
	}, [ratingTargets, ratingsByPlatform]);

	const minimumRequirementsVerdictClass = useMemo(() => {
		if (minimumRequirementsCheck.verdict === REQUIREMENT_CHECK_SHOULD_RUN) return 'text-emerald-300';
		if (minimumRequirementsCheck.verdict === REQUIREMENT_CHECK_PROBABLY_NOT) return 'text-rose-300';
		if (minimumRequirementsCheck.verdict === REQUIREMENT_CHECK_HOPES) return 'text-amber-200';
		return 'text-slate-300';
	}, [minimumRequirementsCheck.verdict]);

	const handleCheckMinimumRequirements = useCallback(async () => {
		setMinimumRequirementsCheck({
			status: 'loading',
			verdict: '',
			details: [],
			error: '',
		});

		try {
			const api = typeof window !== 'undefined' ? window.electronAPI : null;
			if (!api || typeof api.getLocalHardwareProfile !== 'function') {
				throw new Error('Hardware profile API is not available.');
			}

			const now = Date.now();
			const cached = localHardwareProfileRef.current;
			const canReuseCache = cached
				&& cached.value
				&& Number.isFinite(cached.fetchedAt)
				&& (now - cached.fetchedAt) < LOCAL_HARDWARE_PROFILE_CACHE_TTL_MS;

			const profile = canReuseCache
				? cached.value
				: await withTimeout(
					api.getLocalHardwareProfile(),
					LOCAL_HARDWARE_PROFILE_TIMEOUT_MS,
					'Hardware check timed out. Please try again.'
				);

			if (!canReuseCache) {
				localHardwareProfileRef.current = {
					value: profile,
					fetchedAt: Date.now(),
				};
			}

			const result = evaluateMinimumRequirements(model.minimumRequirements || '', profile || {});

			setMinimumRequirementsCheck({
				status: 'ready',
				verdict: String(result?.verdict || REQUIREMENT_CHECK_HOPES),
				details: Array.isArray(result?.details) ? result.details : [],
				error: '',
			});
		} catch (error) {
			setMinimumRequirementsCheck({
				status: 'error',
				verdict: '',
				details: [],
				error: error instanceof Error ? error.message : 'Could not evaluate minimum requirements.',
			});
		}
	}, [model.minimumRequirements]);

	const openExternalUrl = async (href) => {
		const normalizedHref = String(href || '').trim();
		if (!/^https?:\/\//i.test(normalizedHref)) return false;

		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (typeof api?.openExternalUrl === 'function') {
			try {
				await api.openExternalUrl(normalizedHref);
				return true;
			} catch {
				// Fallback to window.open below.
			}
		}

		try {
			window.open(normalizedHref, '_blank', 'noopener,noreferrer');
			return true;
		} catch {
			return false;
		}
	};

	const resolveItchGamePageHref = useCallback(async (seedHref = '') => {
		if (isSpecificItchGameHref(seedHref)) return seedHref;

		const titleHint = String(model.title || model.name || '').trim();
		const api = typeof window !== 'undefined' ? window.electronAPI : null;

		if (titleHint && typeof api?.getItchGameDetailsByTitle === 'function') {
			try {
				const details = await api.getItchGameDetailsByTitle(titleHint);
				const detailSiteLinks = normalizeSiteLinksFromAny(details?.links || details?.sites || details?.url || details?.store_url || details?.storeUrl);
				const detailCandidates = [
					seedHref,
					...collectItchHrefCandidates(details),
					...detailSiteLinks.map((site) => String(site?.href || '').trim()),
				];

				for (const candidate of detailCandidates) {
					if (isSpecificItchGameHref(candidate)) return candidate;
				}
			} catch {
				// Fall back to search when title lookup fails.
			}
		}

		if (titleHint) return buildItchSearchHref(titleHint);
		if (isItchStoreHref(seedHref)) return seedHref;
		return 'https://itch.io/';
	}, [model.name, model.title]);

	const handleOpenPlatform = async (target) => {
		if (!target) return;
		const targetAppId = Number(target.appId ?? appId);
		const targetHref = String(target?.href || '').trim();
		let fallbackOpenHref = targetHref;
		try {
			if (target.platform === 'gog' && Number.isFinite(targetAppId) && targetAppId > 0) {
				await window.electronAPI.invoke('gog:open-game-view', String(targetAppId));
				return;
			}
			if (target.platform === 'itchio') {
				const itchioHref = await resolveItchGamePageHref(targetHref);
				fallbackOpenHref = itchioHref;
				if (/^https?:\/\//i.test(itchioHref)) {
					await window.electronAPI.openItchGame(null, itchioHref);
					return;
				}
				if (Number.isFinite(targetAppId) && targetAppId > 0) {
					await window.electronAPI.openItchGame(Number(targetAppId));
					return;
				}
			}
			if (target.platform === 'steam' && Number.isFinite(targetAppId) && targetAppId > 0) {
				await window.electronAPI.storePageSteam(targetAppId);
				return;
			}

			if (await openExternalUrl(fallbackOpenHref)) return;
			throw new Error(`No launcher action is available for ${target.label}.`);
		} catch (error) {
			if (await openExternalUrl(fallbackOpenHref)) return;
			setErrorMessage(error instanceof Error ? error.message : String(error));
		}
	};

	const handleOpenPirateSite = async (entry) => {
		setErrorMessage('');
		const rawHref = decodeHtmlAmpersands(String(entry?.href || '').trim());
		const lowerHref = rawHref.toLowerCase();
		const label = String(entry?.label || '').toLowerCase();
		const api = typeof window !== 'undefined' ? window.electronAPI : null;

		// Prefer resolving exact byxatab game page via main process when possible
		if ((/byxatab\.com/.test(lowerHref) || label.includes('xatab') || label.includes('byxatab')) && typeof api?.xatabGamePageUrl === 'function') {
			const slugFallback = slugFromTitle(model.title || model.name, '-') || '';
			const slugFromLink = extractSlugFromUrl(rawHref);
			const slug = slugFromLink || slugFallback;
			const lookup = /byxatab\.com\/games\//.test(lowerHref)
				? rawHref
				: (String(model.title || model.name || slug || '').trim() || slug);

			try {
				const resolved = await withTimeout(
					api.xatabGamePageUrl(lookup),
					5000,
					'Timed out while resolving Xatab page URL.'
				);
				if (hasFilledText(resolved) && await openExternalUrl(resolved)) return;
			} catch (err) {
				// fallback to default resolver below
			}
		}

		const pageHref = resolvePirateSitePageHref(entry, model.title || model.name || '');
		if (await openExternalUrl(pageHref)) return;
		setErrorMessage('No pirate site page URL is available for this source.');
	};

	const handleOpenAvailableSite = async (site) => {
		setErrorMessage('');
		const siteHref = String(site?.href || '').trim();
		const inferredPlatform = normalizePlatformName(inferPlatformFromSite(site) || '');
		const resolvedHref = inferredPlatform === 'itchio'
			? await resolveItchGamePageHref(siteHref)
			: siteHref;

		if (await openExternalUrl(resolvedHref)) return;
		setErrorMessage('No store page URL is available for this source.');
	};

	const handleOpenPirateLink = async (entry) => {
		const explicitMagnet = String(entry?.magnet || entry?.magnet_uri || entry?.magnetUri || entry?.magnetLink || '').trim();
		const rawHref = String(entry?.href || entry?.sitelink || entry?.link || '').trim();
		if (!explicitMagnet && !rawHref) return;

		const entryKey = pirateEntryKey(entry, explicitMagnet || rawHref);
		setStartingPirateKeys((prev) => (prev.includes(entryKey) ? prev : [...prev, entryKey]));
		setErrorMessage('');

		try {
			let torrentId = decodeHtmlAmpersands(explicitMagnet || rawHref);
			const lowerHref = String(torrentId || rawHref).toLowerCase();
			const label = String(entry?.label || '').toLowerCase();

			if (!/^magnet:\?/i.test(torrentId)) {
				const api = typeof window !== 'undefined' ? window.electronAPI : null;
				const slugFallback = slugFromTitle(model.title || model.name, '-') || '';
				const slugFromLink = extractSlugFromUrl(torrentId);
				const slug = slugFromLink || slugFallback;

				if ((/fitgirl-repacks\.site/.test(lowerHref) || label.includes('fitgirl')) && slug && typeof api?.fitGirlMagnetLink === 'function') {
					const resolved = await withTimeout(
						api.fitGirlMagnetLink(slug),
						PIRATE_LINK_RESOLVE_TIMEOUT_MS,
						'Timed out while resolving FitGirl download link.'
					);
					if (hasFilledText(resolved)) {
						torrentId = decodeHtmlAmpersands(resolved);
					}
				} else if ((/pcgamestorrents?\.com/.test(lowerHref) || /igg-games\./.test(lowerHref) || label.includes('pcgamestorrent')) && slug && typeof api?.pcGamesTorrentMagnetLink === 'function') {
					const resolved = await withTimeout(
						api.pcGamesTorrentMagnetLink(slug),
						PIRATE_LINK_RESOLVE_TIMEOUT_MS,
						'Timed out while resolving PCGamesTorrent download link.'
					);
					if (hasFilledText(resolved)) {
						torrentId = decodeHtmlAmpersands(resolved);
					}
				} else if ((/online-fix\.me/.test(lowerHref) || /uploads\.online-fix\.me/.test(lowerHref) || label.includes('online-fix')) && slug && typeof api?.onlineFixMeMagnetLink === 'function') {
					const resolved = await withTimeout(
						api.onlineFixMeMagnetLink(slug),
						PIRATE_LINK_RESOLVE_TIMEOUT_MS,
						'Timed out while resolving Online-Fix download link.'
					);
					if (hasFilledText(resolved)) {
						torrentId = decodeHtmlAmpersands(resolved);
					}
				} else if ((/byxatab\.com/.test(lowerHref) || label.includes('xatab') || label.includes('byxatab')) && typeof api?.xatabMagnetLink === 'function') {
					const xatabLookupValue = /byxatab\.com\/games\//.test(lowerHref)
						? torrentId
						: (String(model.title || model.name || slug || '').trim() || slug);
					if (hasFilledText(xatabLookupValue)) {
						const resolved = await withTimeout(
							api.xatabMagnetLink(xatabLookupValue),
							PIRATE_LINK_RESOLVE_TIMEOUT_MS,
							'Timed out while resolving Xatab download link.'
						);
						if (hasFilledText(resolved)) {
							torrentId = decodeHtmlAmpersands(resolved);
						}
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
				title: model.title || model.name || '',
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
		<div className="store-game-page flex-1 overflow-y-auto text-slate-100">
			<div className="relative min-h-full">
				<div className="absolute inset-x-0 top-0 h-[340px] bg-cover bg-center opacity-30" style={{ backgroundImage: topBackdropImage ? `url(${topBackdropImage})` : undefined }} />
				<div className="absolute inset-x-0 top-0 h-[340px] bg-gradient-to-b from-slate-950/10 via-slate-950/75 to-slate-950" />

				<div className="relative px-4 py-5 md:px-8 md:py-6">
					<div className="mb-6 flex items-center justify-between gap-4">
						<button
							type="button"
							onClick={() => navigate(-1)}
							className="rounded-lg border border-slate-700/70 bg-slate-900/60 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-slate-800/70"
						>
							Back
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
									{availableOnTargets.length > 0 ? (
										<div className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
											<p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Available On</p>
											<div className="mt-2 flex flex-col gap-2">
												{availableOnTargets.map((site, index) => (
													<a
														key={site.id ?? `${site.label}-${index}`}
														href={site.href ?? '#'}
														target="_blank"
														rel="noreferrer"
														onClick={(event) => {
															event.preventDefault();
															void handleOpenAvailableSite(site);
														}}
														className="rounded-lg border border-slate-700/70 bg-slate-950/45 px-3 py-2 text-xs text-slate-200 transition-colors hover:bg-slate-800/80"
													>
														{site.label ?? 'Store'}
													</a>
												))}
											</div>
										</div>
									) : null}
									{platformActionTargets.map((target) => {
										const platformRating = ratingDisplayRows.find((r) => r.platform === target.platform);
										const openDisabled = !target?.href && !(Number.isFinite(Number(target?.appId)) && Number(target?.appId) > 0);
										return (
											<div key={target.platform} className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
												<div className="flex items-center justify-between gap-2 mb-2">
													<p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">{target.label}</p>
													{platformRating && platformRating.valueText !== 'N/A' && (
														<p className={`text-sm font-semibold ${platformRating.valueColorClass || 'text-slate-100'}`}>{platformRating.valueText}</p>
													)}
												</div>
												{platformRating && platformRating.valueText !== 'N/A' && (
													<p className="text-[11px] text-slate-400 mb-2 text-right">{platformRating.detailText}</p>
												)}
												<button
													type="button"
													onClick={() => handleOpenPlatform(target)}
													disabled={openDisabled}
													className="w-full rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
												>
													Open
												</button>
											</div>
										);
									})}
									{Array.isArray(model.pirate_links) && model.pirate_links.length > 0 ? (
										<div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
											<p className="text-[11px] uppercase tracking-[0.18em] text-amber-200">Pirate Downloads</p>
											<div className="mt-2 flex flex-col gap-2">
												{model.pirate_links.map((entry, index) => {
													const pirateKey = pirateEntryKey(entry, index);
													const pirateLabel = String(entry?.label || `Source ${index + 1}`).trim() || `Source ${index + 1}`;
													const openHref = resolvePirateSitePageHref(entry, model.title || model.name || '');
													const openDisabled = !openHref;
													const isStartingPirate = startingPirateKeys.includes(pirateKey);
													return (
														<div key={entry.id || `${pirateLabel}-${index}`} className="rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
															<p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">{pirateLabel}</p>
															<div className="mt-2 grid grid-cols-2 gap-2">
																<button
																	type="button"
																	onClick={() => handleOpenPirateSite(entry)}
																	disabled={openDisabled}
																	className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
																>
																	Open
																</button>
																<button
																	type="button"
																	onClick={() => handleOpenPirateLink(entry)}
																	disabled={isStartingPirate}
																	className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
																>
																	{isStartingPirate ? 'Starting Download...' : 'Download'}
																</button>
															</div>
														</div>
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
									{availableOnTargets.map((site, index) => (
										<a
											key={site.id ?? `${site.label}-${index}`}
											href={site.href ?? '#'}
											target="_blank"
											rel="noreferrer"
											onClick={(event) => {
												event.preventDefault();
												void handleOpenAvailableSite(site);
											}}
											className="rounded-xl border border-slate-700/70 bg-slate-950/45 px-4 py-3 text-sm text-slate-200 transition-colors hover:bg-slate-800/80"
										>
											{site.label ?? 'Store'}
										</a>
									))}
								</div>
							</div>

							{model.minimumRequirements ? (
								<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm">
									<div className="flex items-center justify-between gap-3">
										<h2 className="text-lg font-semibold text-white">Minimum Requirements</h2>
										<button
											type="button"
											onClick={() => { void handleCheckMinimumRequirements(); }}
											disabled={minimumRequirementsCheck.status === 'loading'}
											className="rounded-lg bg-indigo-500 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white transition-colors hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
										>
											{minimumRequirementsCheck.status === 'loading' ? 'Checking...' : 'Check My PC'}
										</button>
									</div>
									<div className="mt-3 text-sm leading-6 text-slate-300 [&_ul]:ml-5 [&_ul]:list-disc [&_strong]:text-slate-100" dangerouslySetInnerHTML={{ __html: model.minimumRequirements }} />
									{minimumRequirementsCheck.status === 'ready' ? (
										<div className="mt-3 rounded-xl border border-slate-700/70 bg-slate-950/55 px-3 py-3">
											<p className={`text-sm font-semibold ${minimumRequirementsVerdictClass}`}>{minimumRequirementsCheck.verdict}</p>
											{Array.isArray(minimumRequirementsCheck.details) && minimumRequirementsCheck.details.length > 0 ? (
												<div className="mt-2 flex flex-col gap-1">
													{minimumRequirementsCheck.details.map((detail, index) => (
														<p key={`${detail}-${index}`} className="text-xs text-slate-400">{detail}</p>
													))}
												</div>
											) : null}
										</div>
									) : null}
									{minimumRequirementsCheck.status === 'error' && minimumRequirementsCheck.error ? (
										<p className="mt-3 text-xs text-rose-300">{minimumRequirementsCheck.error}</p>
									) : null}
								</div>
							) : null}
						</div>

						<div className="space-y-5">
							<div className="rounded-3xl border border-slate-700/60 bg-slate-900/45 p-5 backdrop-blur-sm">
								<p className="text-xs uppercase tracking-[0.2em] text-sky-300">Store</p>
								<h1 className="mt-2 text-3xl font-semibold text-white md:text-5xl">{model.title}</h1>
								{loading ? <p className="mt-3 text-xs uppercase tracking-[0.16em] text-slate-400">Loading store information...</p> : null}
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
								<div className="relative aspect-video bg-slate-800/30">
									{showcaseImage ? <img src={showcaseImage} alt={`${model.title} screenshot`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-500">No screenshot available</div>}

									{loading ? null : (
										<>
											<button
												type="button"
												onClick={goPrevScreenshot}
												disabled={screenshotSources.length < 2}
												className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-600/80 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 transition-colors hover:bg-slate-800/85 disabled:cursor-not-allowed disabled:opacity-45"
											>
												‹
											</button>
											<button
												type="button"
												onClick={goNextScreenshot}
												disabled={screenshotSources.length < 2}
												className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-slate-600/80 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 transition-colors hover:bg-slate-800/85 disabled:cursor-not-allowed disabled:opacity-45"
											>
												›
											</button>
										</>
									)}
								</div>
								{screenshotSources.length > 1 ? (
									<div className="grid grid-cols-4 gap-2 border-t border-slate-800/80 p-3 md:grid-cols-6">
										{screenshotSources.slice(0, 6).map((shot, index) => (
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