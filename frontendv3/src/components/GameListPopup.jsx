import React, { useEffect, useMemo, useRef, useState } from 'react';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Movable + collapsible + closable popup that lists games for a launcher
const GameListPopup = ({
	open,
	title,
	games,
	initialPosition = { x: 80, y: 80 },
	onClose,
}) => {
	const [collapsed, setCollapsed] = useState(false);
	const [pos, setPos] = useState(initialPosition);
	const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startLeft: 0, startTop: 0 });

	useEffect(() => {
		if (open) {
			setPos(initialPosition);
			setCollapsed(false);
		}
	}, [open, initialPosition]);

	useEffect(() => {
		if (!open) return;

		const onMove = (e) => {
			if (!dragRef.current.dragging) return;
			const dx = e.clientX - dragRef.current.startX;
			const dy = e.clientY - dragRef.current.startY;
			const nextLeft = dragRef.current.startLeft + dx;
			const nextTop = dragRef.current.startTop + dy;

			// Keep it on-screen-ish.
			const w = window.innerWidth;
			const h = window.innerHeight;
			setPos({
				x: clamp(nextLeft, 8, Math.max(8, w - 340)),
				y: clamp(nextTop, 8, Math.max(8, h - 120)),
			});
		};

		const onUp = () => {
			dragRef.current.dragging = false;
		};

		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup', onUp);
		return () => {
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup', onUp);
		};
	}, [open]);

	const sortedGames = useMemo(() => {
		return (games ?? []).slice().sort((a, b) => `${a.title ?? ''}`.localeCompare(`${b.title ?? ''}`));
	}, [games]);

	if (!open) return null;

	return (
		<div
			style={{ left: pos.x, top: pos.y }}
			className="fixed z-50 w-[340px] rounded-xl border border-slate-700/70 bg-slate-950/80 backdrop-blur shadow-2xl"
		>
			<div
				className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/60 select-none cursor-move"
				onMouseDown={(e) => {
					// Drag only with primary mouse button
					if (e.button !== 0) return;
					dragRef.current.dragging = true;
					dragRef.current.startX = e.clientX;
					dragRef.current.startY = e.clientY;
					dragRef.current.startLeft = pos.x;
					dragRef.current.startTop = pos.y;
				}}
			>
				<div className="text-sm font-semibold text-slate-100 truncate">{title ?? 'Games'}</div>
				<div className="ml-auto flex items-center gap-1">
					<button
						type="button"
						className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded"
						onMouseDown={(e) => {
						e.stopPropagation();
						setCollapsed((v) => !v);
					}}
					>
						{collapsed ? 'Expand' : 'Collapse'}
					</button>
					<button
						type="button"
						className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded"
						onMouseDown={(e) => {
						e.stopPropagation();
						onClose?.();
					}}
					>
						Close
					</button>
				</div>
			</div>

			{!collapsed && (
				<div className="max-h-[420px] overflow-auto px-2 py-2">
					{sortedGames.length === 0 ? (
						<div className="text-sm text-slate-300 px-2 py-2">No games.</div>
					) : (
						<div className="flex flex-col">
							{sortedGames.map((g, i) => (
								<div
									key={g.id ?? `${g.title}-${i}`}
									className="flex items-center gap-2 px-2 py-2 rounded hover:bg-slate-800/50"
								>
									<div className="h-2 w-2 rounded-full bg-slate-400/70" />
									<div className="text-sm text-slate-100 truncate">{g.title ?? 'Untitled'}</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
};

export default GameListPopup;
