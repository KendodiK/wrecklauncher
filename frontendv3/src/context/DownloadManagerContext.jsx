import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const DownloadManagerContext = createContext(null);
const DOWNLOAD_RESUME_STORAGE_KEY = 'wrecklauncher.torrent.resume.v1';
const DOWNLOAD_COMPLETED_STORAGE_KEY = 'wrecklauncher.torrent.completed.v1';
const DOWNLOAD_RESUME_CACHE_KEY = 'downloads:resume';
const DOWNLOAD_COMPLETED_CACHE_KEY = 'downloads:completed';
const RESUME_RESTORE_STARTUP_DELAY_MS = 1800;

function getElectronApi() {
	if (typeof window === 'undefined' || !window.electronAPI) return null;
	return window.electronAPI;
}

async function readTorrentCachePayload(key) {
	const api = getElectronApi();
	if (!api || typeof api.torrentCacheGet !== 'function') {
		return { available: false, hasValue: false, value: null };
	}

	try {
		const payload = await api.torrentCacheGet(String(key || '').trim());
		if (!payload || typeof payload !== 'object') {
			return { available: true, hasValue: false, value: null };
		}
		return {
			available: true,
			hasValue: Object.prototype.hasOwnProperty.call(payload, 'value'),
			value: payload.value,
		};
	} catch {
		return { available: true, hasValue: false, value: null };
	}
}

function writeTorrentCacheEntries(key, value) {
	const api = getElectronApi();
	if (!api || typeof api.torrentCacheSet !== 'function') return;
	Promise
		.resolve(api.torrentCacheSet(String(key || '').trim(), value))
		.catch(() => {
			// ignore cache write errors
		});
}

function normalizeProgress(progress) {
	if (!progress || typeof progress !== 'object') return null;
	const infoHash = String(progress.infoHash || '').trim();
	if (!infoHash) return null;
	const normalized = {
		infoHash,
		name: String(progress.name || progress.title || infoHash || 'Pending...').trim() || 'Pending...',
		progress: typeof progress.progress === 'number' ? progress.progress : 0,
		downloadSpeed: typeof progress.downloadSpeed === 'number' ? progress.downloadSpeed : 0,
		uploadSpeed: typeof progress.uploadSpeed === 'number' ? progress.uploadSpeed : 0,
		downloaded: typeof progress.downloaded === 'number' ? progress.downloaded : 0,
		length: typeof progress.length === 'number' ? progress.length : 0,
		numPeers: typeof progress.numPeers === 'number' ? progress.numPeers : 0,
		timeRemaining: typeof progress.timeRemaining === 'number' ? progress.timeRemaining : -1,
		paused: Boolean(progress.paused),
		done: Boolean(progress.done),
	};

	const magnetURI = typeof progress.magnetURI === 'string' ? progress.magnetURI.trim() : '';
	if (magnetURI) normalized.magnetURI = magnetURI;

	const savePath = typeof progress.savePath === 'string'
		? progress.savePath.trim()
		: (typeof progress.path === 'string' ? progress.path.trim() : '');
	if (savePath) normalized.savePath = savePath;

	if (typeof progress.imageUrl === 'string' && progress.imageUrl.trim()) {
		normalized.imageUrl = progress.imageUrl.trim();
	}
	if (typeof progress.thumbnailUrl === 'string' && progress.thumbnailUrl.trim()) {
		normalized.thumbnailUrl = progress.thumbnailUrl.trim();
	}
	if (typeof progress.coverUrl === 'string' && progress.coverUrl.trim()) {
		normalized.coverUrl = progress.coverUrl.trim();
	}
	if (typeof progress.image === 'string' && progress.image.trim()) {
		normalized.image = progress.image.trim();
	}

	return normalized;
}

