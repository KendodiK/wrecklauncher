import React, { useState, useRef, useEffect } from 'react';

/**
 * Platform selector dropdown with checkboxes for multi-select
 */
const PlatformSelector = ({ platforms = [], selectedPlatforms = [], onSelectPlatforms }) => {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef(null);

	const defaultPlatforms = [
		{ id: 'steam', name: 'Steam' },
		{ id: 'epic', name: 'Epic Games' },
		{ id: 'gog', name: 'GOG' },
	];

	const displayPlatforms = platforms.length > 0 ? platforms : defaultPlatforms;

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener('mousedown', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, [isOpen]);

	const handleTogglePlatform = (platformId) => {
		const newSelected = selectedPlatforms.includes(platformId)
			? selectedPlatforms.filter(id => id !== platformId)
			: [...selectedPlatforms, platformId];
		
		onSelectPlatforms?.(newSelected);
	};

	const selectedCount = selectedPlatforms.length;
	const displayText = selectedCount === 0 
		? 'All Platforms' 
		: selectedCount === displayPlatforms.length
			? 'All Platforms'
			: `${selectedCount} selected`;

	return (
		<div className="relative" ref={dropdownRef}>
			{/* Dropdown button */}
			<button
				onClick={() => setIsOpen(!isOpen)}
				className="w-full px-3 py-2 bg-slate-950/40 border border-slate-700/60 rounded-lg text-slate-100 text-sm flex items-center justify-between hover:border-slate-600 transition-all focus:outline-none focus:ring-2 focus:ring-slate-500/50"
			>
				<span>{displayText}</span>
				<svg
					className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
				</svg>
			</button>

			{/* Dropdown menu */}
			{isOpen && (
				<div className="absolute top-full left-0 right-0 mt-2 bg-slate-900/95 border border-slate-700/60 rounded-lg shadow-xl z-50 backdrop-blur-sm">
					<div className="py-2">
						{displayPlatforms.map((platform) => (
							<label
								key={platform.id}
								className="flex items-center gap-3 px-3 py-2 hover:bg-slate-800/50 cursor-pointer transition-colors"
							>
								<input
									type="checkbox"
									checked={selectedPlatforms.includes(platform.id)}
									onChange={() => handleTogglePlatform(platform.id)}
									className="w-4 h-4 rounded border-slate-600 text-blue-500 focus:ring-slate-500 focus:ring-offset-slate-900 bg-slate-800/50 cursor-pointer"
								/>
								<span className="text-sm text-slate-300 flex-1">
									{platform.name}
								</span>
							</label>
						))}
					</div>
				</div>
			)}
		</div>
	);
};

export default PlatformSelector;
