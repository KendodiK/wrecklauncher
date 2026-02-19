import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const makeId = () => Math.random().toString(16).slice(2);

const FriendsPage = () => {
	const navigate = useNavigate();

	const friends = useMemo(
		() => [
			{
				id: 'f-1',
				name: 'Alex',
				status: 'online',
				bio: 'Likes co-op games and speedruns.',
				messages: [
					{ id: 'm-1', from: 'them', text: 'Yo, want to play later?', ts: 'Today' },
					{ id: 'm-2', from: 'me', text: 'Sure. What time?', ts: 'Today' },
				],
			},
			{
				id: 'f-2',
				name: 'Bence',
				status: 'away',
				bio: 'Mostly RPGs. Sometimes AFK.',
				messages: [{ id: 'm-3', from: 'them', text: 'Check out the new update.', ts: 'Yesterday' }],
			},
			{
				id: 'f-3',
				name: 'Dóra',
				status: 'offline',
				bio: 'Indie enjoyer. Achievement hunter.',
				messages: [],
			},
		],
		[]
	);

	const [query, setQuery] = useState('');
	const [activeFriendId, setActiveFriendId] = useState(null);
	const [draft, setDraft] = useState('');
	const [localMessages, setLocalMessages] = useState(() => {
		const map = {};
		for (const f of friends) map[f.id] = f.messages ?? [];
		return map;
	});

	const filteredFriends = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return friends;
		return friends.filter((f) => `${f.name ?? ''}`.toLowerCase().includes(q));
	}, [friends, query]);

	const activeFriend = useMemo(() => {
		if (!activeFriendId) return null;
		return friends.find((f) => f.id === activeFriendId) ?? null;
	}, [friends, activeFriendId]);

	const messagesForActive = useMemo(() => {
		if (!activeFriendId) return [];
		return localMessages[activeFriendId] ?? [];
	}, [localMessages, activeFriendId]);

	const statusDot = (status) => {
		if (status === 'online') return 'bg-emerald-400';
		if (status === 'away') return 'bg-amber-400';
		return 'bg-slate-500';
	};

	const openChat = (friendId) => {
		setActiveFriendId((prev) => (prev === friendId ? null : friendId));
		setDraft('');
	};

	const sendMessage = () => {
		if (!activeFriendId) return;
		const text = draft.trim();
		if (!text) return;
		setLocalMessages((prev) => ({
			...prev,
			[activeFriendId]: [
				...(prev[activeFriendId] ?? []),
				{ id: makeId(), from: 'me', text, ts: 'Now' },
			],
		}));
		setDraft('');
	};

	const viewProfile = () => {
		navigate('/profile');
	};

	const FriendRow = ({ friend, selected, showMsgButton }) => (
		<div
			role="button"
			tabIndex={0}
			className={
				'flex items-center gap-3 rounded-lg border px-3 py-2 select-none transition-colors ' +
				(selected
					? 'border-slate-600/70 bg-slate-900/45'
					: 'border-slate-700/60 bg-slate-950/25 hover:bg-slate-900/35')
			}
			onClick={() => openChat(friend.id)}
			onKeyDown={(e) => {
				if (e.key === 'Enter') openChat(friend.id);
			}}
		>
			<div className="relative">
				<div className="h-9 w-9 rounded-full bg-slate-700/70 border border-slate-600/60 grid place-items-center text-xs font-semibold">
					{`${friend.name ?? 'F'}`.slice(0, 2).toUpperCase()}
				</div>
				<div className={
					'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-slate-900 ' +
					statusDot(friend.status)
				} />
			</div>

			<div className="min-w-0 flex-1">
				<div className="text-sm font-semibold text-slate-100 truncate">{friend.name}</div>
				<div className="text-xs text-slate-400 capitalize">{friend.status}</div>
			</div>

			{showMsgButton && (
				<button
					type="button"
					className="text-xs px-2 py-1 rounded border border-slate-700/60 bg-slate-900/30 hover:bg-slate-900/50"
					onClick={(e) => {
						e.stopPropagation();
						openChat(friend.id);
					}}
				>
					MSG
				</button>
			)}
		</div>
	);

	return (
		<div className="flex-1 px-3 py-3 text-slate-100">
			<div className="flex items-center gap-3 mb-4">
				<button
					type="button"
					className="h-9 w-9 rounded-lg border border-slate-700/60 bg-slate-900/25 hover:bg-slate-900/40 grid place-items-center"
					onClick={() => {
						console.log('Add friend (placeholder)');
					}}
					aria-label="Add friend"
					title="Add friend"
				>
					+
				</button>
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search friends"
					className="h-9 flex-1 rounded-lg border border-slate-700/60 bg-slate-950/20 px-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-500/30"
				/>
			</div>

			{!activeFriend ? (
				<div className="max-w-2xl mx-auto">
					<div className="rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur p-3">
						<div className="text-sm font-semibold text-slate-100">Your friends</div>
						<div className="mt-3 flex flex-col gap-2">
							{filteredFriends.length === 0 ? (
								<div className="text-sm text-slate-300 px-2 py-2">No friends found.</div>
							) : (
								filteredFriends.map((f) => (
									<FriendRow key={f.id} friend={f} selected={false} showMsgButton />
								))
							)}
						</div>
					</div>
				</div>
			) : (
				<div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_280px] gap-3 min-h-[560px]">
					{/* Left: other friends list */}
					<div className="rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur p-3">
						<div className="text-sm font-semibold text-slate-100">Friends</div>
						<div className="mt-3 flex flex-col gap-2">
							{filteredFriends.map((f) => (
								<FriendRow
									key={f.id}
									friend={f}
									selected={f.id === activeFriendId}
									showMsgButton={false}
								/>
							))}
						</div>
					</div>

					{/* Middle: chat area */}
					<div className="rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur flex flex-col min-w-0">
						<div className="px-3 py-2 border-b border-slate-700/60">
							<div className="text-sm font-semibold text-slate-100 truncate">Chat with {activeFriend.name}</div>
							<div className="text-xs text-slate-400">Click the active friend again to close chat</div>
						</div>
						<div className="flex-1 overflow-auto px-3 py-3 flex flex-col gap-2">
							{messagesForActive.length === 0 ? (
								<div className="text-sm text-slate-300">No messages yet.</div>
							) : (
								messagesForActive.map((m) => {
									const isMe = m.from === 'me';
									return (
										<div
											key={m.id}
											className={
												'flex items-end gap-2 ' + (isMe ? 'justify-end' : 'justify-start')
										}
										>
											{!isMe && (
												<button
													type="button"
													className="h-7 px-2 rounded border border-slate-700/60 bg-slate-900/25 hover:bg-slate-900/40 text-xs text-slate-200 whitespace-nowrap"
													onClick={viewProfile}
													title="View profile"
												>
													View profile
												</button>
											)}
											<div
												className={
													'max-w-[78%] rounded-lg border px-3 py-2 text-sm ' +
													(isMe
														? 'border-emerald-500/25 bg-emerald-500/10'
														: 'border-slate-700/60 bg-slate-950/20')
												}
											>
												<div className="text-slate-100 whitespace-pre-wrap">{m.text}</div>
												<div className="mt-1 text-[10px] text-slate-400">{m.ts}</div>
											</div>
											{isMe && (
												<button
													type="button"
													className="h-7 px-2 rounded border border-slate-700/60 bg-slate-900/25 hover:bg-slate-900/40 text-xs text-slate-200 whitespace-nowrap"
													onClick={viewProfile}
													title="View profile"
												>
													View profile
												</button>
											)}
										</div>
									);
								})
							)}
						</div>
						<div className="px-3 py-3 border-t border-slate-700/60 flex items-center gap-2">
							<input
								value={draft}
								onChange={(e) => setDraft(e.target.value)}
								placeholder="Type a message"
								className="h-9 flex-1 rounded-lg border border-slate-700/60 bg-slate-950/20 px-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-500/30"
								onKeyDown={(e) => {
									if (e.key === 'Enter') sendMessage();
								}}
							/>
							<button
								type="button"
								className="h-9 px-3 rounded-lg border border-slate-700/60 bg-slate-900/25 hover:bg-slate-900/40 text-sm"
								onClick={sendMessage}
							>
								Send
							</button>
						</div>
					</div>

					{/* Right: friend icon + bio/status + profile */}
					<div className="rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur p-3">
						<div className="flex items-center gap-3">
							<div className="relative">
								<div className="h-14 w-14 rounded-full bg-slate-700/70 border border-slate-600/60 grid place-items-center text-sm font-semibold">
									{`${activeFriend.name ?? 'F'}`.slice(0, 2).toUpperCase()}
								</div>
								<div className={
									'absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border border-slate-900 ' +
									statusDot(activeFriend.status)
								} />
							</div>
							<div className="min-w-0">
								<div className="text-sm font-semibold text-slate-100 truncate">{activeFriend.name}</div>
								<div className="text-xs text-slate-400 capitalize">Status: {activeFriend.status}</div>
							</div>
						</div>

						<div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-950/20 p-3">
							<div className="text-xs font-semibold text-slate-100">Bio</div>
							<div className="mt-2 text-sm text-slate-200/90 whitespace-pre-wrap">
								{activeFriend.bio ?? 'No bio.'}
							</div>
						</div>

						<button
							type="button"
							className="mt-3 w-full h-9 rounded-lg border border-slate-700/60 bg-slate-900/25 hover:bg-slate-900/40 text-sm"
							onClick={viewProfile}
						>
							View profile
						</button>
					</div>
				</div>
			)}
		</div>
	);
};

export default FriendsPage;

