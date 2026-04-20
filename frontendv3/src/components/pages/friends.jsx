import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const makeId = () => Math.random().toString(16).slice(2);

function normalizeFriendEntry(entry) {
if (!entry || typeof entry !== 'object') return null;

const rawId = entry.userId ?? entry.id ?? null;
const id = String(rawId ?? '').trim();
if (!id) return null;

const name = String(entry.username ?? entry.name ?? `User ${id}`).trim() || `User ${id}`;
const avatarUrl = String(entry.avatarUrl ?? entry.pfp ?? '').trim() || '';
const bio = String(entry.bio ?? '').trim();

return {
id,
friendshipId: entry.friendshipId ?? entry.friendship_id ?? null,
name,
avatarUrl,
status: 'offline',
bio,
friendship: 'friend',
messages: [],
};
}

function normalizeSearchEntry(entry) {
if (!entry || typeof entry !== 'object') return null;

const id = String(entry.id ?? '').trim();
if (!id) return null;

const name = String(entry.username ?? entry.name ?? `User ${id}`).trim() || `User ${id}`;
const avatarUrl = String(entry.avatarUrl ?? entry.pfp ?? '').trim() || '';
const bio = String(entry.bio ?? '').trim();

return { id, name, avatarUrl, bio };
}

const FriendsPage = ({ user }) => {
const navigate = useNavigate();
const location = useLocation();

const [friends, setFriends] = useState([]);
const [friendsLoading, setFriendsLoading] = useState(true);
const [friendsError, setFriendsError] = useState('');

const [query, setQuery] = useState('');
const [searchBusy, setSearchBusy] = useState(false);
const [searchError, setSearchError] = useState('');
const [searchResults, setSearchResults] = useState([]);

const [activeFriendId, setActiveFriendId] = useState(null);
const [draft, setDraft] = useState('');
const [localMessages, setLocalMessages] = useState({});
const [addingFriendIds, setAddingFriendIds] = useState([]);
const [removingFriendIds, setRemovingFriendIds] = useState([]);

const loadFriends = useCallback(async () => {
try {
setFriendsLoading(true);
setFriendsError('');

if (typeof window.electronAPI.getMyFriends !== 'function') {
throw new Error('Friends API is not available in this build');
}

const payload = await window.electronAPI.getMyFriends(user?.id ?? null);
const rows = Array.isArray(payload)
? payload
: Array.isArray(payload?.items)
? payload.items
: Array.isArray(payload?.data)
? payload.data
: [];

const normalized = rows
.map((row) => normalizeFriendEntry(row))
.filter(Boolean);

setFriends(normalized);
} catch (error) {
console.error('Failed to load friends:', error);
setFriends([]);
setFriendsError(error instanceof Error ? error.message : 'Failed to load friends');
} finally {
setFriendsLoading(false);
}
}, [user?.id]);

useEffect(() => {
void loadFriends();
}, [loadFriends]);

useEffect(() => {
setLocalMessages((prev) => {
const next = { ...prev };
for (const friend of friends) {
if (!friend?.id) continue;
if (!Array.isArray(next[friend.id])) {
next[friend.id] = Array.isArray(friend.messages) ? friend.messages : [];
}
}
return next;
});
}, [friends]);

useEffect(() => {
const selectedFriendId = String(location?.state?.selectedFriendId || '').trim();
if (!selectedFriendId) return;
if (friends.some((friend) => friend.id === selectedFriendId)) {
setActiveFriendId(selectedFriendId);
}
}, [location?.state, friends]);

useEffect(() => {
const needle = query.trim();
if (!needle) {
setSearchResults([]);
setSearchError('');
setSearchBusy(false);
return;
}

if (typeof window.electronAPI.searchNativeUsersByName !== 'function') {
setSearchResults([]);
setSearchError('Server-side user search is not available');
setSearchBusy(false);
return;
}

let cancelled = false;
setSearchBusy(true);
setSearchError('');

const timeoutId = window.setTimeout(() => {
void (async () => {
try {
const payload = await window.electronAPI.searchNativeUsersByName(needle);
if (cancelled) return;

const rows = Array.isArray(payload)
? payload
: Array.isArray(payload?.items)
? payload.items
: Array.isArray(payload?.data)
? payload.data
: [];

const normalizedRows = rows
.map((row) => normalizeSearchEntry(row))
.filter(Boolean);

const currentUserId = String(user?.id ?? '').trim();
const friendIds = new Set(friends.map((friend) => String(friend?.id || '').trim()).filter(Boolean));

const filtered = normalizedRows.filter((candidate) => {
const candidateId = String(candidate?.id || '').trim();
if (!candidateId) return false;
if (currentUserId && candidateId === currentUserId) return false;
return true;
});

setSearchResults(
filtered.map((candidate) => ({
...candidate,
alreadyFriend: friendIds.has(String(candidate.id || '').trim()),
})),
);
} catch (error) {
if (cancelled) return;
console.error('Friend search failed:', error);
setSearchResults([]);
setSearchError(error instanceof Error ? error.message : 'Search failed');
} finally {
if (!cancelled) {
setSearchBusy(false);
}
}
})();
}, 280);

return () => {
cancelled = true;
window.clearTimeout(timeoutId);
};
}, [query, user?.id, friends]);

const filteredFriends = useMemo(() => {
const q = query.trim().toLowerCase();
if (!q) return friends;
return friends.filter((f) => String(f?.name || '').toLowerCase().includes(q));
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

const viewProfile = (friend) => {
if (!friend) {
navigate('/profile');
return;
}
navigate(`/profile/${friend.id}`, {
state: {
profile: {
id: friend.id,
name: friend.name,
bio: friend.bio,
avatarUrl: friend.avatarUrl,
pfp: friend.avatarUrl,
},
viewerUsername: user?.username || 'Player',
},
});
};

const handleAddFriend = async (candidate) => {
const candidateId = String(candidate?.id ?? '').trim();
if (!candidateId) return;

if (addingFriendIds.includes(candidateId)) return;
setAddingFriendIds((prev) => [...prev, candidateId]);
setSearchError('');

try {
if (typeof window.electronAPI.addFriend !== 'function') {
throw new Error('Add-friend API is not available in this build');
}

await window.electronAPI.addFriend(candidateId);
await loadFriends();
setSearchResults((prev) =>
prev.map((item) =>
String(item.id || '').trim() === String(candidate.id || '').trim()
? { ...item, alreadyFriend: true }
: item,
),
);
} catch (error) {
console.error('Failed to add friend:', error);
setSearchError(error instanceof Error ? error.message : 'Failed to add friend');
} finally {
setAddingFriendIds((prev) => prev.filter((id) => id !== candidateId));
}
};

const handleRemoveFriend = async (friend) => {
const friendId = String(friend?.id ?? '').trim();
const friendshipId = String(friend?.friendshipId ?? '').trim();
if (!friendId) return;
if (!friendshipId) {
setFriendsError('Cannot remove this friend: missing friendship id');
return;
}

if (removingFriendIds.includes(friendId)) return;
const canConfirm = typeof window.confirm === 'function';
const shouldRemove = !canConfirm || window.confirm(`Remove ${friend?.name || 'this user'} from your friends?`);
if (!shouldRemove) return;

setRemovingFriendIds((prev) => [...prev, friendId]);
setFriendsError('');

try {
if (typeof window.electronAPI.removeFriend !== 'function') {
throw new Error('Remove-friend API is not available in this build');
}

await window.electronAPI.removeFriend(friendshipId);

setFriends((prev) => prev.filter((row) => String(row?.id ?? '').trim() !== friendId));
setLocalMessages((prev) => {
const next = { ...prev };
delete next[friendId];
return next;
});
setSearchResults((prev) =>
prev.map((item) =>
String(item?.id ?? '').trim() === friendId
? { ...item, alreadyFriend: false }
: item,
),
);
setActiveFriendId((prev) => (String(prev ?? '').trim() === friendId ? null : prev));

await loadFriends();
} catch (error) {
console.error('Failed to remove friend:', error);
setFriendsError(error instanceof Error ? error.message : 'Failed to remove friend');
} finally {
setRemovingFriendIds((prev) => prev.filter((id) => id !== friendId));
}
};

const FriendRow = ({ friend, selected, showMsgButton, showProfileButton, showRemoveButton, removeBusy, onRemove }) => (
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
{friend.avatarUrl ? (
<img
src={friend.avatarUrl}
alt={friend.name}
className="h-9 w-9 rounded-full border border-slate-600/60 object-cover"
/>
) : (
<div className="h-9 w-9 rounded-full bg-slate-700/70 border border-slate-600/60 grid place-items-center text-xs font-semibold">
{`${friend.name ?? 'F'}`.slice(0, 2).toUpperCase()}
</div>
)}
<div className={
'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-slate-900 ' +
statusDot(friend.status)
} />
</div>

<div className="min-w-0 flex-1">
<div className="text-sm font-semibold text-slate-100 truncate">{friend.name}</div>
<div className="text-xs text-slate-400 capitalize">{friend.status}</div>
</div>

{(showMsgButton || showProfileButton || showRemoveButton) && (
<div className="flex items-center gap-2">
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
{showProfileButton && (
<button
type="button"
className="text-xs px-2 py-1 rounded border border-slate-700/60 bg-slate-900/30 hover:bg-slate-900/50"
onClick={(e) => {
e.stopPropagation();
viewProfile(friend);
}}
>
Profile
</button>
)}
{showRemoveButton && (
<button
type="button"
disabled={!!removeBusy}
className="text-xs px-2 py-1 rounded border border-rose-700/70 bg-rose-900/25 hover:bg-rose-900/35 text-rose-200 disabled:opacity-60"
onClick={(e) => {
e.stopPropagation();
if (typeof onRemove === 'function') {
void onRemove(friend);
}
}}
>
{removeBusy ? 'Removing...' : 'Remove'}
</button>
)}
</div>
)}
</div>
);

const showSearchResults = query.trim().length > 0;

return (
<div className="flex-1 px-3 py-3 text-slate-100">
<div className="flex items-center gap-3 mb-4">
<button
type="button"
className="h-9 w-9 rounded-lg border border-slate-700/60 bg-slate-900/25 hover:bg-slate-900/40 grid place-items-center"
onClick={() => void loadFriends()}
aria-label="Refresh friends"
title="Refresh friends"
>
↻
</button>
<input
value={query}
onChange={(e) => setQuery(e.target.value)}
placeholder="Search friends and users"
className="h-9 flex-1 rounded-lg border border-slate-700/60 bg-slate-950/20 px-3 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-slate-500/30"
/>
</div>

{friendsError ? (
<div className="mb-3 rounded-lg border border-rose-700/60 bg-rose-900/20 px-3 py-2 text-sm text-rose-200">
{friendsError}
</div>
) : null}

{searchError ? (
<div className="mb-3 rounded-lg border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-sm text-amber-200">
{searchError}
</div>
) : null}

{!activeFriend ? (
<div className="max-w-2xl mx-auto space-y-3">
<div className="rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur p-3">
<div className="text-sm font-semibold text-slate-100">Your friends</div>
<div className="mt-3 flex flex-col gap-2">
{friendsLoading ? (
<div className="text-sm text-slate-300 px-2 py-2">Loading friends...</div>
) : filteredFriends.length === 0 ? (
<div className="text-sm text-slate-300 px-2 py-2">No friends found.</div>
) : (
filteredFriends.map((f) => (
<FriendRow
key={f.id}
friend={f}
selected={false}
showMsgButton
showProfileButton
showRemoveButton
removeBusy={removingFriendIds.includes(String(f.id))}
onRemove={handleRemoveFriend}
/>
))
)}
</div>
</div>

{showSearchResults ? (
<div className="rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur p-3">
<div className="text-sm font-semibold text-slate-100">User search</div>
<div className="mt-3 flex flex-col gap-2">
{searchBusy ? (
<div className="text-sm text-slate-300 px-2 py-2">Searching users...</div>
) : searchResults.length < 1 ? (
<div className="text-sm text-slate-300 px-2 py-2">No users found.</div>
) : (
searchResults.map((candidate) => {
const isBusy = addingFriendIds.includes(String(candidate.id || '').trim());
return (
<div key={candidate.id} className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-950/25 px-3 py-2">
<div className="h-9 w-9 rounded-full overflow-hidden border border-slate-600/60 bg-slate-700/60 grid place-items-center text-xs font-semibold">
{candidate.avatarUrl ? (
<img src={candidate.avatarUrl} alt={candidate.name} className="h-full w-full object-cover" />
) : (
`${candidate.name}`.slice(0, 2).toUpperCase()
)}
</div>
<div className="min-w-0 flex-1">
<div className="text-sm font-semibold text-slate-100 truncate">{candidate.name}</div>
<div className="text-xs text-slate-400 truncate">{candidate.bio || 'No bio'}</div>
</div>
<button
type="button"
disabled={candidate.alreadyFriend || isBusy}
onClick={() => {
void handleAddFriend(candidate);
}}
className="h-8 px-3 rounded border border-slate-700/60 bg-slate-900/25 hover:bg-slate-900/40 text-xs text-slate-200 disabled:opacity-60"
>
{candidate.alreadyFriend ? 'Added' : (isBusy ? 'Adding...' : 'Add')}
</button>
</div>
);
})
)}
</div>
</div>
) : null}
</div>
) : (
<div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_280px] gap-3 min-h-[560px]">
<div className="rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur p-3">
<div className="text-sm font-semibold text-slate-100">Friends</div>
<div className="mt-3 flex flex-col gap-2">
{filteredFriends.map((f) => (
<FriendRow
key={f.id}
friend={f}
selected={f.id === activeFriendId}
showMsgButton={false}
showProfileButton
showRemoveButton={false}
/>
))}
</div>
</div>

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
onClick={() => viewProfile(activeFriend)}
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
onClick={() => viewProfile(null)}
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

<div className="rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur p-3">
<div className="flex items-center gap-3">
<div className="relative">
{activeFriend.avatarUrl ? (
<img
src={activeFriend.avatarUrl}
alt={activeFriend.name}
className="h-14 w-14 rounded-full border border-slate-600/60 object-cover"
/>
) : (
<div className="h-14 w-14 rounded-full bg-slate-700/70 border border-slate-600/60 grid place-items-center text-sm font-semibold">
{`${activeFriend.name ?? 'F'}`.slice(0, 2).toUpperCase()}
</div>
)}
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
onClick={() => viewProfile(activeFriend)}
>
View profile
</button>

<button
type="button"
disabled={removingFriendIds.includes(String(activeFriend.id))}
className="mt-2 w-full h-9 rounded-lg border border-rose-700/70 bg-rose-900/25 hover:bg-rose-900/35 text-sm text-rose-200 disabled:opacity-60"
onClick={() => {
void handleRemoveFriend(activeFriend);
}}
>
{removingFriendIds.includes(String(activeFriend.id)) ? 'Removing...' : 'Remove friend'}
</button>
</div>
</div>
)}
</div>
);
};

export default FriendsPage;
