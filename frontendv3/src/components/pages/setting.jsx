import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const DEFAULT_SETTINGS = {
	display: {
		theme: 'dark',
		language: 'en',
		uiScale: 100,
		animations: true,
	},
	library: {
		autoRefreshHours: 24,
		viewMode: 'carousel',
		gamesPerPage: 20,
	},
	downloads: {
		path: 'Downloads/WreckLauncher',
		pirateTorrentsPath: 'Downloads/WreckLauncher/Pirate Torrents',
		concurrent: 3,
	},
	account: {
		profile: {
			bio: '',
			avatarUrl: '',
		},
		platforms: {
			steam: { connected: false, username: '', profileLink: '' },
			gog: { connected: false, username: '' },
			itch: { connected: false, username: '' },
		},
		syncFrequencyHours: 6,
	},
};

function createEmptyPlatformRuntimeState() {
	return {
		steam: { connected: false, username: '', profileLink: '' },
		gog: { connected: false, username: '' },
		itch: { connected: false, username: '' },
	};
}

function normalizePlatformUsersPayload(payload) {
	if (Array.isArray(payload)) return payload;
	if (Array.isArray(payload?.items)) return payload.items;
	if (Array.isArray(payload?.data)) return payload.data;
	return [];
}

function normalizePlatformIdentifier(raw) {
	return String(raw ?? '').trim().toLowerCase();
}

function getPlatformUsernameFromRow(row) {
	return String(row?.platform_user_name ?? row?.platformUserName ?? row?.username ?? '').trim();
}

function inferSteamProfileLinkFromRow(row) {
	const rawProfile = String(row?.platform_profile_id ?? row?.platformProfileId ?? '').trim();
	if (!rawProfile) return '';
	if (/^https?:\/\//i.test(rawProfile)) return rawProfile;
	if (/^\d+$/.test(rawProfile)) {
		return `https://steamcommunity.com/profiles/${rawProfile}`;
	}
	return '';
}

function mergeWithDefaults(defaults, incoming) {
	if (Array.isArray(defaults)) {
		return Array.isArray(incoming) ? incoming : defaults;
	}
	if (typeof defaults !== 'object' || defaults === null) {
		return incoming === undefined ? defaults : incoming;
	}

	const source = (incoming && typeof incoming === 'object') ? incoming : {};
	const merged = { ...defaults };

	for (const key of Object.keys(defaults)) {
		merged[key] = mergeWithDefaults(defaults[key], source[key]);
	}

	return merged;
}

function normalizeSettings(data) {
	return mergeWithDefaults(DEFAULT_SETTINGS, data);
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMissingSettingsHandlerError(error, channel) {
	const message = String(error?.message || '');
	return message.includes(`No handler registered for '${channel}'`);
}

async function fetchSettingsWithRetry(api, attempts = 8, delayMs = 150) {
	let lastError = null;

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			return await api.getSettings();
		} catch (error) {
			lastError = error;
			const message = String(error?.message || '');
			const isMissingHandler = message.includes("No handler registered for 'settings:get'");
			if (!isMissingHandler || attempt === attempts) {
				throw error;
			}
			await sleep(delayMs);
		}
	}

	throw lastError || new Error('Failed to load settings');
}

