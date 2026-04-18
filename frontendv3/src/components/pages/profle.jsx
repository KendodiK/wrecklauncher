import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

const statusDot = (status) => {
	if (status === 'online') return 'bg-emerald-400';
	if (status === 'away') return 'bg-amber-400';
	return 'bg-slate-500';
};

function normalizeNativeUser(raw, fallbackId = null) {
	if (!raw || typeof raw !== 'object') {
		if (!fallbackId) return null;
		const fallbackText = String(fallbackId);
		return {
			id: fallbackText,
			name: fallbackText,
			bio: '',
			avatarUrl: '',
		};
	}

	const id = raw.id ?? fallbackId ?? null;
	const fallbackText = String(id ?? '').trim();
	const name = String((raw.name ?? raw.username ?? fallbackText) || 'Player').trim() || 'Player';
	const avatarCandidate = raw.avatarUrl ?? raw.avatar_url ?? raw.avatarURL ?? raw.pfp ?? '';
	return {
		id,
		name,
		bio: String(raw.bio ?? '').trim(),
		avatarUrl: typeof avatarCandidate === 'string' ? avatarCandidate.trim() : '',
	};
}

function normalizeFriendEntry(entry) {
	if (!entry || typeof entry !== 'object') return null;

	const rawId = entry.userId ?? entry.user_id ?? entry.id ?? null;
	const id = String(rawId ?? '').trim();
	if (!id) return null;

	const name = String(entry.username ?? entry.name ?? `User ${id}`).trim() || `User ${id}`;
	const avatarCandidate = entry.avatarUrl ?? entry.avatar_url ?? entry.avatarURL ?? entry.pfp ?? '';
	return {
		id,
		name,
		avatarUrl: typeof avatarCandidate === 'string' ? avatarCandidate.trim() : '',
		bio: String(entry.bio ?? '').trim(),
		status: 'offline',
	};
}

function normalizeOwnedSteamGame(raw) {
	if (!raw || typeof raw !== 'object') return null;
	const appIdValue = raw.appid ?? raw.app_id ?? raw.appId ?? null;
	const appId = Number(appIdValue);
	if (!Number.isFinite(appId) || appId <= 0) return null;

	const title = String(raw.name ?? raw.title ?? `App ${appId}`).trim() || `App ${appId}`;
	const playtimeMinutes = Number(raw.playtime_forever ?? raw.playtimeForever ?? 0);
	return {
		appId,
		title,
		playtimeHours: Number.isFinite(playtimeMinutes) && playtimeMinutes > 0
			? Math.round((playtimeMinutes / 60) * 10) / 10
			: 0,
	};
}

function extractGames(payload) {
	if (Array.isArray(payload)) return payload;
	if (Array.isArray(payload?.ownedGames)) return payload.ownedGames;
	if (Array.isArray(payload?.response?.games)) return payload.response.games;
	if (Array.isArray(payload?.data)) return payload.data;
	return [];
}

