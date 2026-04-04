import React, { useMemo, useState } from 'react';
import GameSlider from './GameSlider.jsx';
import GameListPopup from './GameListPopup.jsx';

// Stacked sliders by source (Steam/GOG/Itch/etc)
// sources: [{ id, label, games: [{id,image,title}] }]
const GameSliderStack = ({ sources, topVh = 0 }) => {
	const normalizedSources = useMemo(() => {
		return (sources ?? []).filter(Boolean).map((s, index) => ({
			id: s.id ?? `source-${index}`,
			label: s.label ?? `Source ${index + 1}`,
			games: s.games ?? [],
		}));
	}, [sources]);

	const [activeId, setActiveId] = useState(() => normalizedSources[0]?.id);
	const [collapsed, setCollapsed] = useState(() => ({}));
	const [listOpenFor, setListOpenFor] = useState(null);

	const ordered = useMemo(() => {
		if (!normalizedSources.length) return [];
		const active = normalizedSources.find((s) => s.id === activeId) ?? normalizedSources[0];
		const rest = normalizedSources.filter((s) => s.id !== active.id);
		return [active, ...rest];
	}, [normalizedSources, activeId]);

	if (!normalizedSources.length) return null;

	const toggleCollapsed = (id) => {
		setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
	};

	const setActive = (id) => {
		setActiveId(id);
		setCollapsed((prev) => ({ ...prev, [id]: false }));
	};

	const openList = (id) => setListOpenFor(id);
	const closeList = () => setListOpenFor(null);

	const listSource = useMemo(() => {
		if (!listOpenFor) return null;
		return normalizedSources.find((s) => s.id === listOpenFor) ?? null;
	}, [normalizedSources, listOpenFor]);

	return (
		<div style={topVh ? { marginTop: `${topVh}vh` } : undefined} className="w-full">
			<div className="flex flex-col gap-6">
				{ordered.map((source, idx) => {
					const isActive = idx === 0;
					const isCollapsed = !!collapsed[source.id];

					// Smaller cards overall; active row slightly larger.
					const sliderVars = isActive
						? {
							'--gs-card-width': '140px',
							'--gs-card-active-width': '200px',
							'--gs-card-gap': '22px',
							'--gs-card-active-scale': 1.08,
							'--gs-card-active-translate-y': '-14px',
						}
						: {
							'--gs-card-width': '120px',
							'--gs-card-active-width': '170px',
							'--gs-card-gap': '18px',
							'--gs-card-active-scale': 1.06,
							'--gs-card-active-translate-y': '-10px',
						};

					return (
						<div
							key={source.id}
							className={
								'rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur px-3 py-3 transition-colors ' +
								(isActive ? 'ring-1 ring-slate-500/40' : 'hover:bg-slate-900/35')
							}
							onMouseDown={() => setActive(source.id)}
						>
							<div className="flex items-center gap-3 select-none">
								<div
									className={
										'h-4 w-4 rounded-full border ' +
										(isActive ? 'bg-emerald-400 border-emerald-300' : 'border-slate-400/70')
									}
								/>
								<div className="text-sm font-semibold text-slate-100">{source.label}</div>
								<button
									type="button"
									className="text-xs text-slate-300 hover:text-white px-2 py-1 rounded"
									onMouseDown={(e) => {
										e.stopPropagation();
										openList(source.id);
									}}
								>
									List
								</button>
								<button
									type="button"
									className="ml-auto text-xs text-slate-300 hover:text-white px-2 py-1 rounded"
									onMouseDown={(e) => {
										e.stopPropagation();
										toggleCollapsed(source.id);
									}}
								>
									{isCollapsed ? 'Expand' : 'Collapse'}
								</button>
							</div>

							<div
								className={
									'mt-3 overflow-hidden transition-[max-height,opacity] duration-300 ease-out ' +
									(isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[520px] opacity-100')
								}
								style={sliderVars}
							>
								<GameSlider
									games={source.games}
									activeOffsetPx={200}
									cloneCount={5}
								/>
							</div>
						</div>
					);
				})}
			</div>

			<GameListPopup
				open={!!listSource}
				title={listSource ? `${listSource.label} games` : ''}
				games={listSource?.games ?? []}
				initialPosition={{ x: 80, y: 80 }}
				onClose={closeList}
			/>
		</div>
	);
};

export default GameSliderStack;