function normalizeResumableEntry(entry) {
	if (!entry || typeof entry !== 'object') return null;
	const infoHash = String(entry.infoHash || '').trim();
	const magnetURI = String(entry.magnetURI || entry.magnetUri || '').trim();
	const savePath = String(entry.savePath || entry.path || '').trim();
	if (!infoHash && !magnetURI) return null;

	const normalized = {
		infoHash,
		magnetURI,
		savePath,
		paused: Boolean(entry.paused),
		done: Boolean(entry.done),
		name: String(entry.name || '').trim(),
	};

	if (typeof entry.imageUrl === 'string' && entry.imageUrl.trim()) {
		normalized.imageUrl = entry.imageUrl.trim();
	}
	if (typeof entry.thumbnailUrl === 'string' && entry.thumbnailUrl.trim()) {
		normalized.thumbnailUrl = entry.thumbnailUrl.trim();
	}
	if (typeof entry.coverUrl === 'string' && entry.coverUrl.trim()) {
		normalized.coverUrl = entry.coverUrl.trim();
	}
	if (typeof entry.image === 'string' && entry.image.trim()) {
		normalized.image = entry.image.trim();
	}

	return normalized;
}

function resumableKey(entry) {
	if (!entry || typeof entry !== 'object') return '';
	const hash = String(entry.infoHash || '').trim().toLowerCase();
	if (hash) return `hash:${hash}`;
	const magnet = String(entry.magnetURI || '').trim().toLowerCase();
	if (magnet) return `magnet:${magnet}`;
	return '';
}

function normalizeResumableEntriesList(entries) {
	const source = Array.isArray(entries) ? entries : [];
	const deduped = [];
	const seen = new Set();

	for (const entry of source) {
		const normalized = normalizeResumableEntry(entry);
		if (!normalized) continue;
		const key = resumableKey(normalized);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		deduped.push(normalized);
	}

	return deduped;
}

