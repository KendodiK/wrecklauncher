import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const DownloadManagerContext = createContext(null);

function normalizeProgress(progress) {
	if (!progress || typeof progress !== 'object') return null;
	const infoHash = String(progress.infoHash || '').trim();
	if (!infoHash) return null;
	const normalized = {
		infoHash,
		name: String(progress.name || infoHash),
		progress: typeof progress.progress === 'number' ? progress.progress : 0,
		downloadSpeed: typeof progress.downloadSpeed === 'number' ? progress.downloadSpeed : 0,
		uploadSpeed: typeof progress.uploadSpeed === 'number' ? progress.uploadSpeed : 0,
		downloaded: typeof progress.downloaded === 'number' ? progress.downloaded : 0,
		length: typeof progress.length === 'number' ? progress.length : 0,
		numPeers: typeof progress.numPeers === 'number' ? progress.numPeers : 0,
		timeRemaining: typeof progress.timeRemaining === 'number' ? progress.timeRemaining : -1,
		paused: Boolean(progress.paused),
		done: Boolean(progress.done),
		magnetURI: typeof progress.magnetURI === 'string' ? progress.magnetURI : '',
		savePath: typeof progress.savePath === 'string' ? progress.savePath : '',
	};

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

export function DownloadManagerProvider({ children }) {
	const [downloads, setDownloads] = useState([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const upsertDownload = useCallback((entry) => {
		const normalized = normalizeProgress(entry);
		if (!normalized) return;
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
			setDownloads(normalized);
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		} finally {
			setBusy(false);
		}
	}, []);

	useEffect(() => {
		let unsub = null;
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api) return;

		refreshStatus();
		if (typeof api.onTorrentProgress === 'function') {
			unsub = api.onTorrentProgress((progress) => {
				upsertDownload(progress);
			});
		}

		return () => {
			if (typeof unsub === 'function') unsub();
		};
	}, [refreshStatus, upsertDownload]);

	const startDownload = useCallback(async ({ magnetUri, savePath, artwork } = {}) => {
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.torrentStart !== 'function') throw new Error('torrentStart API is not available');
		if (!magnetUri || !String(magnetUri).trim()) throw new Error('Magnet URI is required');
		setError('');
		const snapshot = await api.torrentStart(String(magnetUri).trim(), String(savePath || '').trim() || undefined);
		const art = artwork && typeof artwork === 'object' ? artwork : {};
		const withArtwork = {
			...snapshot,
			imageUrl: typeof art.imageUrl === 'string' ? art.imageUrl : undefined,
			thumbnailUrl: typeof art.thumbnailUrl === 'string' ? art.thumbnailUrl : undefined,
			coverUrl: typeof art.coverUrl === 'string' ? art.coverUrl : undefined,
			image: typeof art.image === 'string' ? art.image : undefined,
		};
		upsertDownload(withArtwork);
		return withArtwork;
	}, [upsertDownload]);

	const startFromPcGamesSlug = useCallback(async ({ slug, savePath } = {}) => {
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.PcGamesTorrentMagnetLink !== 'function') throw new Error('PcGamesTorrentMagnetLink API is not available');
		const cleanSlug = String(slug || '').trim();
		if (!cleanSlug) throw new Error('Game slug is required');
		setError('');
		const magnet = await api.PcGamesTorrentMagnetLink(cleanSlug);
		if (!magnet || !String(magnet).trim()) throw new Error('No magnet link found for this slug');
		return startDownload({ magnetUri: String(magnet), savePath });
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

	const removeDownload = useCallback(async (infoHash, deleteFiles = false) => {
		const api = typeof window !== 'undefined' ? window.electronAPI : null;
		if (!api || typeof api.torrentRemove !== 'function') throw new Error('torrentRemove API is not available');
		await api.torrentRemove(String(infoHash), Boolean(deleteFiles));
		setDownloads((prev) => prev.filter((item) => item.infoHash !== infoHash));
	}, []);

	const start = useCallback(async ({ magnetUri, savePath } = {}) => {
		return await startDownload({ magnetUri, savePath });
	}, [startDownload]);

	const pause = useCallback(async (infoHash) => {
		await pauseDownload(infoHash);
	}, [pauseDownload]);

	const remove = useCallback(async (infoHash, deleteFiles = false) => {
		await removeDownload(infoHash, deleteFiles);
	}, [removeDownload]);

	const value = useMemo(() => ({
		downloads,
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
		clearError: () => setError(''),
	}), [
		downloads,
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
	]);

	return <DownloadManagerContext.Provider value={value}>{children}</DownloadManagerContext.Provider>;
}

export function useDownloadManager() {
	const context = useContext(DownloadManagerContext);
	if (!context) throw new Error('useDownloadManager must be used within DownloadManagerProvider');
	return context;
}
