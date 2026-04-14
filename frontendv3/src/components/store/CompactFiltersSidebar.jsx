import React, { useState } from 'react';
import PriceRangeSlider from './PriceRangeSlider.jsx';

/**
 * Compact filters sidebar with quick genre buttons and collapsible sections
 */
const CompactFiltersSidebar = ({
	searchQuery = '',
	onSearchChange,
	selectedTags = [],
	onTagsChange,
	quickTags = [],
	advancedTags = [],
	selectedPlatforms = [],
	onPlatformsChange,
	priceRange = { min: 0, max: 100 },
	onPriceChange,
	onReset
}) => {
	const [platformsOpen, setPlatformsOpen] = useState(false);
	const [advancedOpen, setAdvancedOpen] = useState(false);

	// All platforms
	const platforms = [
		{ id: 'steam', name: 'Steam' },
		{ id: 'itchio', name: 'Itch.io' },
		{ id: 'gog', name: 'GOG' },
	];

	const handleTagToggle = (tagName) => {
		if (selectedTags.includes(tagName)) {
			onTagsChange(selectedTags.filter((tag) => tag !== tagName));
		} else {
			onTagsChange([...selectedTags, tagName]);
		}
	};

	const handlePlatformToggle = (platformId) => {
		if (selectedPlatforms.includes(platformId)) {
			onPlatformsChange(selectedPlatforms.filter(id => id !== platformId));
		} else {
			onPlatformsChange([...selectedPlatforms, platformId]);
		}
	};

	const hasActiveFilters = 
		searchQuery || 
		selectedTags.length > 0 || 
		selectedPlatforms.length > 0 || 
		priceRange.min > 0 || 
		priceRange.max < 100;

	return (
		<div className="w-80 bg-slate-800/40 backdrop-blur-sm rounded-lg border border-slate-700/50 sticky top-20 overflow-hidden flex flex-col max-h-[calc(100vh-100px)]">
			{/* Search bar */}
			<div className="p-4 border-b border-slate-700/50">
				<input
					type="text"
					value={searchQuery}
					onChange={(e) => onSearchChange(e.target.value)}
					placeholder="Search games..."
					className="w-full px-3 py-2 bg-slate-950/40 border border-slate-700/60 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500/50 text-sm"
				/>
			</div>

			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto scrollbar-thin">
				{/* Quick tag select */}
				<div className="p-4 border-b border-slate-700/50">
					<h3 className="text-sm font-semibold text-slate-100 mb-3">Top tags</h3>
					<div className="grid grid-cols-2 gap-2">
						{quickTags.map((tag) => (
							<button
								key={tag}
								onClick={() => handleTagToggle(tag)}
								className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
									selectedTags.includes(tag)
										? 'bg-blue-600 text-white'
										: 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
								}`}
							>
								{tag}
							</button>
						))}
					</div>
					{quickTags.length === 0 && (
						<p className="text-xs text-slate-400">No tags available yet.</p>
					)}
				</div>

				{/* Platforms dropdown */}
				<div className="border-b border-slate-700/50">
					<button
						onClick={() => setPlatformsOpen(!platformsOpen)}
						className="w-full px-4 py-3 flex items-center justify-between text-slate-100 hover:bg-slate-700/30 transition-colors"
					>
						<span className="text-sm font-semibold">Platforms</span>
						<svg
							className={`w-5 h-5 transition-transform ${platformsOpen ? 'rotate-180' : ''}`}
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					{platformsOpen && (
						<div className="px-4 pb-3 space-y-2">
							<button
								onClick={() => onPlatformsChange([])}
								className={`w-full px-3 py-2 rounded-lg text-sm text-left transition-all ${
									selectedPlatforms.length === 0
										? 'bg-blue-600 text-white'
										: 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
								}`}
							>
								All Platforms
							</button>
							{platforms.map(platform => (
								<label
									key={platform.id}
									className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-700/30 cursor-pointer transition-colors"
								>
									<input
										type="checkbox"
										checked={selectedPlatforms.includes(platform.id)}
										onChange={() => handlePlatformToggle(platform.id)}
										className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-slate-500 focus:ring-offset-slate-900 bg-slate-800/50"
									/>
									<span className="text-sm text-slate-300">{platform.name}</span>
								</label>
							))}
						</div>
					)}
				</div>

				{/* Advanced Filters dropdown */}
				<div>
					<button
						onClick={() => setAdvancedOpen(!advancedOpen)}
						className="w-full px-4 py-3 flex items-center justify-between text-slate-100 hover:bg-slate-700/30 transition-colors"
					>
						<span className="text-sm font-semibold">Advanced Filters</span>
						<svg
							className={`w-5 h-5 transition-transform ${advancedOpen ? 'rotate-180' : ''}`}
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
						</svg>
					</button>
					{advancedOpen && (
						<div className="px-4 pb-4">
							{advancedTags.length > 0 && (
								<div className="mb-4">
									<label className="block text-sm font-medium text-slate-300 mb-2">
										Other Tags
									</label>
									<div className="flex flex-wrap gap-2">
										{advancedTags.map((tag) => (
											<button
												key={tag}
												type="button"
												onClick={() => handleTagToggle(tag)}
												className={`px-2.5 py-1 rounded-md text-xs transition-all ${
													selectedTags.includes(tag)
														? 'bg-blue-600 text-white'
														: 'bg-slate-700/50 text-slate-300 hover:bg-slate-700'
												}`}
											>
												{tag}
											</button>
										))}
									</div>
								</div>
							)}
							{/* Price Range */}
							<div>
								<label className="block text-sm font-medium text-slate-300 mb-2">
									Price Range
								</label>
								<PriceRangeSlider
									min={0}
									max={100}
									value={priceRange}
									onChange={onPriceChange}
								/>
								<div className="flex justify-between mt-2 text-xs text-slate-400">
									<span>{priceRange.min}€</span>
									<span>{priceRange.max}€</span>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Reset button - only show when filters are active */}
			{hasActiveFilters && (
				<div className="p-4 border-t border-slate-700/50">
					<button
						onClick={onReset}
						className="w-full px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-200 rounded-lg text-sm font-medium transition-colors"
					>
						Reset Filters
					</button>
				</div>
			)}
		</div>
	);
};

export default CompactFiltersSidebar;
