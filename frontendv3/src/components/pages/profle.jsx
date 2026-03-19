import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

const MOCK_FRIENDS = [
	{
		id: 'f-1',
		name: 'Alex',
		avatarUrl: 'https://i.pravatar.cc/160?img=12',
		status: 'online',
		bio: 'Likes co-op games and speedruns.',
		friendship: 'friend',
	},
	{
		id: 'f-2',
		name: 'Bence',
		avatarUrl: 'https://i.pravatar.cc/160?img=22',
		status: 'away',
		bio: 'Mostly RPGs. Sometimes AFK.',
		friendship: 'friend',
	},
	{
		id: 'f-3',
		name: 'Dóra',
		avatarUrl: 'https://i.pravatar.cc/160?img=35',
		status: 'offline',
		bio: 'Indie enjoyer. Achievement hunter.',
		friendship: 'not_friends',
	},
];

const MOCK_RECENTLY_PLAYED = [
	{ id: 'rp-1', title: 'Helldivers 2', when: 'Launched 2h ago', image: 'https://picsum.photos/seed/hl2/720/400' },
	{ id: 'rp-2', title: 'Balatro', when: 'Launched yesterday', image: 'https://picsum.photos/seed/balatro/720/400' },
	{ id: 'rp-3', title: 'Dead Cells', when: 'Launched 3 days ago', image: 'https://picsum.photos/seed/deadcells/720/400' },
];

const MOCK_MUTUAL_GAMES = [
	{ id: 'mg-1', title: 'Terraria', platform: 'Steam' },
	{ id: 'mg-2', title: 'Hades', platform: 'Steam' },
	{ id: 'mg-3', title: 'Stardew Valley', platform: 'GOG' },
];

const statusDot = (status) => {
	if (status === 'online') return 'bg-emerald-400';
	if (status === 'away') return 'bg-amber-400';
	return 'bg-slate-500';
};