const ProfilePage = ({ user }) => {
	const navigate = useNavigate();
	const location = useLocation();
	const { userId: routeUserIdParam } = useParams();

	const viewerUserId = String(user?.id ?? '').trim();
	const routeUserId = String(routeUserIdParam ?? '').trim();
	const isOwnProfile = !routeUserId || (viewerUserId && routeUserId === viewerUserId);
	const targetUserId = isOwnProfile ? viewerUserId : routeUserId;

	const [settingsProfile, setSettingsProfile] = useState({ bio: '', avatarUrl: '' });
	const [remoteViewedProfile, setRemoteViewedProfile] = useState(null);

	const [friends, setFriends] = useState([]);
	const [friendsLoading, setFriendsLoading] = useState(true);
	const [friendsError, setFriendsError] = useState('');

	const [visitorGames, setVisitorGames] = useState([]);
	const [profileGames, setProfileGames] = useState([]);
	const [gamesLoading, setGamesLoading] = useState(true);
	const [gamesError, setGamesError] = useState('');

	const locationProfile = useMemo(() => normalizeNativeUser(location?.state?.profile || null, targetUserId || null), [location?.state?.profile, targetUserId]);

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

	useEffect(() => {
		let cancelled = false;

		if (isOwnProfile) {
			setRemoteViewedProfile(null);
			return () => {
				cancelled = true;
			};
		}

		const fetchRemoteProfile = async () => {
			if (!targetUserId || typeof window?.electronAPI?.getNativeUserById !== 'function') {
				if (!cancelled) setRemoteViewedProfile(locationProfile);
				return;
			}

			try {
				const payload = await window.electronAPI.getNativeUserById(targetUserId);
				if (cancelled) return;
				setRemoteViewedProfile(normalizeNativeUser(payload, targetUserId));
			} catch {
				if (!cancelled) {
					setRemoteViewedProfile(locationProfile);
				}
			}
		};

		void fetchRemoteProfile();
		return () => {
			cancelled = true;
		};
	}, [isOwnProfile, targetUserId, locationProfile]);

	const displayedProfile = useMemo(() => {
		if (isOwnProfile) {
			return {
				id: viewerUserId || user?.id || null,
				name: user?.username || 'Player',
				bio: settingsProfile.bio || user?.bio || '',
				avatarUrl: settingsProfile.avatarUrl || user?.avatarUrl || '',
			};
		}

		return (
			remoteViewedProfile
			|| locationProfile
			|| {
				id: targetUserId,
				name: targetUserId || 'Player',
				bio: '',
				avatarUrl: '',
			}
		);
	}, [isOwnProfile, viewerUserId, user?.id, user?.username, user?.bio, user?.avatarUrl, settingsProfile.bio, settingsProfile.avatarUrl, remoteViewedProfile, locationProfile, targetUserId]);

	useEffect(() => {
		let cancelled = false;

		const loadFriends = async () => {
			const profileOwnerId = String(displayedProfile?.id ?? targetUserId ?? '').trim();
			if (!profileOwnerId) {
				setFriends([]);
				setFriendsLoading(false);
				return;
			}

			setFriendsLoading(true);
			setFriendsError('');

			try {
				if (typeof window?.electronAPI?.getMyFriends !== 'function') {
					throw new Error('Friends API is not available in this build');
				}

				const payload = await window.electronAPI.getMyFriends(profileOwnerId);
				if (cancelled) return;

				const rows = Array.isArray(payload)
					? payload
					: (Array.isArray(payload?.items) ? payload.items : (Array.isArray(payload?.data) ? payload.data : []));

				setFriends(rows.map((row) => normalizeFriendEntry(row)).filter(Boolean));
			} catch (error) {
				if (cancelled) return;
				setFriends([]);
				setFriendsError(error instanceof Error ? error.message : 'Failed to load friends');
			} finally {
				if (!cancelled) {
					setFriendsLoading(false);
				}
			}
		};

		void loadFriends();
		return () => {
			cancelled = true;
		};
	}, [displayedProfile?.id, targetUserId]);

	useEffect(() => {
		let cancelled = false;

		const loadOwnedGames = async () => {
			const profileOwnerId = String(displayedProfile?.id ?? targetUserId ?? '').trim();
			if (!viewerUserId || !profileOwnerId) {
				setVisitorGames([]);
				setProfileGames([]);
				setGamesLoading(false);
				return;
			}

			setGamesLoading(true);
			setGamesError('');

			const loadByNativeUserId = async (nativeUserId, allowSelfFallback = false) => {
				if (typeof window?.electronAPI?.getOwnedGamesFromSteamByNativeUserId === 'function') {
					const payload = await window.electronAPI.getOwnedGamesFromSteamByNativeUserId(nativeUserId);
					return extractGames(payload).map((row) => normalizeOwnedSteamGame(row)).filter(Boolean);
				}

				if (allowSelfFallback && typeof window?.electronAPI?.getOwnedGamesFromSteam === 'function') {
					const payload = await window.electronAPI.getOwnedGamesFromSteam();
					return extractGames(payload).map((row) => normalizeOwnedSteamGame(row)).filter(Boolean);
				}

				return [];
			};

			try {
				if (viewerUserId === profileOwnerId) {
					const owned = await loadByNativeUserId(viewerUserId, true);
					if (cancelled) return;
					setVisitorGames(owned);
					setProfileGames(owned);
				} else {
					const [visitorOwned, profileOwned] = await Promise.all([
						loadByNativeUserId(viewerUserId, true),
						loadByNativeUserId(profileOwnerId, false),
					]);

					if (cancelled) return;
					setVisitorGames(visitorOwned);
					setProfileGames(profileOwned);
				}
			} catch (error) {
				if (cancelled) return;
				setVisitorGames([]);
				setProfileGames([]);
				setGamesError(error instanceof Error ? error.message : 'Failed to load owned games');
			} finally {
				if (!cancelled) {
					setGamesLoading(false);
				}
			}
		};

		void loadOwnedGames();
		return () => {
			cancelled = true;
		};
	}, [displayedProfile?.id, targetUserId, viewerUserId]);

	const commonGames = useMemo(() => {
		if (isOwnProfile) {
			return profileGames;
		}

		const visitorByAppId = new Map(visitorGames.map((game) => [game.appId, game]));
		return profileGames
			.filter((game) => visitorByAppId.has(game.appId))
			.map((game) => ({
				...game,
				visitorPlaytimeHours: visitorByAppId.get(game.appId)?.playtimeHours ?? 0,
			}));
	}, [isOwnProfile, visitorGames, profileGames]);

	const profileGameCount = profileGames.length;
	const commonGameCount = commonGames.length;

	const openFriendProfile = (friend) => {
		navigate(`/profile/${friend.id}`, {
			state: {
				profile: {
					id: friend.id,
					name: friend.name,
					bio: friend.bio,
					avatarUrl: friend.avatarUrl,
					pfp: friend.avatarUrl,
				},
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

	const avatarUrl = String(displayedProfile?.avatarUrl || '').trim();
	const username = String(displayedProfile?.name || 'Player').trim() || 'Player';
	const bio = String(displayedProfile?.bio || '').trim();
	const avatarLetter = username.charAt(0).toUpperCase();

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
								<p className="text-sm text-slate-200/90 whitespace-pre-wrap">{bio || 'No bio yet.'}</p>
							</div>
						</div>
					</div>
				</div>

				<div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-4">
					<div className="border border-slate-700 rounded-lg bg-slate-900/70 p-3 min-h-[420px]">
						<div className="text-sm font-semibold">Friends</div>
						<div className="mt-3 flex flex-col gap-2">
							{friendsLoading ? (
								<div className="text-sm text-slate-300 px-2 py-2">Loading friends...</div>
							) : friends.length < 1 ? (
								<div className="text-sm text-slate-300 px-2 py-2">No friends found.</div>
							) : (
								friends.map((friend) => (
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
												onClick={() => openFriendProfile(friend)}
												className="h-7 px-2 rounded border border-slate-700/60 bg-slate-900/30 hover:bg-slate-900/50 text-xs"
												title="View profile"
											>
												Profile
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
								))
							)}
						</div>
						{friendsError ? (
							<div className="mt-3 rounded border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
								{friendsError}
							</div>
						) : null}
					</div>

					<div className="border border-slate-700 rounded-lg bg-slate-900/70 p-3 min-h-[420px]">
						<div className="text-sm font-semibold">
							{isOwnProfile ? 'Your games' : `Common games with ${username}`}
						</div>

						<div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
							<div className="rounded border border-slate-700/60 bg-slate-950/20 px-3 py-2">
								<div className="text-[11px] uppercase tracking-wide text-slate-400">Game count</div>
								<div className="text-base font-semibold text-slate-100">{profileGameCount}</div>
							</div>
							<div className="rounded border border-slate-700/60 bg-slate-950/20 px-3 py-2">
								<div className="text-[11px] uppercase tracking-wide text-slate-400">Your games</div>
								<div className="text-base font-semibold text-slate-100">{visitorGames.length}</div>
							</div>
							<div className="rounded border border-slate-700/60 bg-slate-950/20 px-3 py-2">
								<div className="text-[11px] uppercase tracking-wide text-slate-400">Common count</div>
								<div className="text-base font-semibold text-slate-100">{commonGameCount}</div>
							</div>
						</div>

						<div className="mt-3 flex flex-col gap-2">
							{gamesLoading ? (
								<div className="text-sm text-slate-300 px-2 py-2">Loading games...</div>
							) : commonGames.length < 1 ? (
								<div className="text-sm text-slate-300 px-2 py-2">
									{isOwnProfile ? 'No owned games found yet.' : 'No common games found between the visitor and this user.'}
								</div>
							) : (
								commonGames.map((game) => (
									<div key={game.appId} className="rounded-lg border border-slate-700/60 bg-slate-950/20 px-3 py-2">
										<div className="text-sm font-medium text-slate-100 truncate">{game.title}</div>
										<div className="mt-1 text-xs text-slate-400">
											{username}'s playtime: {game.playtimeHours}h
											{!isOwnProfile ? ` | Your playtime: ${game.visitorPlaytimeHours ?? 0}h` : ''}
										</div>
									</div>
								))
							)}
						</div>
						{gamesError ? (
							<div className="mt-3 rounded border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
								{gamesError}
							</div>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
};

export default ProfilePage;

