import React, { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';

const GamePage = () => {
	const { id } = useParams();
	const location = useLocation();

	const model = useMemo(() => {
		const fallback = {
			id: id ?? 'game-1',
			title: id ? `Game ${id}` : 'Game Title',
			heroImage: 'https://via.placeholder.com/1200x675?text=Hero+Image',
			coverImage: 'https://via.placeholder.com/600x800?text=Cover',
			description:
				'Short description goes here. This is the blue area in your diagram (game summary / details).',
			sites: [
				{ id: 'steam', label: 'Steam', href: '#' },
				{ id: 'epic', label: 'Epic Games', href: '#' },
				{ id: 'gog', label: 'GOG', href: '#' },
				{ id: 'other', label: 'Website / Other', href: '#' },
			],
			tags: ['Action', 'Indie', 'Co-op', 'Open World'],
		};

		const state = location?.state ?? {};
		return {
			...fallback,
			...(state.game ?? state ?? {}),
			sites: state.sites ?? state.launchers ?? fallback.sites,
			tags: state.tags ?? fallback.tags,
		};
	}, [id, location?.state]);

	return (
		<div className="flex-1 px-3 py-3 text-slate-100">
			<div className="mb-4">
				<h1 className="text-2xl font-semibold">{model.title}</h1>
				<div className="text-sm text-slate-400">{model.id}</div>
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

