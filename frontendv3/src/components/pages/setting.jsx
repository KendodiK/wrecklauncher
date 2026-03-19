import React, { useState, useEffect } from 'react';

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
			epic: { connected: false, username: '' },
			itch: { connected: false, username: '' },
		},
		syncFrequencyHours: 6,
	},
};

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

	for (const key of Object.keys(source)) {
		if (!(key in merged)) {
			merged[key] = source[key];
		}
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

const SettingsPage = () => {
	const [settings, setSettings] = useState(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [steamBusy, setSteamBusy] = useState(false);
	const [steamForm, setSteamForm] = useState({ username: '', profileLink: '' });
	const [profileForm, setProfileForm] = useState({ bio: '', avatarUrl: '' });
	const [message, setMessage] = useState({ type: '', text: '' });

	// Load settings on mount
	useEffect(() => {
		loadSettings();
	}, []);

	const loadSettings = async () => {
		try {
			setLoading(true);
			const data = await fetchSettingsWithRetry(window.electronAPI, 8, 150);
			const normalized = normalizeSettings(data);
			setSettings(normalized);
			setSteamForm({
				username: normalized?.account?.platforms?.steam?.username || '',
				profileLink: normalized?.account?.platforms?.steam?.profileLink || '',
			});
			setProfileForm({
				bio: normalized?.account?.profile?.bio || '',
				avatarUrl: normalized?.account?.profile?.avatarUrl || '',
			});
		} catch (error) {
			console.error('Failed to load settings:', error);
			const fallbackSettings = normalizeSettings(null);
			setSettings(fallbackSettings);
			setSteamForm({
				username: fallbackSettings.account.platforms.steam.username,
				profileLink: fallbackSettings.account.platforms.steam.profileLink,
			});
			setProfileForm({
				bio: fallbackSettings.account.profile.bio,
				avatarUrl: fallbackSettings.account.profile.avatarUrl,
			});
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
			setMessage({ type: 'success', text: 'Settings reset to defaults' });
		} catch (error) {
			console.error('Failed to reset settings:', error);
			setMessage({ type: 'error', text: 'Failed to reset settings' });
		} finally {
			setSaving(false);
		}
	};

	const handleClearCache = async () => {
		try {
			setSaving(true);
			await window.electronAPI.clearCache();
			setMessage({ type: 'success', text: 'Cache cleared' });
		} catch (error) {
			console.error('Failed to clear cache:', error);
			setMessage({ type: 'error', text: 'Failed to clear cache' });
		} finally {
			setSaving(false);
		}
	};

	const persistSteamSettings = async (connected, username, profileLink) => {
		try {
			const updated = await window.electronAPI.updateSettings({
				account: {
					platforms: {
						steam: {
							connected,
							username,
							profileLink,
						},
					},
				},
			});
			const normalized = normalizeSettings(updated);
			setSettings(normalized);
			return normalized;
		} catch (error) {
			if (!isMissingSettingsHandlerError(error, 'settings:update-bulk')) {
				throw error;
			}

			const localUpdated = normalizeSettings({
				...settings,
				account: {
					...(settings?.account || {}),
					platforms: {
						...(settings?.account?.platforms || {}),
						steam: {
							...(settings?.account?.platforms?.steam || {}),
							connected,
							username,
							profileLink,
						},
					},
				},
			});
			setSettings(localUpdated);
			setMessage({ type: 'error', text: 'Settings backend unavailable, Steam state kept locally' });
			return localUpdated;
		}
	};

	const handleSteamConnection = async () => {
		const steamSettings = settings?.account?.platforms?.steam;
		if (steamSettings?.connected) {
			try {
				setSteamBusy(true);
				await persistSteamSettings(false, '', '');
				setSteamForm({ username: '', profileLink: '' });
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
			await persistSteamSettings(true, username, profileLink);
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

	const handleSaveProfile = async () => {
		try {
			setSaving(true);
			const updated = await window.electronAPI.updateSettings({
				account: {
					profile: {
						bio: profileForm.bio.trim(),
						avatarUrl: profileForm.avatarUrl.trim(),
					},
				},
			});
			const normalized = normalizeSettings(updated);
			setSettings(normalized);
			setProfileForm({
				bio: normalized?.account?.profile?.bio || '',
				avatarUrl: normalized?.account?.profile?.avatarUrl || '',
			});
			setMessage({ type: 'success', text: 'Profile settings saved' });
			setTimeout(() => setMessage({ type: '', text: '' }), 2000);
		} catch (error) {
			console.error('Failed to save profile settings:', error);
			if (isMissingSettingsHandlerError(error, 'settings:update-bulk')) {
				const localUpdated = normalizeSettings({
					...settings,
					account: {
						...(settings?.account || {}),
						profile: {
							bio: profileForm.bio.trim(),
							avatarUrl: profileForm.avatarUrl.trim(),
						},
					},
				});
				setSettings(localUpdated);
				setMessage({ type: 'error', text: 'Settings backend unavailable, profile kept locally' });
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

	const steamSettings = settings.account.platforms.steam;

	return (
		<div className="flex-1 px-6 py-4 text-slate-100 overflow-y-auto">
			<div className="max-w-4xl mx-auto">
				<h1 className="text-3xl font-bold mb-2">Settings</h1>
				<p className="text-slate-400 mb-6">Customize your WreckLauncher experience</p>

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

				{/* Library Settings */}
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

				{/* Downloads Settings */}
				<section className="mb-8 bg-slate-800/50 rounded-lg p-6 border border-slate-700">
					<h2 className="text-xl font-semibold mb-4 flex items-center">
						<svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
						</svg>
						Downloads
					</h2>

					<div className="space-y-4">
						{/* Download Path */}
						<div className="flex items-center justify-between">
							<div className="flex-1 mr-4">
								<label className="text-sm font-medium">Download path</label>
								<p className="text-xs text-slate-400 mt-1 break-all">{settings.downloads.path}</p>
							</div>
							<button
								onClick={() => {
									// TODO: Implement file picker
									alert('File picker not yet implemented');
								}}
								disabled={saving}
								className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
							>
								Browse
							</button>
						</div>

						{/* Concurrent Downloads */}
						<div className="flex items-center justify-between">
							<div>
								<label className="text-sm font-medium">Concurrent downloads</label>
								<p className="text-xs text-slate-400">Max simultaneous downloads</p>
							</div>
							<select
								value={settings.downloads.concurrent}
								onChange={(e) => updateSetting('downloads', 'concurrent', parseInt(e.target.value))}
								disabled={saving}
								className="bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
							>
								<option value="1">1</option>
								<option value="2">2</option>
								<option value="3">3</option>
								<option value="4">4</option>
								<option value="5">5</option>
							</select>
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

						{/* Platform Connections */}
						{Object.entries(settings.account.platforms).filter(([platform]) => platform !== 'steam').map(([platform, data]) => (
							<div key={platform} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
								<div className="flex items-center">
									<div className={`w-10 h-10 rounded-lg flex items-center justify-center mr-3 ${
										data.connected ? 'bg-green-900/30 text-green-400' : 'bg-slate-700 text-slate-400'
									}`}>
										{platform.charAt(0).toUpperCase()}
									</div>
									<div>
										<p className="text-sm font-medium capitalize">{platform}</p>
										<p className="text-xs text-slate-400">
											{data.connected ? `Connected as ${data.username || 'User'}` : 'Not connected'}
										</p>
									</div>
								</div>
								<button
									onClick={() => {
										// TODO: Implement platform connection dialog
										alert(`${platform} connection dialog not yet implemented`);
									}}
									disabled={saving}
									className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
										data.connected
											? 'bg-slate-600 hover:bg-slate-500'
											: 'bg-blue-600 hover:bg-blue-700'
									}`}
								>
									{data.connected ? 'Disconnect' : 'Connect'}
								</button>
							</div>
						))}

						{/* Sync Frequency */}
						<div className="flex items-center justify-between mt-4">
							<div>
								<label className="text-sm font-medium">Sync frequency</label>
								<p className="text-xs text-slate-400">How often to sync owned games</p>
							</div>
							<select
								value={settings.account.syncFrequencyHours}
								onChange={(e) => updateSetting('account', 'syncFrequencyHours', parseInt(e.target.value))}
								disabled={saving}
								className="bg-slate-700 text-slate-100 px-4 py-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
							>
								<option value="1">Every hour</option>
								<option value="6">Every 6 hours</option>
								<option value="12">Every 12 hours</option>
								<option value="24">Every 24 hours</option>
							</select>
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

				{/* Advanced Settings */}
				<section className="mb-8 bg-slate-800/50 rounded-lg p-6 border border-slate-700">
					<h2 className="text-xl font-semibold mb-4 flex items-center">
						<svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
						</svg>
						Advanced
					</h2>

					<div className="space-y-4">
						{/* Clear Cache */}
						<div className="flex items-center justify-between">
							<div>
								<label className="text-sm font-medium">Clear cache</label>
								<p className="text-xs text-slate-400">Remove temporary files and cached data</p>
							</div>
							<button
								onClick={handleClearCache}
								disabled={saving}
								className="bg-slate-600 hover:bg-slate-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
							>
								Clear
							</button>
						</div>

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

				{/* Footer Info */}
				<div className="text-center text-xs text-slate-500 mb-4">
					<p>WreckLauncher v1.0.0 • Settings are saved automatically</p>
				</div>
			</div>
		</div>
	);
};

export default SettingsPage;