const ProfilePage = ({ user }) => {
	const navigate = useNavigate();
	const location = useLocation();
	const { userId } = useParams();
	const [settingsProfile, setSettingsProfile] = useState({ bio: '', avatarUrl: '' });
	const [friendshipState, setFriendshipState] = useState('not_friends');

	useEffect(() => {
		let cancelled = false;
		const loadSettingsProfile = async () => {
			if (!window?.electronAPI?.getSettings) return;
			try {
				const settings = await window.electronAPI.getSettings();
				const profile = settings?.account?.profile || {};
				if (!cancelled) {
					setSettingsProfile({
						bio: typeof profile.bio === 'string' ? profile.bio : '',
						avatarUrl: typeof profile.avatarUrl === 'string' ? profile.avatarUrl : '',
					});
				}
			} catch {
				if (!cancelled) {
					setSettingsProfile({ bio: '', avatarUrl: '' });
				}
			}
		};
		loadSettingsProfile();
		return () => {
			cancelled = true;
		};
	}, []);

	const locationProfile = location?.state?.profile || null;
	const fallbackViewedProfile = useMemo(() => {
		if (!userId) return null;
		return MOCK_FRIENDS.find((friend) => friend.id === userId) || {
			id: userId,
			name: userId,
			avatarUrl: '',
			status: 'offline',
			bio: 'No bio yet.',
			friendship: 'not_friends',
		};
	}, [userId]);

	const isOwnProfile = !userId;
	const viewedProfile = isOwnProfile ? null : (locationProfile || fallbackViewedProfile);

	useEffect(() => {
		if (isOwnProfile) return;
		setFriendshipState(viewedProfile?.friendship || 'not_friends');
	}, [isOwnProfile, viewedProfile]);

	const username = isOwnProfile
		? (user?.username || 'Player')
		: (viewedProfile?.name || 'Player');
	const avatarUrl = isOwnProfile
		? (settingsProfile.avatarUrl || user?.avatarUrl || '')
		: (viewedProfile?.avatarUrl || '');
	const bio = isOwnProfile
		? (settingsProfile.bio || user?.bio || 'No bio yet.')
		: (viewedProfile?.bio || 'No bio yet.');
	const avatarLetter = (username || 'P').charAt(0).toUpperCase();

	const openFriendProfile = (friend) => {
		navigate(`/profile/${friend.id}`, {
			state: {
				profile: friend,
				viewerUsername: user?.username || 'Player',
			},
		});
	};

	const openFriendChat = (friend) => {
		navigate('/friends', {
			state: {
				selectedFriendId: friend.id,
			},
		});
	};

	const relationshipLabel = useMemo(() => {
		if (friendshipState === 'friend') return 'You are friends';
		if (friendshipState === 'pending') return 'Friend request sent';
		return 'You are not friends';
	}, [friendshipState]);

	return (
		<div className="flex-1 px-4 py-3 text-slate-100 overflow-y-auto">
			<div className="max-w-[1300px] mx-auto">
				<div className="mb-4 border border-slate-700 rounded-lg bg-slate-900/70 p-4">
					<div className="flex items-start gap-4">
						<div className="w-28 h-28 rounded-md border-2 border-slate-600 bg-slate-800 overflow-hidden shrink-0">
							{avatarUrl ? (
								<img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
							) : (
								<div className="w-full h-full grid place-items-center text-3xl font-semibold">{avatarLetter}</div>
							)}
						</div>
						<div className="min-w-0 flex-1">
							<h1 className="text-2xl font-semibold truncate">{username}</h1>
							<div className="mt-3 rounded border border-slate-700 bg-slate-950/30 px-3 py-2 min-h-[64px]">
								<p className="text-sm text-slate-200/90 whitespace-pre-wrap">{bio}</p>
							</div>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_260px] gap-4">
					<div className="border border-slate-700 rounded-lg bg-slate-900/70 p-3 min-h-[420px]">
						{isOwnProfile ? (
							<>
								<div className="text-sm font-semibold">Friends</div>
								<div className="mt-3 flex flex-col gap-2">
									{MOCK_FRIENDS.map((friend) => (
										<div
											key={friend.id}
											className="rounded-lg border border-slate-700/60 bg-slate-950/20 px-3 py-2"
										>
											<div className="flex items-center gap-2">
												<button
													type="button"
													onClick={() => openFriendProfile(friend)}
													className="flex min-w-0 items-center gap-2 text-left flex-1"
												>
													<div className="relative shrink-0">
														{friend.avatarUrl ? (
															<img
																src={friend.avatarUrl}
																alt={friend.name}
																className="h-8 w-8 rounded-full border border-slate-600/60 object-cover"
															/>
														) : (
															<div className="h-8 w-8 rounded-full bg-slate-700/70 border border-slate-600/60 grid place-items-center text-[11px] font-semibold">
																{`${friend.name}`.slice(0, 2).toUpperCase()}
															</div>
														)}
														<div className={
															'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-slate-900 ' +
															statusDot(friend.status)
														} />
													</div>
													<div className="min-w-0">
														<div className="text-sm font-medium truncate">{friend.name}</div>
														<div className="text-[11px] text-slate-400 capitalize">{friend.status}</div>
													</div>
												</button>
												<button
													type="button"
													onClick={() => openFriendChat(friend)}
													className="h-7 px-2 rounded border border-slate-700/60 bg-slate-900/30 hover:bg-slate-900/50 text-xs"
													title="Message"
												>
													MSG
												</button>
											</div>
										</div>
									))}
								</div>
							</>
						) : (
							<>
								<div className="text-sm font-semibold">Friend status</div>
								<div className="mt-3 rounded border border-slate-700 bg-slate-950/30 px-3 py-2 text-sm text-slate-200">
									{relationshipLabel}
								</div>
								<div className="mt-3">
									{friendshipState === 'friend' ? (
										<button
											type="button"
											onClick={() => openFriendChat(viewedProfile)}
											className="w-full h-9 rounded-lg border border-slate-700/60 bg-slate-900/25 hover:bg-slate-900/40 text-sm"
										>
											Message
										</button>
									) : (
										<button
											type="button"
											onClick={() => setFriendshipState('pending')}
											disabled={friendshipState === 'pending'}
											className="w-full h-9 rounded-lg border border-slate-700/60 bg-slate-900/25 hover:bg-slate-900/40 text-sm disabled:opacity-60"
										>
											{friendshipState === 'pending' ? 'Request sent' : 'Send friend request'}
										</button>
									)}
								</div>
							</>
						)}
					</div>

					<div className="border border-slate-700 rounded-lg bg-slate-900/70 p-3 min-h-[420px]">
						<div className="text-sm font-semibold">Recently played</div>
						<div className="mt-3 flex flex-col gap-3">
							{MOCK_RECENTLY_PLAYED.map((game) => (
								<div key={game.id} className="rounded-lg border border-slate-700/60 bg-slate-950/20 overflow-hidden">
									<div className="aspect-[21/7] bg-slate-900">
										<img src={game.image} alt={game.title} className="w-full h-full object-cover" />
									</div>
									<div className="px-3 py-2">
										<div className="text-sm font-medium truncate">{game.title}</div>
										<div className="text-xs text-slate-400 mt-0.5">{game.when}</div>
									</div>
								</div>
							))}
						</div>
					</div>

					<div className="border border-slate-700 rounded-lg bg-slate-900/70 p-3 min-h-[420px]">
						<div className="text-sm font-semibold">
							{isOwnProfile ? 'Games both owned' : `Games both owned with ${username}`}
						</div>
						<div className="mt-3 flex flex-col gap-2">
							{MOCK_MUTUAL_GAMES.map((game) => (
								<div
									key={game.id}
									className="rounded-lg border border-slate-700/60 bg-slate-950/20 px-3 py-2"
								>
									<div className="text-sm font-medium truncate">{game.title}</div>
									<div className="text-xs text-slate-400">{game.platform}</div>
								</div>
							))}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

export default ProfilePage;

