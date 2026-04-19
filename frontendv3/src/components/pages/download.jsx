import React, { useMemo, useState } from 'react';
import { useDownloadManager } from '../../context/DownloadManagerContext.jsx';

function formatBytes(bytes) {
	if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let index = 0;
	while (value >= 1024 && index < units.length - 1) {
		value /= 1024;
		index += 1;
	}
	return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatSeconds(ms) {
	if (!Number.isFinite(ms) || ms < 0) return '∞';
	const totalSeconds = Math.ceil(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes <= 0) return `${seconds}s`;
	return `${minutes}m ${seconds}s`;
}

function formatDateTime(value) {
	const timestamp = Number(value);
	if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Unknown';
	try {
		return new Date(timestamp).toLocaleString();
	} catch {
		return 'Unknown';
	}
}

const DownloadsPage = () => {
	const {
		downloads,
		completedDownloads,
		error,
		busy,
		refreshStatus,
		pause,
		remove,
		resumeDownload,
		openDownload,
		dismissCompletedDownload,
		clearError,
	} = useDownloadManager();
	const [localError, setLocalError] = useState('');

	const activeDownloads = useMemo(() => {
		return [...downloads].sort((a, b) => {
			if (a.paused !== b.paused) return a.paused ? 1 : -1;
			return (b.downloaded || 0) - (a.downloaded || 0);
		});
	}, [downloads]);

	const completedHistory = useMemo(() => {
		return [...(Array.isArray(completedDownloads) ? completedDownloads : [])].sort(
			(a, b) => (Number(b?.completedAt) || 0) - (Number(a?.completedAt) || 0),
		);
	}, [completedDownloads]);

	return (
		<div className="flex-1 overflow-y-auto px-4 py-4 text-slate-100 md:px-6">
			<div className="mx-auto max-w-6xl space-y-4">
				<div >
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div>
							
							
						</div>
						<button
							type="button"
							onClick={refreshStatus}
							disabled={busy}
							className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-600 bg-slate-800/70 text-slate-100 hover:bg-slate-700/70 disabled:opacity-60"
							title="Refresh downloads"
							aria-label="Refresh downloads"
						>
							<svg viewBox="0 0 24 24" className={`h-5 w-5 ${busy ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
								<path d="M21 12a9 9 0 1 1-2.64-6.36" />
								<polyline points="21 3 21 9 15 9" />
							</svg>
						</button>
					</div>
				</div>

				{(error || localError) ? (
					<div className="rounded-xl border border-rose-500/40 bg-rose-900/20 px-4 py-3 text-sm text-rose-200">
						<div>{localError || error}</div>
						<button type="button" onClick={() => { setLocalError(''); clearError(); }} className="mt-2 text-xs uppercase tracking-[0.1em] text-rose-100 underline">Clear</button>
					</div>
				) : null}

				<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4">
					<h2 className="text-base font-semibold text-slate-100">Active Downloads</h2>

					{activeDownloads.length === 0 ? (
						<p className="mt-3 text-sm text-slate-400">No active downloads.</p>
					) : (
						<div className="mt-3 space-y-3">
							{activeDownloads.map((item) => {
								const percent = Math.max(0, Math.min(100, Math.round((item.progress || 0) * 10000) / 100));
								const canToggle = !item.done;
								const imageSrc = item.thumbnailUrl || item.coverUrl || item.imageUrl || item.image || '';
								return (
									<div key={item.infoHash} className="rounded-xl border border-slate-700/70 bg-slate-950/50 p-3">
										<div className="flex gap-3">
											<div className="h-28 w-20 flex-shrink-0 overflow-hidden rounded-lg border border-slate-700/80 bg-slate-900/80 md:h-40 md:w-28">
												{imageSrc ? (
													<img src={imageSrc} alt={item.name} className="h-full w-full object-cover" />
												) : (
													<div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-300">
														{String(item.name || '?').trim().charAt(0).toUpperCase() || '?'}
													</div>
												)}
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex flex-wrap items-center justify-between gap-2">
													<p className="text-sm font-semibold text-slate-100">{item.name}</p>
													<p className="text-xs uppercase tracking-[0.08em] text-slate-300">{item.paused ? 'Paused' : 'Downloading'}</p>
												</div>
												<div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800">
													<div className="h-full bg-sky-500" style={{ width: `${percent}%` }} />
												</div>
												<div className="mt-2 grid gap-1 text-xs text-slate-300 md:grid-cols-2">
													<span>Progress: {percent}%</span>
													<span>Peers: {item.numPeers}</span>
													<span>Downloaded: {formatBytes(item.downloaded)} / {formatBytes(item.length)}</span>
													<span>Down: {formatBytes(item.downloadSpeed)}/s</span>
													<span>Up: {formatBytes(item.uploadSpeed)}/s</span>
													<span>ETA: {formatSeconds(item.timeRemaining)}</span>
												</div>
												<div className="mt-3 flex flex-wrap items-center gap-2">
													<button
														type="button"
														disabled={!canToggle}
														onClick={() => (item.paused ? resumeDownload(item.infoHash) : pause(item.infoHash))}
														className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-600 bg-slate-800/80 text-slate-100 hover:bg-slate-700/80 disabled:opacity-50"
														title={item.paused ? 'Resume' : 'Pause'}
														aria-label={item.paused ? 'Resume' : 'Pause'}
													>
														{item.paused ? (
															<svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
																<path d="M8 5v14l11-7-11-7z" />
															</svg>
														) : (
															<svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
																<path d="M6 5h4v14H6zm8 0h4v14h-4z" />
															</svg>
														)}
													</button>
													<button
														type="button"
														onClick={async () => {
															setLocalError('');
															try {
																await remove(item.infoHash, true);
															} catch (e) {
																setLocalError(e instanceof Error ? e.message : String(e));
															}
														}}
														className="ml-auto rounded-lg border border-rose-700/70 bg-rose-900/20 px-3 py-1.5 text-xs text-rose-100 hover:bg-rose-900/40"
													>
														Remove
													</button>
												</div>
												<details className="mt-2 rounded-lg border border-slate-700/70 bg-slate-900/40 px-2 py-1.5 text-xs text-slate-300">
													<summary className="cursor-pointer list-none text-[11px] uppercase tracking-[0.1em] text-slate-400">Advanced</summary>
													<div className="mt-2 grid gap-1 md:grid-cols-2">
														<span>Info Hash: {item.infoHash}</span>
														<span>Save Path: {item.savePath || 'Default Downloads'}</span>
														<span>Magnet: {item.magnetURI ? 'Available' : 'N/A'}</span>
														<span>Status: {item.done ? 'Done' : item.paused ? 'Paused' : 'Active'}</span>
														<span>Downloaded Bytes: {item.downloaded}</span>
														<span>Total Bytes: {item.length}</span>
													</div>
												</details>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>

				<div className="rounded-2xl border border-slate-700/60 bg-slate-900/45 p-4">
					<h2 className="text-base font-semibold text-slate-100">Completed Downloads</h2>
					{completedHistory.length === 0 ? (
						<p className="mt-3 text-sm text-slate-400">Completed downloads will appear here and stay after restart.</p>
					) : (
						<div className="mt-3 space-y-3">
							{completedHistory.map((item) => {
								const imageSrc = item.thumbnailUrl || item.coverUrl || item.imageUrl || item.image || '';
								const openDisabled = !String(item.savePath || item.path || '').trim() && !String(item.infoHash || '').trim();
								return (
									<div key={`${item.infoHash || 'done'}-${item.completedAt || 0}`} className="rounded-xl border border-emerald-700/40 bg-emerald-950/10 p-3">
										<div className="flex gap-3">
											<div className="h-20 w-16 flex-shrink-0 overflow-hidden rounded-lg border border-slate-700/80 bg-slate-900/80 md:h-28 md:w-20">
												{imageSrc ? (
													<img src={imageSrc} alt={item.name} className="h-full w-full object-cover" />
												) : (
													<div className="flex h-full w-full items-center justify-center text-sm font-semibold text-slate-300">
														{String(item.name || '?').trim().charAt(0).toUpperCase() || '?'}
													</div>
												)}
											</div>
											<div className="min-w-0 flex-1">
												<div className="flex flex-wrap items-center justify-between gap-2">
													<p className="text-sm font-semibold text-slate-100">{item.name}</p>
													<p className="text-xs uppercase tracking-[0.08em] text-emerald-300">Completed</p>
												</div>
												<div className="mt-2 grid gap-1 text-xs text-slate-300 md:grid-cols-2">
													<span>Size: {formatBytes(item.length || item.downloaded)}</span>
													<span>Completed: {formatDateTime(item.completedAt)}</span>
													<span className="md:col-span-2">Path: {item.savePath || item.path || 'Unknown'}</span>
												</div>
												<div className="mt-3 flex flex-wrap items-center gap-2">
													<button
														type="button"
														disabled={openDisabled}
														onClick={async () => {
															setLocalError('');
															try {
																await openDownload(item.infoHash || '', item.savePath || item.path || '');
															} catch (e) {
																setLocalError(e instanceof Error ? e.message : String(e));
															}
														}}
														className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/70 bg-emerald-900/30 text-emerald-100 hover:bg-emerald-800/45 disabled:opacity-50"
														title="Open download folder"
														aria-label="Open download folder"
													>
														<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
															<path strokeLinecap="round" strokeLinejoin="round" d="M3 7h5l2 2h11v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
														</svg>
													</button>
													<button
														type="button"
														onClick={() => dismissCompletedDownload(item)}
														className="ml-auto rounded-lg border border-slate-600/70 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-100 hover:bg-slate-800/60"
													>
														Remove From History
													</button>
												</div>
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default DownloadsPage;

