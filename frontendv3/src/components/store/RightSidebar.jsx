import React, { useState, useEffect, useRef } from 'react';
import PriceRangeSlider from './PriceRangeSlider.jsx';
import PlatformSelector from './PlatformSelector.jsx';

/**
 * Right sidebar component with genre tabs, search, and advanced filters
 * Always visible, fixed width on the right side of the screen
 */
const RightSidebar = ({ 
	genres = [], 
	onFiltersChange,
	className = '' 
}) => {
	const [searchQuery, setSearchQuery] = useState('');
	const [selectedGenres, setSelectedGenres] = useState([]);
	const [activeGenreTab, setActiveGenreTab] = useState(null);
	const [selectedPlatforms, setSelectedPlatforms] = useState([]);
	const [priceRange, setPriceRange] = useState({ min: 0, max: 100 });
	const [genreSearch, setGenreSearch] = useState('');
	const [showAdvanced, setShowAdvanced] = useState(false);
	const searchInputRef = useRef(null);
	const searchTimeoutRef = useRef(null);

	// Mock genres if none provided (for development)
	const displayGenres = genres.length > 0 ? genres : [
		{ id: 1, name: 'Action' },
		{ id: 2, name: 'Adventure' },
		{ id: 3, name: 'RPG' },
		{ id: 4, name: 'Strategy' },
		{ id: 5, name: 'Simulation' },
		{ id: 6, name: 'Sports' },
		{ id: 7, name: 'Racing' },
		{ id: 8, name: 'Horror' },
		{ id: 9, name: 'Puzzle' },
		{ id: 10, name: 'Indie' },
	];

	const filteredGenres = displayGenres.filter((g) =>
		g.name.toLowerCase().includes(genreSearch.toLowerCase())
	);

	// Debounced search handler (300ms)
	const handleSearchChange = (e) => {
		const value = e.target.value;
		setSearchQuery(value);

		// Clear existing timeout
		if (searchTimeoutRef.current) {
			clearTimeout(searchTimeoutRef.current);
		}

		// Set new timeout for debounced update
		searchTimeoutRef.current = setTimeout(() => {
			notifyFiltersChange(value, selectedGenres, selectedPlatforms, priceRange);
		}, 300);
	};

	const handleClearSearch = () => {
		setSearchQuery('');
		notifyFiltersChange('', selectedGenres, selectedPlatforms, priceRange);
		searchInputRef.current?.focus();
	};

	const handleGenreTabClick = (genreId) => {
		// Toggle genre tab
		if (activeGenreTab === genreId) {
			setActiveGenreTab(null);
			setSelectedGenres([]);
			notifyFiltersChange(searchQuery, [], selectedPlatforms, priceRange);
		} else {
			setActiveGenreTab(genreId);
			setSelectedGenres([genreId]);
			notifyFiltersChange(searchQuery, [genreId], selectedPlatforms, priceRange);
		}
	};

	const handleGenreCheckbox = (genreId) => {
		let newSelected;
		if (selectedGenres.includes(genreId)) {
			newSelected = selectedGenres.filter(id => id !== genreId);
		} else {
			newSelected = [...selectedGenres, genreId];
		}
		
		setSelectedGenres(newSelected);
		setActiveGenreTab(newSelected.length === 1 ? newSelected[0] : null);
		notifyFiltersChange(searchQuery, newSelected, selectedPlatforms, priceRange);
	};

	const handlePlatformsSelect = (platforms) => {
		setSelectedPlatforms(platforms);
		notifyFiltersChange(searchQuery, selectedGenres, platforms, priceRange);
	};

	const handlePriceChange = (newRange) => {
		setPriceRange(newRange);
		notifyFiltersChange(searchQuery, selectedGenres, selectedPlatforms, newRange);
	};

	const notifyFiltersChange = (query, genres, platforms, price) => {
		onFiltersChange?.({
			query,
			genres,
			platforms,
			priceRange: price,
		});
	};

	const handleResetFilters = () => {
		setSearchQuery('');
		setSelectedGenres([]);
		setActiveGenreTab(null);
		setSelectedPlatforms([]);
		setPriceRange({ min: 0, max: 100 });
		setGenreSearch('');
		notifyFiltersChange('', [], [], { min: 0, max: 100 });
	};

	const hasActiveFilters = searchQuery !== '' || selectedGenres.length > 0 || selectedPlatforms.length > 0 || priceRange.min > 0 || priceRange.max < 100;

	return (
		<div className={`fixed right-0 top-[73px] h-[calc(100vh-73px)] w-80 bg-slate-900/95 backdrop-blur-sm border-l border-slate-700/60 flex flex-col overflow-hidden ${className}`}>
			{/* Header */}
			<div className="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
				<h2 className="text-lg font-semibold text-slate-100">Filters</h2>
				{hasActiveFilters && (
					<button
						onClick={handleResetFilters}
						className="text-xs text-slate-400 hover:text-slate-200 transition-colors px-2 py-1 rounded hover:bg-slate-800/50"
					>
						Reset
					</button>
				)}
			</div>

			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto">
				{/* Search bar */}
				<div className="px-4 py-4 border-b border-slate-700/40">
					<label className="block text-sm font-medium text-slate-300 mb-2">
						Search by name
					</label>
					<div className="relative">
						<input
							ref={searchInputRef}
							type="text"
							value={searchQuery}
							onChange={handleSearchChange}
							placeholder="Search games..."
							className="w-full px-3 py-2 pl-9 pr-9 bg-slate-950/40 border border-slate-700/60 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/50 focus:border-slate-500 transition-all text-sm"
						/>
						
						{/* Search icon */}
						<svg
							className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>

						{/* Clear button */}
						{searchQuery && (
							<button
								onClick={handleClearSearch}
								className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300 transition-colors rounded hover:bg-slate-800/50"
							>
								<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						)}
					</div>
				</div>

				{/* Genre tabs - horizontal scrollable */}
				<div className="px-4 py-4 border-b border-slate-700/40">
					<label className="block text-sm font-medium text-slate-300 mb-3">
						Quick genre select
					</label>
					<div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800/50">
						{displayGenres.map((genre) => (
							<button
								key={genre.id}
								onClick={() => handleGenreTabClick(genre.id)}
								className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex-shrink-0 ${
									activeGenreTab === genre.id
										? 'bg-slate-300 text-slate-900 shadow-lg'
										: 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/70 border border-slate-700/60'
								}`}
							>
								{genre.name}
							</button>
						))}
					</div>
				</div>
			{/* Platform Selector */}
			<div className="px-4 py-4 border-b border-slate-700/40">
				<label className="block text-sm font-medium text-slate-300 mb-3">
					Platforms
				</label>
				<PlatformSelector 
					selectedPlatforms={selectedPlatforms}
					onSelectPlatforms={handlePlatformsSelect}
				/>
			</div>
				{/* Advanced filters - collapsible */}
				<div className="px-4 py-4">
					<button
						onClick={() => setShowAdvanced(!showAdvanced)}
						className="flex items-center justify-between w-full text-sm font-medium text-slate-300 mb-3 hover:text-slate-100 transition-colors"
					>
						<span>Advanced Filters</span>
						<svg
							className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`}
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
						</svg>
					</button>

					{showAdvanced && (
						<div className="space-y-4">
							{/* Price range slider */}
							<div>
								<label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
									Price Range
								</label>
								<PriceRangeSlider
									min={0}
									max={100}
									value={priceRange}
									onChange={handlePriceChange}
								/>
							</div>
							{/* Genre checkboxes (multi-select) */}
							<div>
								<label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wide">
									Genres (multi-select)
								</label>
								{/* Local search for genres */}
								<div className="mb-2">
									<input
										type="text"
										value={genreSearch}
										onChange={(e) => setGenreSearch(e.target.value)}
										placeholder="Search genres..."
										className="w-full px-3 py-2 bg-slate-950/40 border border-slate-700/60 rounded text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/50 focus:border-slate-500"
									/>
								</div>
								<div className="space-y-2 max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-800/50">
									{filteredGenres.map((genre) => (
										<label
											key={genre.id}
											className="flex items-center gap-2 cursor-pointer group"
										>
											<input
												type="checkbox"
												checked={selectedGenres.includes(genre.id)}
												onChange={() => handleGenreCheckbox(genre.id)}
												className="w-4 h-4 rounded border-slate-600 text-slate-300 focus:ring-slate-500 focus:ring-offset-slate-900 bg-slate-800/50 cursor-pointer"
											/>
											<span className="text-sm text-slate-300 group-hover:text-slate-100 transition-colors">
												{genre.name}
											</span>
										</label>
									))}
								</div>
							</div>


						</div>
					)}
				</div>
			</div>

			{/* Footer info */}
			<div className="px-4 py-3 border-t border-slate-700/40 bg-slate-950/50">
				<p className="text-xs text-slate-500 text-center">
					{hasActiveFilters ? (
						<>
							<span className="text-slate-300 font-medium">{selectedGenres.length}</span> genre{selectedGenres.length !== 1 ? 's' : ''} selected
						</>
					) : (
						'No filters applied'
					)}
				</p>
			</div>
		</div>
	);
};

export default RightSidebar;
