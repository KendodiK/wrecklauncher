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

const DownloadsPage = () => {
	const {
		downloads,
		error,
		busy,
		refreshStatus,
		pause,
		remove,
		resumeDownload,
		clearError,
	} = useDownloadManager();
	const [localError, setLocalError] = useState('');

	const sortedDownloads = useMemo(() => {
		return [...downloads].sort((a, b) => {
			if (a.done !== b.done) return a.done ? 1 : -1;
			return (b.downloaded || 0) - (a.downloaded || 0);
		});
	}, [downloads]);

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
					
					{sortedDownloads.length === 0 ? (
						<p className="text-sm text-slate-400">No downloads yet.</p>
					) : (
						<div className="space-y-3">
							{sortedDownloads.map((item) => {
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
													<p className="text-xs uppercase tracking-[0.08em] text-slate-300">{item.done ? 'Completed' : item.paused ? 'Paused' : 'Downloading'}</p>
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
												<div className="mt-3 flex flex-wrap gap-2">
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
											<button type="button" onClick={() => remove(item.infoHash, true)} className="rounded-lg border border-rose-700/70 bg-rose-900/20 px-3 py-1.5 text-xs text-rose-100 hover:bg-rose-900/40">Remove</button>
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
			</div>
		</div>
	);
};

export default DownloadsPage;

