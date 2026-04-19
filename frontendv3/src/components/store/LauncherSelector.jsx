import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Launcher selection component with 3 centered square buttons
 * Clicking navigates to a page filtered by that launcher
 */
const LauncherSelector = () => {
	const navigate = useNavigate();

	const launchers = [
		{
			id: 'steam',
			name: 'Steam',
			color: 'from-blue-600 to-blue-800',
			hoverColor: 'hover:from-blue-500 hover:to-blue-700',
			icon: (
				<svg className="w-16 h-16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
					<circle cx="12" cy="12" r="3"/>
					<path d="M12 7v2m0 6v2m5-7h-2m-6 0H7"/>
				</svg>
			)
		},
		{
			id: 'itchio',
			name: 'Itch.io',
			color: 'from-rose-600 to-rose-800',
			hoverColor: 'hover:from-rose-500 hover:to-rose-700',
			icon: (
				<svg className="w-16 h-16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M4.5 5.5h15a1.5 1.5 0 011.5 1.5v3.2c0 1.1-.6 2.1-1.6 2.6l-1.2.6v3.6a1.5 1.5 0 01-1.5 1.5h-1.7l-1.1-2.1a1 1 0 00-1.8 0L10 19h-1.7a1.5 1.5 0 01-1.5-1.5v-3.6l-1.2-.6A2.9 2.9 0 014 10.2V7a1.5 1.5 0 011.5-1.5zm3.3 4.2a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4zm8.4 0a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z"/>
				</svg>
			)
		},
		{
			id: 'gog',
			name: 'GOG',
			color: 'from-purple-600 to-purple-800',
			hoverColor: 'hover:from-purple-500 hover:to-purple-700',
			icon: (
				<svg className="w-16 h-16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M12 2L2 7v10l10 5 10-5V7l-10-5zm0 2.18L19.82 8 12 11.82 4.18 8 12 4.18zM4 9.5l7 3.5v7l-7-3.5v-7zm9 11v-7l7-3.5v7l-7 3.5z"/>
				</svg>
			)
		}
	];

	const handleLauncherClick = (launcherId) => {
		navigate(`/shop/platform/${launcherId}`);
	};

	return (
		<div className="w-full py-12">
			<h2 className="text-2xl font-semibold mb-8 text-center text-slate-100">
				Browse by Platform
			</h2>
			
			<div className="flex items-center justify-center gap-8">
				{launchers.map((launcher) => (
					<button
						key={launcher.id}
						onClick={() => handleLauncherClick(launcher.id)}
						className={`
							relative aspect-square w-48 rounded-2xl
							bg-gradient-to-br ${launcher.color}
							${launcher.hoverColor}
							border-2 border-slate-600/50 hover:border-slate-500
							transition-all duration-300
							transform hover:scale-105 hover:-translate-y-2
							shadow-lg hover:shadow-2xl hover:shadow-slate-900/70
							group
						`}
						aria-label={`Browse ${launcher.name} games`}
					>
						{/* Icon */}
						<div className="absolute inset-0 flex items-center justify-center text-white/80 group-hover:text-white transition-colors">
							{launcher.icon}
						</div>
						
						{/* Label */}
						<div className="absolute bottom-0 left-0 right-0 p-4 text-center">
							<span className="text-lg font-bold text-white drop-shadow-lg">
								{launcher.name}
							</span>
						</div>

						{/* No white shine overlay to keep artwork colors stable */}
					</button>
				))}
			</div>
		</div>
	);
};

export default LauncherSelector;