function readResumableEntries() {
	if (typeof window === 'undefined' || !window.localStorage) return [];
	try {
		const raw = window.localStorage.getItem(DOWNLOAD_RESUME_STORAGE_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		return normalizeResumableEntriesList(parsed);
	} catch {
		return [];
	}
}

function writeResumableEntries(entries) {
	if (typeof window === 'undefined' || !window.localStorage) return;
	try {
		window.localStorage.setItem(DOWNLOAD_RESUME_STORAGE_KEY, JSON.stringify(entries));
	} catch {
		// ignore local storage write errors
	}
}

function normalizeCompletedEntry(entry) {
	const normalized = normalizeProgress(entry);
	if (!normalized) return null;

	const completedAt = Number(entry?.completedAt);
	return {
		...normalized,
		done: true,
		progress: Math.max(1, Number(normalized.progress) || 0),
		completedAt: Number.isFinite(completedAt) && completedAt > 0 ? completedAt : Date.now(),
	};
}

function completedEntryKey(entry) {
	if (!entry || typeof entry !== 'object') return '';
	const hash = String(entry.infoHash || '').trim().toLowerCase();
	if (hash) return `hash:${hash}`;

	const savePath = String(entry.savePath || entry.path || '').trim().toLowerCase();
	const name = String(entry.name || '').trim().toLowerCase();
	if (savePath || name) return `path:${savePath}|name:${name}`;

	const magnet = String(entry.magnetURI || '').trim().toLowerCase();
	if (magnet) return `magnet:${magnet}`;
	return '';
}

function mergeCompletedEntries(previousEntries, incomingEntries) {
	const previous = Array.isArray(previousEntries) ? previousEntries : [];
	const incoming = Array.isArray(incomingEntries) ? incomingEntries : [incomingEntries];

	const next = [...previous];
	for (const candidate of incoming) {
		const normalized = normalizeCompletedEntry(candidate);
		if (!normalized) continue;

		const key = completedEntryKey(normalized);
		if (!key) continue;

		const index = next.findIndex((entry) => completedEntryKey(entry) === key);
		if (index === -1) {
			next.unshift(normalized);
			continue;
		}

		const existing = next[index] || {};
		next[index] = {
			...existing,
			...normalized,
			done: true,
			progress: Math.max(1, Number(normalized.progress) || Number(existing.progress) || 1),
			completedAt: Math.max(Number(existing.completedAt) || 0, Number(normalized.completedAt) || 0) || Date.now(),
		};
	}

	return next.sort((left, right) => (Number(right?.completedAt) || 0) - (Number(left?.completedAt) || 0));
}

function normalizeCompletedEntriesList(entries) {
	const source = Array.isArray(entries) ? entries : [];
	let merged = [];
	for (const entry of source) {
		merged = mergeCompletedEntries(merged, entry);
	}
	return merged;
}

function readCompletedEntries() {
	if (typeof window === 'undefined' || !window.localStorage) return [];
	try {
		const raw = window.localStorage.getItem(DOWNLOAD_COMPLETED_STORAGE_KEY);
		if (!raw) return [];

		const parsed = JSON.parse(raw);
		return normalizeCompletedEntriesList(parsed);
	} catch {
		return [];
	}
}

function writeCompletedEntries(entries) {
	if (typeof window === 'undefined' || !window.localStorage) return;
	try {
		window.localStorage.setItem(DOWNLOAD_COMPLETED_STORAGE_KEY, JSON.stringify(Array.isArray(entries) ? entries : []));
	} catch {
		// ignore local storage write errors
	}
}

function buildResumableEntry(download, previous = null) {
	if (!download || typeof download !== 'object') return null;
	const infoHash = String(download.infoHash || previous?.infoHash || '').trim();
	const magnetURI = String(download.magnetURI || previous?.magnetURI || '').trim();
	const savePath = String(download.savePath || download.path || previous?.savePath || '').trim();
	if (!infoHash && !magnetURI) return null;

	const out = {
		infoHash,
		magnetURI,
		savePath,
		paused: Boolean(download.paused),
		done: Boolean(download.done),
		name: String(download.name || previous?.name || '').trim(),
	};

	const imageUrl = String(download.imageUrl || previous?.imageUrl || '').trim();
	if (imageUrl) out.imageUrl = imageUrl;
	const thumbnailUrl = String(download.thumbnailUrl || previous?.thumbnailUrl || '').trim();
	if (thumbnailUrl) out.thumbnailUrl = thumbnailUrl;
	const coverUrl = String(download.coverUrl || previous?.coverUrl || '').trim();
	if (coverUrl) out.coverUrl = coverUrl;
	const image = String(download.image || previous?.image || '').trim();
	if (image) out.image = image;

	return out;
}

function mergeArtworkFields(baseEntry, fallbackEntry) {
	if (!baseEntry || typeof baseEntry !== 'object') return baseEntry;
	if (!fallbackEntry || typeof fallbackEntry !== 'object') return baseEntry;

	const next = { ...baseEntry };
	if (!String(next.imageUrl || '').trim() && String(fallbackEntry.imageUrl || '').trim()) {
		next.imageUrl = String(fallbackEntry.imageUrl).trim();
	}
	if (!String(next.thumbnailUrl || '').trim() && String(fallbackEntry.thumbnailUrl || '').trim()) {
		next.thumbnailUrl = String(fallbackEntry.thumbnailUrl).trim();
	}
	if (!String(next.coverUrl || '').trim() && String(fallbackEntry.coverUrl || '').trim()) {
		next.coverUrl = String(fallbackEntry.coverUrl).trim();
	}
	if (!String(next.image || '').trim() && String(fallbackEntry.image || '').trim()) {
		next.image = String(fallbackEntry.image).trim();
	}

	return next;
}

export function DownloadManagerProvider({ children }) {
	const [downloads, setDownloads] = useState([]);
	const [completedDownloads, setCompletedDownloads] = useState(() => readCompletedEntries());
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');
	const [cacheHydrated, setCacheHydrated] = useState(false);
	const [resumeBootstrapped, setResumeBootstrapped] = useState(false);

	const upsertDownload = useCallback((entry) => {
		const normalized = normalizeProgress(entry);
		if (!normalized) return;

		if (normalized.done) {
			setDownloads((prev) => {
				const index = prev.findIndex((item) => item.infoHash === normalized.infoHash);
				const activeEntry = index >= 0 ? prev[index] : null;
				const completedEntry = {
					...(activeEntry || {}),
					...normalized,
					done: true,
					progress: Math.max(1, Number(normalized.progress) || 0),
					completedAt: Date.now(),
				};

				setCompletedDownloads((prevCompleted) => mergeCompletedEntries(prevCompleted, completedEntry));

				if (index === -1) return prev;
				const next = [...prev];
				next.splice(index, 1);
				return next;
			});
			return;
		}

		setDownloads((prev) => {
			const index = prev.findIndex((item) => item.infoHash === normalized.infoHash);
			if (index === -1) return [normalized, ...prev];
			const next = [...prev];
			next[index] = { ...next[index], ...normalized };
			return next;
		});
	}, []);

	const refreshStatus = useCallback(async () => {
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.torrentGetStatus !== 'function') return;
		try {
			setBusy(true);
			setError('');
			const current = await api.torrentGetStatus();
			const normalized = Array.isArray(current)
				? current.map((item) => normalizeProgress(item)).filter(Boolean)
				: [];

			const active = [];
			const completed = [];
			for (const item of normalized) {
				if (item.done) {
					completed.push({ ...item, completedAt: Date.now() });
				} else {
					active.push(item);
				}
			}

			const resumableEntries = readResumableEntries();
			const resumableByHash = new Map(
				resumableEntries
					.map((entry) => [String(entry?.infoHash || '').trim().toLowerCase(), entry])
					.filter(([key]) => Boolean(key)),
			);
			const resumableByMagnet = new Map(
				resumableEntries
					.map((entry) => [String(entry?.magnetURI || '').trim().toLowerCase(), entry])
					.filter(([key]) => Boolean(key)),
			);

			setDownloads((prev) => {
				const prevByHash = new Map(
					prev
						.map((entry) => [String(entry?.infoHash || '').trim().toLowerCase(), entry])
						.filter(([key]) => Boolean(key)),
				);
				const prevByMagnet = new Map(
					prev
						.map((entry) => [String(entry?.magnetURI || '').trim().toLowerCase(), entry])
						.filter(([key]) => Boolean(key)),
				);

				return active.map((entry) => {
					const hashKey = String(entry?.infoHash || '').trim().toLowerCase();
					const magnetKey = String(entry?.magnetURI || '').trim().toLowerCase();
					const fallback =
						(hashKey && prevByHash.get(hashKey)) ||
						(magnetKey && prevByMagnet.get(magnetKey)) ||
						(hashKey && resumableByHash.get(hashKey)) ||
						(magnetKey && resumableByMagnet.get(magnetKey)) ||
						null;
					return mergeArtworkFields(entry, fallback);
				});
			});
			if (completed.length > 0) {
				setCompletedDownloads((prevCompleted) => mergeCompletedEntries(prevCompleted, completed));
			}
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}, []);

	const restoreInterruptedDownloads = useCallback(async (entries = null) => {
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.torrentStart !== 'function') return;

		const sourceEntries = Array.isArray(entries) ? entries : readResumableEntries();
		const resumable = sourceEntries.filter((entry) => {
			if (!entry || typeof entry !== 'object') return false;
			if (entry.done) return false;
			if (entry.paused) return false;
			return Boolean(String(entry.magnetURI || '').trim());
		});

		if (resumable.length < 1) return;

		for (const entry of resumable) {
			try {
				const preferredName = String(entry.name || '').trim();
				const snapshot = await api.torrentStart(
					entry.magnetURI,
					entry.savePath || undefined,
					preferredName || undefined,
				);
				const snapshotName = typeof snapshot?.name === 'string' ? snapshot.name.trim() : '';
				upsertDownload({
					...snapshot,
					name: snapshotName || preferredName || String(snapshot?.infoHash || '').trim(),
					magnetURI: entry.magnetURI,
					savePath: entry.savePath || snapshot?.savePath || snapshot?.path || '',
					imageUrl: entry.imageUrl,
					thumbnailUrl: entry.thumbnailUrl,
					coverUrl: entry.coverUrl,
					image: entry.image,
				});
			} catch {
				// Keep startup resilient if one resumed torrent fails.
			}
		}
	}, [upsertDownload]);

	useEffect(() => {
		let cancelled = false;

		void (async () => {
			try {
				const localResumable = readResumableEntries();
				const localCompleted = readCompletedEntries();

				const [resumePayload, completedPayload] = await Promise.all([
					readTorrentCachePayload(DOWNLOAD_RESUME_CACHE_KEY),
					readTorrentCachePayload(DOWNLOAD_COMPLETED_CACHE_KEY),
				]);

				if (resumePayload.available && resumePayload.hasValue) {
					const normalizedResumable = normalizeResumableEntriesList(resumePayload.value);
					writeResumableEntries(normalizedResumable);
				} else if (resumePayload.available) {
					writeTorrentCacheEntries(DOWNLOAD_RESUME_CACHE_KEY, localResumable);
				}

				if (completedPayload.available && completedPayload.hasValue) {
					const normalizedCompleted = normalizeCompletedEntriesList(completedPayload.value);
					writeCompletedEntries(normalizedCompleted);
					if (!cancelled) {
						setCompletedDownloads(normalizedCompleted);
					}
				} else if (completedPayload.available) {
					writeTorrentCacheEntries(DOWNLOAD_COMPLETED_CACHE_KEY, localCompleted);
				}
			} finally {
				if (!cancelled) {
					setCacheHydrated(true);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!cacheHydrated) return;

		let cancelled = false;
		let unsub = null;
		let restoreTimer = null;
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api) {
			setResumeBootstrapped(true);
			return;
		}

		if (typeof api.onTorrentProgress === 'function') {
			unsub = api.onTorrentProgress((progress) => {
				upsertDownload(progress);
			});
		}

		const resumableSnapshot = readResumableEntries();
		void refreshStatus().catch(() => {
			// Ignore startup status refresh errors.
		});

		if (resumableSnapshot.length < 1) {
			setResumeBootstrapped(true);
		} else {
			restoreTimer = window.setTimeout(() => {
				void (async () => {
					try {
						await restoreInterruptedDownloads(resumableSnapshot);
						await refreshStatus();
					} finally {
						if (!cancelled) setResumeBootstrapped(true);
					}
				})();
			}, RESUME_RESTORE_STARTUP_DELAY_MS);
		}

		return () => {
			cancelled = true;
			if (restoreTimer) window.clearTimeout(restoreTimer);
			if (typeof unsub === 'function') unsub();
		};
	}, [cacheHydrated, refreshStatus, restoreInterruptedDownloads, upsertDownload]);

	useEffect(() => {
		if (!resumeBootstrapped) return;

		const previous = readResumableEntries();
		const previousByKey = new Map(previous.map((entry) => [resumableKey(entry), entry]));

		const nextEntries = downloads
			.map((download) => {
				const hashKey = download?.infoHash ? `hash:${String(download.infoHash).trim().toLowerCase()}` : '';
				const magnetKey = download?.magnetURI ? `magnet:${String(download.magnetURI).trim().toLowerCase()}` : '';
				const previousEntry =
					(hashKey && previousByKey.get(hashKey)) ||
					(magnetKey && previousByKey.get(magnetKey)) ||
					null;
				return buildResumableEntry(download, previousEntry);
			})
			.filter(Boolean)
			.filter((entry) => !entry.done && Boolean(String(entry.magnetURI || '').trim()));

		writeResumableEntries(nextEntries);
		writeTorrentCacheEntries(DOWNLOAD_RESUME_CACHE_KEY, nextEntries);
	}, [downloads, resumeBootstrapped]);

	useEffect(() => {
		if (!cacheHydrated) return;
		writeCompletedEntries(completedDownloads);
		writeTorrentCacheEntries(DOWNLOAD_COMPLETED_CACHE_KEY, completedDownloads);
	}, [cacheHydrated, completedDownloads]);

	const startDownload = useCallback(async ({ magnetUri, savePath, artwork, title } = {}) => {
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.torrentStart !== 'function') throw new Error('torrentStart API is not available');
		if (!magnetUri || !String(magnetUri).trim()) throw new Error('Download URI is required');
		const cleanMagnetUri = String(magnetUri).trim();
		const cleanSavePath = String(savePath || '').trim();
		const cleanTitle = String(title || '').trim();
		setError('');
		const snapshot = await api.torrentStart(cleanMagnetUri, cleanSavePath || undefined, cleanTitle || undefined);
		const art = artwork && typeof artwork === 'object' ? artwork : {};
		const snapshotName = typeof snapshot?.name === 'string' ? snapshot.name.trim() : '';
		const withArtwork = {
			...snapshot,
			name:
				snapshotName || cleanTitle || String(snapshot?.infoHash || cleanMagnetUri).trim(),
			magnetURI:
				typeof snapshot?.magnetURI === 'string' && snapshot.magnetURI.trim()
					? snapshot.magnetURI.trim()
					: cleanMagnetUri,
			savePath:
				typeof snapshot?.savePath === 'string' && snapshot.savePath.trim()
					? snapshot.savePath.trim()
					: (typeof snapshot?.path === 'string' && snapshot.path.trim()
						? snapshot.path.trim()
						: cleanSavePath),
			imageUrl: typeof art.imageUrl === 'string' ? art.imageUrl : undefined,
			thumbnailUrl: typeof art.thumbnailUrl === 'string' ? art.thumbnailUrl : undefined,
			coverUrl: typeof art.coverUrl === 'string' ? art.coverUrl : undefined,
			image: typeof art.image === 'string' ? art.image : undefined,
		};
		upsertDownload(withArtwork);

		const resumable = buildResumableEntry(withArtwork);
		if (resumable && resumable.magnetURI && !resumable.done) {
			const existing = readResumableEntries();
			const key = resumableKey(resumable);
			const merged = key
				? [resumable, ...existing.filter((entry) => resumableKey(entry) !== key)]
				: [resumable, ...existing];
			writeResumableEntries(merged);
			writeTorrentCacheEntries(DOWNLOAD_RESUME_CACHE_KEY, merged);
		}

		return withArtwork;
	}, [upsertDownload]);

	const startFromPcGamesSlug = useCallback(async ({ slug, savePath, title } = {}) => {
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.PcGamesTorrentMagnetLink !== 'function') throw new Error('PcGamesTorrentMagnetLink API is not available');
		const cleanSlug = String(slug || '').trim();
		if (!cleanSlug) throw new Error('Game slug is required');
		setError('');
		const magnet = await api.PcGamesTorrentMagnetLink(cleanSlug);
		if (!magnet || !String(magnet).trim()) throw new Error('No magnet link found for this slug');
		return startDownload({ magnetUri: String(magnet), savePath, title });
	}, [startDownload]);

	const pauseDownload = useCallback(async (infoHash) => {
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.torrentPause !== 'function') throw new Error('torrentPause API is not available');
		await api.torrentPause(String(infoHash));
		setDownloads((prev) => prev.map((item) => (item.infoHash === infoHash ? { ...item, paused: true } : item)));
	}, []);

	const resumeDownload = useCallback(async (infoHash) => {
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.torrentResume !== 'function') throw new Error('torrentResume API is not available');
		await api.torrentResume(String(infoHash));
		setDownloads((prev) => prev.map((item) => (item.infoHash === infoHash ? { ...item, paused: false } : item)));
	}, []);

	const removeDownload = useCallback(async (infoHash, deleteFiles = true) => {
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.torrentRemove !== 'function') throw new Error('torrentRemove API is not available');
		const result = await api.torrentRemove(String(infoHash), Boolean(deleteFiles));
		setDownloads((prev) => prev.filter((item) => item.infoHash !== infoHash));
		const nextResumable = readResumableEntries().filter(
			(entry) => String(entry?.infoHash || '').trim().toLowerCase() !== String(infoHash || '').trim().toLowerCase(),
		);
		writeResumableEntries(nextResumable);
		writeTorrentCacheEntries(DOWNLOAD_RESUME_CACHE_KEY, nextResumable);

		const lockedTargets = Array.isArray(result?.lockedTargets)
			? result.lockedTargets.filter((entry) => typeof entry === 'string' && entry.trim())
			: [];
		const failedTargets = Array.isArray(result?.failedTargets)
			? result.failedTargets.filter((entry) => typeof entry === 'string' && entry.trim())
			: [];

		if (lockedTargets.length > 0 || failedTargets.length > 0) {
			const firstPath = lockedTargets[0] || failedTargets[0] || '';
			const prefix = lockedTargets.length > 0
				? 'Torrent removed, but some files are still in use and could not be deleted.'
				: 'Torrent removed, but some files could not be deleted.';
			setError(firstPath ? `${prefix} Close apps using the file, then remove leftover manually if needed. First path: ${firstPath}` : prefix);
		}
	}, []);

	const openDownload = useCallback(async (infoHash, savePath = '') => {
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.torrentOpen !== 'function') throw new Error('torrentOpen API is not available');
		return await api.torrentOpen(String(infoHash || ''), String(savePath || '').trim() || undefined);
	}, []);

	const dismissCompletedDownload = useCallback((entryOrKey) => {
		const keyCandidate = typeof entryOrKey === 'string'
			? String(entryOrKey || '').trim().toLowerCase()
			: completedEntryKey(entryOrKey);
		if (!keyCandidate) return;

		setCompletedDownloads((previous) => previous.filter((entry) => {
			const key = completedEntryKey(entry);
			if (key === keyCandidate) return false;
			if (keyCandidate.startsWith('hash:')) {
				return String(entry?.infoHash || '').trim().toLowerCase() !== keyCandidate.slice(5);
			}
			return true;
		}));
	}, []);

	const start = useCallback(async ({ magnetUri, savePath, title } = {}) => {
		return await startDownload({ magnetUri, savePath, title });
	}, [startDownload]);

	const pause = useCallback(async (infoHash) => {
		await pauseDownload(infoHash);
	}, [pauseDownload]);

	const remove = useCallback(async (infoHash, deleteFiles = true) => {
		await removeDownload(infoHash, deleteFiles);
	}, [removeDownload]);

	const value = useMemo(() => ({
		downloads,
		completedDownloads,
		busy,
		error,
		refreshStatus,
		start,
		pause,
		remove,
		startDownload,
		startFromPcGamesSlug,
		pauseDownload,
		resumeDownload,
		removeDownload,
		openDownload,
		dismissCompletedDownload,
		clearError: () => setError(''),
	}), [
		downloads,
		completedDownloads,
		busy,
		error,
		refreshStatus,
		start,
		pause,
		remove,
		startDownload,
		startFromPcGamesSlug,
		pauseDownload,
		resumeDownload,
		removeDownload,
		openDownload,
		dismissCompletedDownload,
	]);

	return <DownloadManagerContext.Provider value={value}>{children}</DownloadManagerContext.Provider>;
}

export function useDownloadManager() {
	const context = useContext(DownloadManagerContext);
	if (!context) throw new Error('useDownloadManager must be used within DownloadManagerProvider');
	return context;
}