const SettingsPage = ({ onProfileLocalUpdate }) => {
	const location = useLocation();
	const navigate = useNavigate();
	const [settings, setSettings] = useState(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [steamBusy, setSteamBusy] = useState(false);
	const [gogBusy, setGogBusy] = useState(false);
	const [itchBusy, setItchBusy] = useState(false);
	const [steamForm, setSteamForm] = useState({ username: '', profileLink: '' });
	const [gogUsername, setGogUsername] = useState('');
	const [itchUsername, setItchUsername] = useState('');
	const [gogOAuthStatus, setGogOAuthStatus] = useState({ isLoggedIn: false, hasToken: false });
	const [itchOAuthStatus, setItchOAuthStatus] = useState({ isLoggedIn: false, hasToken: false });
	const [platformRuntime, setPlatformRuntime] = useState(() => createEmptyPlatformRuntimeState());
	const [profileForm, setProfileForm] = useState({ bio: '', avatarUrl: '' });
	const [downloadPathsForm, setDownloadPathsForm] = useState({ path: '', pirateTorrentsPath: '' });
	const [message, setMessage] = useState({ type: '', text: '' });

	// Load settings on mount
	useEffect(() => {
		loadSettings();
	}, []);

	const fetchPlatformRuntimeState = async () => {
		const empty = createEmptyPlatformRuntimeState();

		if (typeof window?.electronAPI?.getPlatformUsers !== 'function') {
			return empty;
		}

		const [usersPayload, steamPlatform, gogPlatform, itchPlatform] = await Promise.all([
			window.electronAPI.getPlatformUsers(),
			typeof window.electronAPI.getPlatform === 'function' ? window.electronAPI.getPlatform('steam').catch(() => null) : Promise.resolve(null),
			typeof window.electronAPI.getPlatform === 'function' ? window.electronAPI.getPlatform('gog').catch(() => null) : Promise.resolve(null),
			typeof window.electronAPI.getPlatform === 'function' ? window.electronAPI.getPlatform('itch').catch(() => null) : Promise.resolve(null),
		]);

		const users = normalizePlatformUsersPayload(usersPayload);
		const platformIds = {
			steam: normalizePlatformIdentifier(steamPlatform?.id ?? steamPlatform?.platform_id ?? steamPlatform?.platformId ?? 'steam'),
			gog: normalizePlatformIdentifier(gogPlatform?.id ?? gogPlatform?.platform_id ?? gogPlatform?.platformId ?? 'gog'),
			itch: normalizePlatformIdentifier(itchPlatform?.id ?? itchPlatform?.platform_id ?? itchPlatform?.platformId ?? 'itch'),
		};

		const resolvePlatformName = (row) => {
			const raw = normalizePlatformIdentifier(
				row?.platform_id ?? row?.platformId ?? row?.platform ?? row?.platform_name ?? row?.platformName,
			);
			if (!raw) return '';

			if (raw === platformIds.steam || raw === 'steam') return 'steam';
			if (raw === platformIds.gog || raw === 'gog' || raw === 'gog.com') return 'gog';
			if (raw === platformIds.itch || raw === 'itch' || raw === 'itchio' || raw === 'itch.io') return 'itch';
			return '';
		};

		const next = createEmptyPlatformRuntimeState();
		for (const row of users) {
			if (!row || typeof row !== 'object') continue;
			const platformName = resolvePlatformName(row);
			if (!platformName) continue;

			const username = getPlatformUsernameFromRow(row);
			if (platformName === 'steam') {
				next.steam.connected = true;
				if (!next.steam.username && username) next.steam.username = username;
				if (!next.steam.profileLink) {
					next.steam.profileLink = inferSteamProfileLinkFromRow(row);
				}
				continue;
			}

			next[platformName].connected = true;
			if (!next[platformName].username && username) {
				next[platformName].username = username;
			}
		}

		return next;
	};

	const applyPlatformRuntimeState = (nextState) => {
		const next = nextState && typeof nextState === 'object' ? nextState : createEmptyPlatformRuntimeState();
		setPlatformRuntime(next);
		setSteamForm({
			username: next?.steam?.username || '',
			profileLink: next?.steam?.profileLink || '',
		});
		setGogUsername(next?.gog?.username || '');
		setItchUsername(next?.itch?.username || '');
	};

	const refreshPlatformRuntimeState = async () => {
		try {
			const next = await fetchPlatformRuntimeState();
			applyPlatformRuntimeState(next);
			return next;
		} catch (error) {
			console.warn('Failed to fetch runtime platform users:', error);
			const empty = createEmptyPlatformRuntimeState();
			applyPlatformRuntimeState(empty);
			return empty;
		}
	};

	const loadSettings = async () => {
		try {
			setLoading(true);
			const data = await fetchSettingsWithRetry(window.electronAPI, 8, 150);
			const normalized = normalizeSettings(data);
			setSettings(normalized);
			setProfileForm({
				bio: normalized?.account?.profile?.bio || '',
				avatarUrl: normalized?.account?.profile?.avatarUrl || '',
			});
			setDownloadPathsForm({
				path: normalized?.downloads?.path || '',
				pirateTorrentsPath: normalized?.downloads?.pirateTorrentsPath || normalized?.downloads?.path || '',
			});
			try {
				if (typeof window.electronAPI.getGogOAuthStatus === 'function') {
					const oauthStatus = await window.electronAPI.getGogOAuthStatus();
					setGogOAuthStatus({
						isLoggedIn: Boolean(oauthStatus?.isLoggedIn),
						hasToken: Boolean(oauthStatus?.hasToken),
					});
				}
			} catch {
				setGogOAuthStatus({ isLoggedIn: false, hasToken: false });
			}
			try {
				if (typeof window.electronAPI.getItchOAuthStatus === 'function') {
					const oauthStatus = await window.electronAPI.getItchOAuthStatus();
					setItchOAuthStatus({
						isLoggedIn: Boolean(oauthStatus?.isLoggedIn),
						hasToken: Boolean(oauthStatus?.hasToken),
					});
				}
			} catch {
				setItchOAuthStatus({ isLoggedIn: false, hasToken: false });
			}
			await refreshPlatformRuntimeState();
		} catch (error) {
			console.error('Failed to load settings:', error);
			const fallbackSettings = normalizeSettings(null);
			setSettings(fallbackSettings);
			setProfileForm({
				bio: fallbackSettings.account.profile.bio,
				avatarUrl: fallbackSettings.account.profile.avatarUrl,
			});
			setDownloadPathsForm({
				path: fallbackSettings.downloads.path,
				pirateTorrentsPath: fallbackSettings.downloads.pirateTorrentsPath || fallbackSettings.downloads.path,
			});
			setGogOAuthStatus({ isLoggedIn: false, hasToken: false });
			setItchOAuthStatus({ isLoggedIn: false, hasToken: false });
			await refreshPlatformRuntimeState();
			setMessage({ type: 'error', text: 'Settings endpoint unavailable, using defaults' });
		} finally {
			setLoading(false);
		}
	};


	const updateSetting = async (category, key, value) => {
		try {
			setSaving(true);
			const updated = await window.electronAPI.updateSetting(category, key, value);
			setSettings(normalizeSettings(updated));
			setMessage({ type: 'success', text: 'Setting saved' });
			setTimeout(() => setMessage({ type: '', text: '' }), 2000);
		} catch (error) {
			console.error('Failed to update setting:', error);
			if (isMissingSettingsHandlerError(error, 'settings:update')) {
				setSettings((prev) => {
					const base = normalizeSettings(prev);
					return {
						...base,
						[category]: {
							...base[category],
							[key]: value,
						},
					};
				});
				setMessage({ type: 'error', text: 'Settings backend unavailable, change kept locally' });
			} else {
				setMessage({ type: 'error', text: 'Failed to save setting' });
			}
		} finally {
			setSaving(false);
		}
	};

	const handleResetSettings = async () => {
		if (!window.confirm('Are you sure you want to reset all settings to defaults?')) {
			return;
		}

		try {
			setSaving(true);
			const defaults = await window.electronAPI.resetSettings();
			setSettings(defaults);
			await refreshPlatformRuntimeState();
			setMessage({ type: 'success', text: 'Settings reset to defaults' });
		} catch (error) {
			console.error('Failed to reset settings:', error);
			setMessage({ type: 'error', text: 'Failed to reset settings' });
		} finally {
			setSaving(false);
		}
	};

	const persistDownloadPaths = async (nextDownloads) => {
		const normalizedPath = String(nextDownloads?.path || '').trim();
		const normalizedPiratePath = String(nextDownloads?.pirateTorrentsPath || '').trim();

		if (!normalizedPath) {
			throw new Error('Download path is required');
		}

		if (!normalizedPiratePath) {
			throw new Error('Pirate torrent download path is required');
		}

		const updated = await window.electronAPI.updateSettings({
			downloads: {
				...(settings?.downloads || {}),
				path: normalizedPath,
				pirateTorrentsPath: normalizedPiratePath,
			},
		});

		const normalized = normalizeSettings(updated);
		setSettings(normalized);
		setDownloadPathsForm({
			path: normalized?.downloads?.path || normalizedPath,
			pirateTorrentsPath: normalized?.downloads?.pirateTorrentsPath || normalizedPiratePath,
		});

		return normalized;
	};

	const handleSaveDownloadPaths = async () => {
		try {
			setSaving(true);
			await persistDownloadPaths(downloadPathsForm);
			setMessage({ type: 'success', text: 'Download paths saved' });
			setTimeout(() => setMessage({ type: '', text: '' }), 2000);
		} catch (error) {
			console.error('Failed to save download paths:', error);
			setMessage({
				type: 'error',
				text: error instanceof Error ? error.message : 'Failed to save download paths',
			});
		} finally {
			setSaving(false);
		}
	};

	const resolvePlatformUserIdForDisconnect = async (platformName, preferredUsername = '') => {
		const normalizedPlatformName = String(platformName || '').trim().toLowerCase();
		const normalizedPreferredUsername = String(preferredUsername || '').trim().toLowerCase();
		if (!normalizedPlatformName) return null;

		if (normalizedPreferredUsername && typeof window.electronAPI.getPlatformUserId === 'function') {
			try {
				const directId = await window.electronAPI.getPlatformUserId(normalizedPlatformName, normalizedPreferredUsername);
				const normalizedDirectId = String(directId ?? '').trim();
				if (normalizedDirectId) return normalizedDirectId;
			} catch (error) {
				console.warn(`Direct platform user lookup failed for ${normalizedPlatformName}:`, error);
			}
		}

		if (typeof window.electronAPI.getPlatformUsers !== 'function') return null;

		const usersPayload = await window.electronAPI.getPlatformUsers();
		const users = Array.isArray(usersPayload)
			? usersPayload
			: Array.isArray(usersPayload?.items)
				? usersPayload.items
				: Array.isArray(usersPayload?.data)
					? usersPayload.data
					: [];

		if (!Array.isArray(users) || users.length < 1) return null;

		let resolvedPlatformId = null;
		if (typeof window.electronAPI.getPlatform === 'function') {
			try {
				const platformRow = await window.electronAPI.getPlatform(normalizedPlatformName);
				const rawPlatformId = platformRow?.id ?? platformRow?.platform_id ?? platformRow?.platformId;
				const numericPlatformId = Number(rawPlatformId);
				if (Number.isFinite(numericPlatformId) && numericPlatformId > 0) {
					resolvedPlatformId = numericPlatformId;
				} else {
					const normalizedTextPlatformId = String(rawPlatformId ?? '').trim();
					resolvedPlatformId = normalizedTextPlatformId || null;
				}
			} catch (error) {
				console.warn(`Failed to resolve platform id for ${normalizedPlatformName}:`, error);
			}
		}

		const platformAliases = new Set([normalizedPlatformName]);
		if (normalizedPlatformName === 'itchio' || normalizedPlatformName === 'itch.io' || normalizedPlatformName === 'itch') {
			platformAliases.add('itchio');
			platformAliases.add('itch');
			platformAliases.add('itch.io');
		}
		if (normalizedPlatformName === 'gog' || normalizedPlatformName === 'gog.com') {
			platformAliases.add('gog');
			platformAliases.add('gog.com');
		}

		const matchesPlatform = (row) => {
			const rawPlatform = row?.platform_id ?? row?.platformId ?? row?.platform ?? row?.platform_name ?? row?.platformName;
			const platformText = String(rawPlatform ?? '').trim().toLowerCase();

			if (resolvedPlatformId !== null && resolvedPlatformId !== undefined) {
				const resolvedNumeric = Number(resolvedPlatformId);
				const rowNumeric = Number(rawPlatform);
				if (Number.isFinite(resolvedNumeric) && resolvedNumeric > 0 && Number.isFinite(rowNumeric)) {
					if (rowNumeric === resolvedNumeric) return true;
				}

				const resolvedText = String(resolvedPlatformId).trim().toLowerCase();
				if (resolvedText && platformText === resolvedText) return true;
			}

			return platformAliases.has(platformText);
		};

		const getRowUsername = (row) => String(row?.platform_user_name ?? row?.platformUserName ?? row?.username ?? '').trim().toLowerCase();

		const candidateRows = users.filter((row) => row && typeof row === 'object' && matchesPlatform(row));
		if (candidateRows.length < 1) return null;

		const matchingRow = normalizedPreferredUsername
			? candidateRows.find((row) => getRowUsername(row) === normalizedPreferredUsername)
			: null;
		const selected = matchingRow || candidateRows[0];

		const rawId = selected?.id ?? selected?.platformUserID ?? selected?.platform_user_id;
		const normalizedId = String(rawId ?? '').trim();
		return normalizedId || null;
	};

	const disconnectPlatformUser = async (platformName, preferredUsername = '') => {
		const platformUserId = await resolvePlatformUserIdForDisconnect(platformName, preferredUsername);
		if (!platformUserId) return false;

		if (typeof window.electronAPI.deletePlatformUser !== 'function') {
			throw new Error('Platform disconnect endpoint is unavailable');
		}

		await window.electronAPI.deletePlatformUser(platformUserId);
		return true;
	};

	const handleSteamConnection = async () => {
		const steamSettings = platformRuntime?.steam;
		if (steamSettings?.connected) {
			try {
				setSteamBusy(true);
				const steamUsername = String(steamSettings?.username || steamForm.username || '').trim();
				await disconnectPlatformUser('steam', steamUsername);
				await refreshPlatformRuntimeState();
				setMessage({ type: 'success', text: 'Steam disconnected' });
			} catch (error) {
				console.error('Failed to disconnect Steam:', error);
				setMessage({ type: 'error', text: 'Failed to disconnect Steam' });
			} finally {
				setSteamBusy(false);
			}
			return;
		}

		const username = steamForm.username.trim();
		const profileLink = steamForm.profileLink.trim();

		if (!username) {
			setMessage({ type: 'error', text: 'Steam login name is required' });
			return;
		}

		if (!profileLink) {
			setMessage({ type: 'error', text: 'Steam profile link is required' });
			return;
		}

		try {
			setSteamBusy(true);
			await window.electronAPI.createSteamPlatformUser(username, profileLink);
			const refreshed = await refreshPlatformRuntimeState();
			if (!refreshed?.steam?.connected) {
				throw new Error('Steam user link was not found after connect');
			}
			setMessage({ type: 'success', text: 'Steam connected successfully' });
		} catch (error) {
			console.error('Failed to connect Steam:', error);
			setMessage({
				type: 'error',
				text: error instanceof Error ? error.message : 'Failed to connect Steam',
			});
		} finally {
			setSteamBusy(false);
		}
	};

	const handleGogConnection = async () => {
		const gogSettings = platformRuntime?.gog;
		if (gogSettings?.connected) {
			try {
				setGogBusy(true);
				const platformUsername = String(gogSettings?.username || gogUsername || '').trim();
				await disconnectPlatformUser('gog', platformUsername);
				if (typeof window.electronAPI.logoutGogOAuth === 'function') {
					await window.electronAPI.logoutGogOAuth();
				}
				setGogOAuthStatus({ isLoggedIn: false, hasToken: false });
				await refreshPlatformRuntimeState();
				setMessage({ type: 'success', text: 'GOG disconnected' });
			} catch (error) {
				console.error('Failed to disconnect GOG:', error);
				setMessage({ type: 'error', text: 'Failed to disconnect GOG' });
			} finally {
				setGogBusy(false);
			}
			return;
		}

		let username = gogUsername.trim();
		let uploadResult = null;

		try {
			setGogBusy(true);

			if (typeof window.electronAPI.loginGogOAuthAndUpload === 'function') {
				try {
					uploadResult = await window.electronAPI.loginGogOAuthAndUpload();
				} catch (error) {
					if (!isMissingSettingsHandlerError(error, 'gog:oauth-login-and-upload')) {
						throw error;
					}
					if (typeof window.electronAPI.loginGogOAuth === 'function') {
						await window.electronAPI.loginGogOAuth();
					}
				}
			} else if (typeof window.electronAPI.loginGogOAuth === 'function') {
				await window.electronAPI.loginGogOAuth();
			}

			if (typeof window.electronAPI.getGogOAuthStatus === 'function') {
				const status = await window.electronAPI.getGogOAuthStatus();
				setGogOAuthStatus({
					isLoggedIn: Boolean(status?.isLoggedIn),
					hasToken: Boolean(status?.hasToken),
				});
			}

			const uploadedUsername = String(uploadResult?.profile?.username || uploadResult?.profile?.display_name || '').trim();
			if (uploadedUsername) {
				username = uploadedUsername;
				setGogUsername(uploadedUsername);
			}

			if (typeof window.electronAPI.getGogProfile === 'function') {
				const profile = await window.electronAPI.getGogProfile();
				const profileUsername = String(profile?.username || '').trim();
				if (profileUsername) {
					username = profileUsername;
					setGogUsername(profileUsername);
				}
			}

			if (!username) {
				throw new Error('GOG username is required');
			}

			const refreshed = await refreshPlatformRuntimeState();
			if (!refreshed?.gog?.connected) {
				throw new Error('GOG user link was not found after connect');
			}
			setMessage({
				type: 'success',
				text: uploadResult?.created === false
					? 'GOG connected (already linked in DB)'
					: 'GOG connected successfully',
			});
		} catch (error) {
			console.error('Failed to connect GOG:', error);
			setMessage({
				type: 'error',
				text: error instanceof Error ? error.message : 'Failed to connect GOG',
			});
		} finally {
			setGogBusy(false);
		}
	};

	const handleItchConnection = async () => {
		const itchSettings = platformRuntime?.itch;
		if (itchSettings?.connected) {
			try {
				setItchBusy(true);
				const platformUsername = String(itchSettings?.username || itchUsername || '').trim();
				await disconnectPlatformUser('itch', platformUsername);
				if (typeof window.electronAPI.logoutItchOAuth === 'function') {
					await window.electronAPI.logoutItchOAuth();
				}
				setItchOAuthStatus({ isLoggedIn: false, hasToken: false });
				await refreshPlatformRuntimeState();
				setMessage({ type: 'success', text: 'Itch.io disconnected' });
			} catch (error) {
				console.error('Failed to disconnect Itch.io:', error);
				setMessage({ type: 'error', text: 'Failed to disconnect Itch.io' });
			} finally {
				setItchBusy(false);
			}
			return;
		}

		let username = itchUsername.trim();
		let uploadResult = null;

		try {
			setItchBusy(true);

			if (typeof window.electronAPI.loginItchOAuthAndUpload === 'function') {
				try {
					uploadResult = await window.electronAPI.loginItchOAuthAndUpload();
				} catch (error) {
					if (!isMissingSettingsHandlerError(error, 'itch:oauth-login-and-upload')) {
						throw error;
					}
					if (typeof window.electronAPI.loginItchOAuth === 'function') {
						await window.electronAPI.loginItchOAuth();
					}
				}
			} else if (typeof window.electronAPI.loginItchOAuth === 'function') {
				await window.electronAPI.loginItchOAuth();
			}

			if (typeof window.electronAPI.getItchOAuthStatus === 'function') {
				const status = await window.electronAPI.getItchOAuthStatus();
				setItchOAuthStatus({
					isLoggedIn: Boolean(status?.isLoggedIn),
					hasToken: Boolean(status?.hasToken),
				});
			}

			const uploadedUsername = String(uploadResult?.profile?.username || uploadResult?.profile?.display_name || '').trim();
			if (uploadedUsername) {
				username = uploadedUsername;
				setItchUsername(uploadedUsername);
			}

			if (typeof window.electronAPI.getItchProfile === 'function') {
				const profile = await window.electronAPI.getItchProfile();
				const profileUsername = String(profile?.username || '').trim();
				if (profileUsername) {
					username = profileUsername;
					setItchUsername(profileUsername);
				}
			}

			if (!username) {
				throw new Error('Itch.io username is required');
			}

			const refreshed = await refreshPlatformRuntimeState();
			if (!refreshed?.itch?.connected) {
				throw new Error('Itch.io user link was not found after connect');
			}
			setMessage({
				type: 'success',
				text: uploadResult?.created === false
					? 'Itch.io connected (already linked in DB)'
					: 'Itch.io connected successfully',
			});
		} catch (error) {
			console.error('Failed to connect Itch.io:', error);
			setMessage({
				type: 'error',
				text: error instanceof Error ? error.message : 'Failed to connect Itch.io',
			});
		} finally {
			setItchBusy(false);
		}
	};

	const handleSaveProfile = async () => {
		const normalizedBio = profileForm.bio.trim();
		const normalizedAvatarUrl = profileForm.avatarUrl.trim();
		let remoteProfile = null;
		let remoteError = null;

		try {
			setSaving(true);

			if (typeof window?.electronAPI?.updateCurrentUserProfile === 'function') {
				try {
					remoteProfile = await window.electronAPI.updateCurrentUserProfile({
						bio: normalizedBio,
						avatarUrl: normalizedAvatarUrl,
					});
				} catch (error) {
					remoteError = error;
					console.error('Failed to update native user profile in backend DB:', error);
				}
			}

			const updated = await window.electronAPI.updateSettings({
				account: {
					profile: {
						bio: normalizedBio,
						avatarUrl: normalizedAvatarUrl,
					},
				},
			});
			const normalized = normalizeSettings(updated);
			setSettings(normalized);

			const resolvedBio =
				typeof remoteProfile?.bio === 'string'
					? remoteProfile.bio
					: (normalized?.account?.profile?.bio || '');
			const resolvedAvatar =
				typeof remoteProfile?.avatarUrl === 'string'
					? remoteProfile.avatarUrl
					: (normalized?.account?.profile?.avatarUrl || '');

			setProfileForm({
				bio: resolvedBio,
				avatarUrl: resolvedAvatar,
			});

			if (typeof onProfileLocalUpdate === 'function') {
				onProfileLocalUpdate({
					bio: resolvedBio,
					avatarUrl: resolvedAvatar,
				});
			}

			if (remoteError) {
				const remoteMessage =
					remoteError instanceof Error && remoteError.message
						? remoteError.message
						: 'unknown backend error';
				setMessage({
					type: 'error',
					text: `Profile saved locally, but DB update failed: ${remoteMessage}`,
				});
			} else {
				setMessage({ type: 'success', text: 'Profile settings saved' });
			}
			setTimeout(() => setMessage({ type: '', text: '' }), 2000);
		} catch (error) {
			console.error('Failed to save profile settings:', error);
			if (isMissingSettingsHandlerError(error, 'settings:update-bulk')) {
				const localUpdated = normalizeSettings({
					...settings,
					account: {
						...(settings?.account || {}),
						profile: {
							bio: normalizedBio,
							avatarUrl: normalizedAvatarUrl,
						},
					},
				});
				setSettings(localUpdated);

				if (typeof onProfileLocalUpdate === 'function') {
					onProfileLocalUpdate({
						bio: normalizedBio,
						avatarUrl: normalizedAvatarUrl,
					});
				}

				if (remoteError) {
					const remoteMessage =
						remoteError instanceof Error && remoteError.message
							? remoteError.message
							: 'unknown backend error';
					setMessage({ type: 'error', text: `Settings backend unavailable and DB update failed: ${remoteMessage}` });
				} else {
					setMessage({ type: 'error', text: 'Settings backend unavailable, profile kept locally' });
				}
			} else {
				setMessage({ type: 'error', text: 'Failed to save profile settings' });
			}
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div className="flex-1 px-4 py-3 text-slate-100 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
					<p>Loading settings...</p>
				</div>
			</div>
		);
	}

	if (!settings) {
		return (
			<div className="flex-1 px-4 py-3 text-slate-100">
				<h1 className="text-2xl font-semibold mb-4">Settings</h1>
				<p className="text-red-400">Failed to load settings</p>
			</div>
		);
	}

	const steamSettings = platformRuntime.steam;
	const gogSettings = platformRuntime.gog;
	const itchSettings = platformRuntime.itch;
	const canSaveDownloadPaths =
		downloadPathsForm.path.trim().length > 0
		&& downloadPathsForm.pirateTorrentsPath.trim().length > 0;
	const searchParams = new URLSearchParams(location.search || '');
	const rawSection = String(searchParams.get('section') || '').trim().toLowerCase();
	const selectedSection = ['display', 'library', 'advanced'].includes(rawSection) ? rawSection : '';
	const showingMovedSection = selectedSection.length > 0;
	const titleMap = {
		display: 'Display Settings',
		library: 'Library Settings',
		advanced: 'Advanced Settings',
	};
	const pageTitle = selectedSection ? titleMap[selectedSection] : 'Settings';
	const pageSubtitle = selectedSection
		? 'Opened from the user menu'
		: 'Customize your WreckLauncher experience';

	return (
		<div className="flex-1 px-6 py-4 text-slate-100 overflow-y-auto">
			<div className="max-w-4xl mx-auto">
				<h1 className="text-3xl font-bold mb-2">{pageTitle}</h1>
				<p className="text-slate-400 mb-6">{pageSubtitle}</p>

				{showingMovedSection && (
					<div className="mb-4">
						<button
							type="button"
							onClick={() => navigate('/settings')}
							className="rounded border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs hover:bg-slate-700"
						>
							Back to main settings
						</button>
					</div>
				)}

				{/* Status Message */}
				{message.text && (
					<div className={`mb-4 p-3 rounded-lg ${
						message.type === 'success' ? 'bg-green-900/30 text-green-400 border border-green-700' :
						'bg-red-900/30 text-red-400 border border-red-700'
					}`}>
						{message.text}
					</div>
				)}

				{/* Display Settings */}
				{selectedSection === 'display' && (
				<section className="mb-8 bg-slate-800/50 rounded-lg p-6 border border-slate-700">
					<h2 className="text-xl font-semibold mb-4 flex items-center">
						<svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
						</svg>
						Display
					</h2>

					<div className="space-y-4">
						{/* Theme */}
						<div className="flex items-center justify-between">
							<div>
								<label className="text-sm font-medium">Theme</label>
								<p className="text-xs text-slate-400">Choose your preferred color scheme</p>
							</div>
							<select
								value={settings.display.theme}
								onChange={(e) => updateSetting('display', 'theme', e.target.value)}
								disabled={saving}
								className="bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
							>
								<option value="dark">Dark</option>
								<option value="light">Light</option>
								<option value="system">System</option>
							</select>
						</div>

						{/* Language */}
						<div className="flex items-center justify-between">
							<div>
								<label className="text-sm font-medium">Language</label>
								<p className="text-xs text-slate-400">Select your language</p>
							</div>
							<select
								value={settings.display.language}
								onChange={(e) => updateSetting('display', 'language', e.target.value)}
								disabled={saving}
								className="bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
							>
								<option value="en">English</option>
								<option value="hu">Hungarian</option>
							</select>
						</div>

						{/* UI Scale */}
						<div className="flex items-center justify-between">
							<div>
								<label className="text-sm font-medium">UI Scale: {settings.display.uiScale}%</label>
								<p className="text-xs text-slate-400">Adjust interface size</p>
							</div>
							<select
								value={settings.display.uiScale}
								onChange={(e) => updateSetting('display', 'uiScale', parseInt(e.target.value))}
								disabled={saving}
								className="bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
							>
								<option value="100">100%</option>
								<option value="125">125%</option>
								<option value="150">150%</option>
							</select>
						</div>

						{/* Animations */}
						<div className="flex items-center justify-between">
							<div>
								<label className="text-sm font-medium">Animations</label>
								<p className="text-xs text-slate-400">Enable or disable UI animations</p>
							</div>
							<button
								onClick={() => updateSetting('display', 'animations', !settings.display.animations)}
								disabled={saving}
								className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
									settings.display.animations ? 'bg-blue-600' : 'bg-slate-600'
								}`}
							>
								<span
									className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
										settings.display.animations ? 'translate-x-6' : 'translate-x-1'
									}`}
								/>
							</button>
						</div>
					</div>
				</section>
				)}

				{/* Library Settings */}
				{selectedSection === 'library' && (
				<section className="mb-8 bg-slate-800/50 rounded-lg p-6 border border-slate-700">
					<h2 className="text-xl font-semibold mb-4 flex items-center">
						<svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
						</svg>
						Library
					</h2>

					<div className="space-y-4">
						{/* Auto-refresh */}
						<div className="flex items-center justify-between">
							<div>
								<label className="text-sm font-medium">Auto-refresh interval</label>
								<p className="text-xs text-slate-400">How often to sync your library</p>
							</div>
							<select
								value={settings.library.autoRefreshHours}
								onChange={(e) => updateSetting('library', 'autoRefreshHours', parseInt(e.target.value))}
								disabled={saving}
								className="bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
							>
								<option value="6">Every 6 hours</option>
								<option value="12">Every 12 hours</option>
								<option value="24">Every 24 hours</option>
								<option value="48">Every 2 days</option>
							</select>
						</div>

						{/* View Mode */}
						<div className="flex items-center justify-between">
							<div>
								<label className="text-sm font-medium">Default view mode</label>
								<p className="text-xs text-slate-400">How games are displayed</p>
							</div>
							<select
								value={settings.library.viewMode}
								onChange={(e) => updateSetting('library', 'viewMode', e.target.value)}
								disabled={saving}
								className="bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
							>
								<option value="carousel">Carousel</option>
								<option value="grid">Grid</option>
								<option value="list">List</option>
							</select>
						</div>

						{/* Games per page */}
						<div className="flex items-center justify-between">
							<div>
								<label className="text-sm font-medium">Games per page</label>
								<p className="text-xs text-slate-400">Number of games to load at once</p>
							</div>
							<select
								value={settings.library.gamesPerPage}
								onChange={(e) => updateSetting('library', 'gamesPerPage', parseInt(e.target.value))}
								disabled={saving}
								className="bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
							>
								<option value="20">20</option>
								<option value="50">50</option>
								<option value="100">100</option>
							</select>
						</div>
					</div>
				</section>
				)}

				{!showingMovedSection && (
				<>
				{/* Downloads Settings */}
				<section className="mb-8 bg-slate-800/50 rounded-lg p-6 border border-slate-700">
					<h2 className="text-xl font-semibold mb-4 flex items-center">
						<svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
						</svg>
						Downloads
					</h2>

					<div className="space-y-4">
						<div>
							<label className="text-sm font-medium">General download path</label>
							<input
								type="text"
								value={downloadPathsForm.path}
								onChange={(e) => setDownloadPathsForm((prev) => ({ ...prev, path: e.target.value }))}
								disabled={saving}
								placeholder="C:\\Downloads\\WreckLauncher"
								className="mt-2 w-full bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
							/>
						</div>

						<div>
							<label className="text-sm font-medium">Pirate torrent download path</label>
							<input
								type="text"
								value={downloadPathsForm.pirateTorrentsPath}
								onChange={(e) => setDownloadPathsForm((prev) => ({ ...prev, pirateTorrentsPath: e.target.value }))}
								disabled={saving}
								placeholder="C:\\Downloads\\WreckLauncher\\Pirate Torrents"
								className="mt-2 w-full bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
							/>
						</div>

						<div className="flex justify-end">
							<button
								onClick={handleSaveDownloadPaths}
								disabled={saving || !canSaveDownloadPaths}
								className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
							>
								Save download paths
							</button>
						</div>
					</div>
				</section>

				{/* Account Settings */}
				<section className="mb-8 bg-slate-800/50 rounded-lg p-6 border border-slate-700">
					<h2 className="text-xl font-semibold mb-4 flex items-center">
						<svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
						</svg>
						Account & Platforms
					</h2>

					<div className="space-y-4">
						<div className="rounded-lg border border-slate-600 bg-slate-900/30 p-4">
							<div className="flex items-start justify-between gap-4 mb-4">
								<div>
									<p className="text-sm font-medium">Steam library sync</p>
									<p className="text-xs text-slate-400 mt-1">
										Enter your Steam login name and public profile link to import your owned games.
									</p>
								</div>
								<span className={`text-xs px-2 py-1 rounded-full ${
									steamSettings.connected ? 'bg-green-900/40 text-green-300 border border-green-700/60' : 'bg-slate-700 text-slate-300 border border-slate-600'
								}`}>
									{steamSettings.connected ? 'Connected' : 'Not connected'}
								</span>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<label className="block">
									<span className="text-sm font-medium">Steam login name</span>
									<input
										type="text"
										value={steamForm.username}
										onChange={(e) => setSteamForm((prev) => ({ ...prev, username: e.target.value }))}
										disabled={saving || steamBusy}
										placeholder="yoursteamname"
										className="mt-2 w-full bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
									/>
								</label>

								<label className="block">
									<span className="text-sm font-medium">Steam profile link</span>
									<input
										type="url"
										value={steamForm.profileLink}
										onChange={(e) => setSteamForm((prev) => ({ ...prev, profileLink: e.target.value }))}
										disabled={saving || steamBusy}
										placeholder="https://steamcommunity.com/id/yourname"
										className="mt-2 w-full bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
									/>
								</label>
							</div>

							<div className="flex items-center justify-between gap-4 mt-4">
								<p className="text-xs text-slate-400">
									{steamSettings.connected
										? `Connected as ${steamSettings.username || 'Steam user'}`
										: 'Your Steam profile must be public so owned games can be fetched.'}
								</p>
								<button
									onClick={handleSteamConnection}
									disabled={saving || steamBusy}
									className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
										steamSettings.connected
											? 'bg-slate-600 hover:bg-slate-500'
											: 'bg-blue-600 hover:bg-blue-700'
									}`}
								>
									{steamBusy ? 'Working...' : steamSettings.connected ? 'Disconnect Steam' : 'Connect Steam'}
								</button>
							</div>
						</div>

						<div className="rounded-lg border border-slate-600 bg-slate-900/30 p-4">
							<div className="flex items-start justify-between gap-4 mb-4">
								<div>
									<p className="text-sm font-medium">GOG account</p>
									<p className="text-xs text-slate-400 mt-1">Uses GOG OAuth and reads linked account data from the backend each load.</p>
								</div>
								<span className={`text-xs px-2 py-1 rounded-full ${
									gogSettings.connected ? 'bg-green-900/40 text-green-300 border border-green-700/60' : 'bg-slate-700 text-slate-300 border border-slate-600'
								}`}>
									{gogSettings.connected ? 'Connected' : 'Not connected'}
								</span>
							</div>

							<div className="flex flex-col gap-4 md:flex-row md:items-end">
								<label className="block flex-1">
									<span className="text-sm font-medium">GOG username</span>
									<input
										type="text"
										value={gogUsername}
										onChange={(e) => setGogUsername(e.target.value)}
										disabled={saving || gogBusy}
										placeholder="yourgogname"
										className="mt-2 w-full bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
									/>
								</label>

								<button
									onClick={handleGogConnection}
									disabled={saving || gogBusy}
									className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
										gogSettings.connected
											? 'bg-slate-600 hover:bg-slate-500'
											: 'bg-blue-600 hover:bg-blue-700'
									}`}
								>
									{gogBusy ? 'Working...' : gogSettings.connected ? 'Disconnect GOG' : 'Connect GOG'}
								</button>
							</div>

							<p className="mt-3 text-xs text-slate-400">
								OAuth status: {gogOAuthStatus.isLoggedIn ? 'logged in' : 'not logged in'}
								{gogOAuthStatus.hasToken ? ' (token available)' : ''}
							</p>
						</div>

						<div className="rounded-lg border border-slate-600 bg-slate-900/30 p-4">
							<div className="flex items-start justify-between gap-4 mb-4">
								<div>
									<p className="text-sm font-medium">Itch.io account</p>
									<p className="text-xs text-slate-400 mt-1">Uses existing itch OAuth handlers and reads linked account data from the backend each load.</p>
								</div>
								<span className={`text-xs px-2 py-1 rounded-full ${
									itchSettings.connected ? 'bg-green-900/40 text-green-300 border border-green-700/60' : 'bg-slate-700 text-slate-300 border border-slate-600'
								}`}>
									{itchSettings.connected ? 'Connected' : 'Not connected'}
								</span>
							</div>

							<div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
								<label className="block">
									<span className="text-sm font-medium">Itch.io username</span>
									<input
										type="text"
										value={itchUsername}
										onChange={(e) => setItchUsername(e.target.value)}
										disabled={saving || itchBusy}
										placeholder="youritchname"
										className="mt-2 w-full bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
									/>
								</label>

								<button
									onClick={handleItchConnection}
									disabled={saving || itchBusy}
									className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
										itchSettings.connected
											? 'bg-slate-600 hover:bg-slate-500'
											: 'bg-blue-600 hover:bg-blue-700'
									}`}
								>
									{itchBusy ? 'Working...' : itchSettings.connected ? 'Disconnect Itch.io' : 'Connect Itch.io'}
								</button>
							</div>

							<p className="mt-3 text-xs text-slate-400">
								OAuth status: {itchOAuthStatus.isLoggedIn ? 'logged in' : 'not logged in'}
								{itchOAuthStatus.hasToken ? ' (token available)' : ''}
							</p>
						</div>

					</div>
				</section>

				<section className="mb-8 bg-slate-800/50 rounded-lg p-6 border border-slate-700">
					<h2 className="text-xl font-semibold mb-4 flex items-center">
						<svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.121 17.804A13.937 13.937 0 0112 16c2.634 0 5.09.73 7.121 2.004M15 10a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
						Profile
					</h2>

					<div className="space-y-4">
						<div>
							<label className="text-sm font-medium">Profile picture URL</label>
							<input
								type="url"
								value={profileForm.avatarUrl}
								onChange={(e) => setProfileForm((prev) => ({ ...prev, avatarUrl: e.target.value }))}
								disabled={saving}
								placeholder="https://example.com/avatar.png"
								className="mt-2 w-full bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
							/>
						</div>

						<div>
							<label className="text-sm font-medium">Bio</label>
							<textarea
								rows={4}
								value={profileForm.bio}
								onChange={(e) => setProfileForm((prev) => ({ ...prev, bio: e.target.value }))}
								disabled={saving}
								placeholder="Write a short bio"
								className="mt-2 w-full bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500 resize-none"
							/>
						</div>

						<div className="flex justify-end">
							<button
								onClick={handleSaveProfile}
								disabled={saving}
								className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
							>
								Save profile
							</button>
						</div>
					</div>
				</section>
				</>
				)}

				{/* Advanced Settings */}
				{selectedSection === 'advanced' && (
				<section className="mb-8 bg-slate-800/50 rounded-lg p-6 border border-slate-700">
					<h2 className="text-xl font-semibold mb-4 flex items-center">
						<svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
						Advanced
					</h2>

					<div className="space-y-4">
						{/* Reset Settings */}
						<div className="flex items-center justify-between">
							<div>
								<label className="text-sm font-medium text-red-400">Reset all settings</label>
								<p className="text-xs text-slate-400">Restore default settings</p>
							</div>
							<button
								onClick={handleResetSettings}
								disabled={saving}
								className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
							>
								Reset
							</button>
						</div>
					</div>
				</section>
				)}

				{/* Footer Info */}
				<div className="text-center text-xs text-slate-500 mb-4">
					<p>WreckLauncher v1.0.0 • Settings are saved automatically</p>
				</div>
			</div>
		</div>
	);
};

export default SettingsPage;


