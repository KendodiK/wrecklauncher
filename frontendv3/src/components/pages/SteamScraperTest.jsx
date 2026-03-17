import React, { useState, useEffect } from 'react';

const SteamScraperTest = () => {
	// State for hardcoded test
	const [hardcodedAppId] = useState(730); // CS2
	const [hardcodedData, setHardcodedData] = useState(null);
	const [hardcodedLoading, setHardcodedLoading] = useState(false);
	const [hardcodedError, setHardcodedError] = useState('');

	// State for database-sourced test
	const [dbGames, setDbGames] = useState([]);
	const [selectedDbAppId, setSelectedDbAppId] = useState('');
	const [dbSourcedData, setDbSourcedData] = useState(null);
	const [dbSourcedLoading, setDbSourcedLoading] = useState(false);
	const [dbSourcedError, setDbSourcedError] = useState('');

	// Load games from database on mount
	useEffect(() => {
		const loadDbGames = async () => {
			try {
				const api = window.electronAPI;
				if (!api) return;

				// Fetch some sample games from database (you'll need to implement this endpoint)
				// For now, we'll use hardcoded IDs that might be in the database
				setDbGames([
					{ app_id: '730', name: 'Counter-Strike 2' },
					{ app_id: '570', name: 'Dota 2' },
					{ app_id: '440', name: 'Team Fortress 2' },
					{ app_id: '271590', name: 'GTA V' },
					{ app_id: '1086940', name: 'Baldur\'s Gate 3' },
				]);
			} catch (e) {
				console.error('Failed to load games from database:', e);
			}
		};

		loadDbGames();
	}, []);

	// Test scraper with hardcoded app ID
	const testHardcodedScraper = async () => {
		setHardcodedLoading(true);
		setHardcodedError('');
		setHardcodedData(null);

		try {
			const api = window.electronAPI;
			if (!api || !api.getSteamGameDetails) {
				throw new Error('Steam API not available');
			}

			console.log(`\n========== TESTING HARDCODED APP ID: ${hardcodedAppId} ==========`);
			const data = await api.getSteamGameDetails(hardcodedAppId, 'us');
			
			console.log('Received Data:', data);
			setHardcodedData(data);
		} catch (e) {
			console.error('Hardcoded test error:', e);
			setHardcodedError(e.message || String(e));
		} finally {
			setHardcodedLoading(false);
		}
	};

	// Test scraper with database-sourced app ID
	const testDbSourcedScraper = async () => {
		if (!selectedDbAppId) {
			setDbSourcedError('Please select a game first');
			return;
		}

		setDbSourcedLoading(true);
		setDbSourcedError('');
		setDbSourcedData(null);

		try {
			const api = window.electronAPI;
			if (!api) {
				throw new Error('Electron API not available');
			}

			// First, fetch from database
			console.log(`\n========== FETCHING FROM DATABASE: ${selectedDbAppId} ==========`);
			let dbData = null;
			try {
				dbData = await api.getAllDetailsByID(Number(selectedDbAppId));
				console.log('Database Data:', dbData);
			} catch (e) {
				console.warn('Failed to fetch from database:', e);
			}

			// Then scrape from Steam using the app_id
			console.log(`\n========== SCRAPING FROM STEAM: ${selectedDbAppId} ==========`);
			if (!api.getSteamGameDetails) {
				throw new Error('Steam API not available');
			}

			const steamData = await api.getSteamGameDetails(Number(selectedDbAppId), 'us');
			console.log('Steam Data:', steamData);

			setDbSourcedData({
				database: dbData,
				steam: steamData,
			});
		} catch (e) {
			console.error('Database-sourced test error:', e);
			setDbSourcedError(e.message || String(e));
		} finally {
			setDbSourcedLoading(false);
		}
	};

	return (
		<div className="flex-1 px-4 py-6 text-slate-100">
			<div className="mb-6">
				<h1 className="text-3xl font-bold text-slate-100 mb-2">Steam Scraper Test Page</h1>
				<p className="text-slate-400 text-sm">Test the Steam API scraper with different data sources</p>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
				{/* Left: Hardcoded App ID Test */}
				<div className="rounded-xl border border-slate-700/60 bg-slate-900/40 backdrop-blur p-5">
					<h2 className="text-xl font-semibold text-emerald-400 mb-4">
						🔧 Hardcoded App ID Test
					</h2>
					<p className="text-sm text-slate-300 mb-4">
						Tests the scraper with a hardcoded Steam App ID (Counter-Strike 2: {hardcodedAppId})
					</p>

					<button
						onClick={testHardcodedScraper}
						disabled={hardcodedLoading}
						className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
					>
						{hardcodedLoading ? (
							<>
								<div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
								<span>Scraping...</span>
							</>
						) : (
							<>
								<span>🌐</span>
								<span>Scrape Steam Data</span>
							</>
						)}
					</button>

					{hardcodedError && (
						<div className="mt-4 p-3 bg-rose-950/40 border border-rose-500/50 rounded-lg text-rose-300 text-sm">
							<strong>Error:</strong> {hardcodedError}
						</div>
					)}

					{hardcodedData && (
						<div className="mt-4 space-y-3">
							<div className="p-3 bg-slate-950/50 rounded-lg">
								<div className="text-xs text-slate-400 mb-1">Name</div>
								<div className="text-sm text-slate-100 font-medium">{hardcodedData.name || 'N/A'}</div>
							</div>
							<div className="p-3 bg-slate-950/50 rounded-lg">
								<div className="text-xs text-slate-400 mb-1">App ID</div>
								<div className="text-sm text-slate-100">{hardcodedData.appid || 'N/A'}</div>
							</div>
							<div className="p-3 bg-slate-950/50 rounded-lg">
								<div className="text-xs text-slate-400 mb-1">Price</div>
								<div className="text-sm text-slate-100">
									{hardcodedData.price_overview ? `$${(hardcodedData.price_overview / 100).toFixed(2)}` : 'Free/N/A'}
								</div>
							</div>
							<div className="p-3 bg-slate-950/50 rounded-lg">
								<div className="text-xs text-slate-400 mb-1">Genres</div>
								<div className="text-sm text-slate-100">
									{hardcodedData.genres?.map(g => g.description).join(', ') || 'N/A'}
								</div>
							</div>
							<div className="p-3 bg-slate-950/50 rounded-lg">
								<div className="text-xs text-slate-400 mb-1">Screenshots</div>
								<div className="text-sm text-slate-100">
									{hardcodedData.raw?.screenshots?.length || 0} found
								</div>
							</div>
							<details className="p-3 bg-slate-950/50 rounded-lg">
								<summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-300">
									View Full JSON Response
								</summary>
								<pre className="mt-2 text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap">
									{JSON.stringify(hardcodedData, null, 2)}
								</pre>
							</details>
						</div>
					)}
				</div>

				{/* Right: Database-Sourced App ID Test */}
				<div className="rounded-xl border border-slate-700/60 bg-slate-900/40 backdrop-blur p-5">
					<h2 className="text-xl font-semibold text-blue-400 mb-4">
						💾 Database-Sourced Test
					</h2>
					<p className="text-sm text-slate-300 mb-4">
						Select a game from the database and scrape its Steam data
					</p>

					<div className="mb-4">
						<label className="block text-xs text-slate-400 mb-2">Select Game from Database</label>
						<select
							value={selectedDbAppId}
							onChange={(e) => setSelectedDbAppId(e.target.value)}
							className="w-full px-3 py-2 bg-slate-950/50 border border-slate-700 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-blue-500"
						>
							<option value="">-- Select a game --</option>
							{dbGames.map((game) => (
								<option key={game.app_id} value={game.app_id}>
									{game.name} (ID: {game.app_id})
								</option>
							))}
						</select>
					</div>

					<button
						onClick={testDbSourcedScraper}
						disabled={dbSourcedLoading || !selectedDbAppId}
						className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
					>
						{dbSourcedLoading ? (
							<>
								<div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
								<span>Scraping...</span>
							</>
						) : (
							<>
								<span>🔍</span>
								<span>Fetch & Scrape</span>
							</>
						)}
					</button>

					{dbSourcedError && (
						<div className="mt-4 p-3 bg-rose-950/40 border border-rose-500/50 rounded-lg text-rose-300 text-sm">
							<strong>Error:</strong> {dbSourcedError}
						</div>
					)}

					{dbSourcedData && (
						<div className="mt-4 space-y-3">
							{/* Database Data */}
							{dbSourcedData.database && (
								<details className="p-3 bg-slate-950/50 rounded-lg" open>
									<summary className="text-xs text-blue-400 cursor-pointer hover:text-blue-300 font-semibold mb-2">
										📊 Database Data
									</summary>
									<div className="space-y-2 mt-2">
										<div>
											<div className="text-xs text-slate-500">Name</div>
											<div className="text-sm text-slate-200">{dbSourcedData.database.name || 'N/A'}</div>
										</div>
										<div>
											<div className="text-xs text-slate-500">Description</div>
											<div className="text-sm text-slate-200">{dbSourcedData.database.description?.slice(0, 100) + '...' || 'N/A'}</div>
										</div>
										<details>
											<summary className="text-xs text-slate-400 cursor-pointer">Full JSON</summary>
											<pre className="mt-2 text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap">
												{JSON.stringify(dbSourcedData.database, null, 2)}
											</pre>
										</details>
									</div>
								</details>
							)}

							{/* Steam Data */}
							{dbSourcedData.steam && (
								<details className="p-3 bg-slate-950/50 rounded-lg" open>
									<summary className="text-xs text-emerald-400 cursor-pointer hover:text-emerald-300 font-semibold mb-2">
										🌐 Steam Scraped Data
									</summary>
									<div className="space-y-2 mt-2">
										<div>
											<div className="text-xs text-slate-500">Name</div>
											<div className="text-sm text-slate-200">{dbSourcedData.steam.name || 'N/A'}</div>
										</div>
										<div>
											<div className="text-xs text-slate-500">Price</div>
											<div className="text-sm text-slate-200">
												{dbSourcedData.steam.price_overview ? `$${(dbSourcedData.steam.price_overview / 100).toFixed(2)}` : 'Free/N/A'}
											</div>
										</div>
										<div>
											<div className="text-xs text-slate-500">Screenshots</div>
											<div className="text-sm text-slate-200">{dbSourcedData.steam.raw?.screenshots?.length || 0}</div>
										</div>
										<div>
											<div className="text-xs text-slate-500">Genres</div>
											<div className="text-sm text-slate-200">
												{dbSourcedData.steam.genres?.map(g => g.description).join(', ') || 'N/A'}
											</div>
										</div>
										<details>
											<summary className="text-xs text-slate-400 cursor-pointer">Full JSON</summary>
											<pre className="mt-2 text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap">
												{JSON.stringify(dbSourcedData.steam, null, 2)}
											</pre>
										</details>
									</div>
								</details>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Console Output Reminder */}
			<div className="mt-6 p-4 bg-amber-950/20 border border-amber-500/30 rounded-lg">
				<div className="flex items-start gap-3">
					<span className="text-2xl">💡</span>
					<div>
						<div className="font-semibold text-amber-400 mb-1">Check Terminal Output</div>
						<p className="text-sm text-slate-300">
							Open your Electron terminal (where you ran <code className="px-1 py-0.5 bg-slate-900/50 rounded text-amber-300">npm start</code>) 
							and your browser DevTools console to see detailed logging of the scraping process.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
};

export default SteamScraperTest;
