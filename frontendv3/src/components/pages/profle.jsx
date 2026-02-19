import React, { useMemo } from 'react';

const ProfilePage = ({ user }) => {
	const username = user?.username ? user.username : 'Player';
	const avatarLetter = (username || 'P').charAt(0).toUpperCase();
	const bio = user?.bio ? `${user.bio}` : 'No bio yet.';

	const stats = useMemo(
		() => [
			{ id: 'games', label: 'Games', value: '—' },
			{ id: 'friends', label: 'Friends', value: '—' },
			{ id: 'hours', label: 'Playtime', value: '—' },
		],
		[]
	);

	const recentlyPlayed = useMemo(
		() =>
			[1, 2, 3].map((n) => ({
				id: `recent-${n}`,
				title: `Recently Played ${n}`,
				image: `https://via.placeholder.com/320x180?text=Game+${n}`,
				when: 'Recently',
			})),
		[]
	);

	return (
		<div className="flex-1 px-4 py-3 text-slate-100">
			<div className="flex items-start justify-between gap-3 mb-4">
				<div>
					<h1 className="text-2xl font-semibold flex items-center gap-2">
						<span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
						Profile
					</h1>
					<p className="text-xs text-slate-400 mt-0.5">
						Template profile view (public-style).
					</p>
				</div>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
				{/* Left: identity */}
				<div className="lg:col-span-1">
					<div className="bg-slate-900/80 border border-slate-700 rounded-lg shadow-lg p-5">
						<div className="flex items-center gap-3">
							<div className="w-14 h-14 rounded-full bg-slate-700 flex items-center justify-center text-lg font-semibold">
								{avatarLetter}
							</div>
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<h2 className="text-lg font-semibold truncate">{username}</h2>
									<span
										className="text-[10px] px-2 py-0.5 rounded border bg-slate-500/10 text-slate-300 border-slate-500/30"
									>
										Public
									</span>
								</div>
								<p className="text-xs text-slate-400 mt-0.5 truncate">
									This is a placeholder profile layout.
								</p>
							</div>
						</div>

						<div className="mt-4">
							<div className="text-xs font-semibold text-slate-100">Bio</div>
							<div className="mt-2 rounded border border-slate-700 bg-slate-950/30 px-3 py-2">
								<p className="text-sm text-slate-200/90 whitespace-pre-wrap">{bio}</p>
							</div>
						</div>

						<div className="mt-4 grid grid-cols-3 gap-2">
							{stats.map((s) => (
								<div
									key={s.id}
									className="rounded border border-slate-700 bg-slate-950/30 px-3 py-2"
								>
									<div className="text-xs text-slate-400">{s.label}</div>
									<div className="text-lg font-semibold leading-tight">{s.value}</div>
								</div>
							))}
						</div>

					</div>
				</div>

				{/* Right: details */}
				<div className="lg:col-span-2 space-y-4">
					<div className="bg-slate-900/80 border border-slate-700 rounded-lg shadow-lg p-5">
						<h3 className="text-sm font-semibold">Recently Played</h3>
						<div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
							{recentlyPlayed.map((g) => (
								<div
									key={g.id}
									className="rounded-lg border border-slate-700/60 bg-slate-950/20 overflow-hidden"
								>
									<div className="aspect-[16/9] bg-slate-900">
										<img
											src={g.image}
											alt={g.title}
											className="w-full h-full object-cover"
										/>
									</div>
									<div className="p-3">
										<div className="text-sm font-semibold text-slate-100 truncate">{g.title}</div>
										<div className="mt-1 text-xs text-slate-400">{g.when}</div>
									</div>
								</div>
							))}
						</div>
						<p className="mt-3 text-xs text-slate-400">
							Hook this up to real play history later.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ProfilePage;

