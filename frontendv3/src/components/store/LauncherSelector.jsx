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
			id: 'epic',
			name: 'Epic Games',
			color: 'from-slate-700 to-slate-900',
			hoverColor: 'hover:from-slate-600 hover:to-slate-800',
			icon: (
				<svg className="w-16 h-16" viewBox="0 0 24 24" fill="currentColor">
					<path d="M20.8 3.2L12 2 3.2 3.2 2 12l1.2 8.8L12 22l8.8-1.2L22 12l-1.2-8.8zM12 19c-3.9 0-7-3.1-7-7s3.1-7 7-7 7 3.1 7 7-3.1 7-7 7z"/>
					<path d="M12 8v4l3 3"/>
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
							shadow-lg hover:shadow-2xl hover:shadow-${launcher.id === 'steam' ? 'blue' : launcher.id === 'epic' ? 'slate' : 'purple'}-500/50
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

						{/* Shine effect on hover */}
						<div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-transparent via-white/0 to-white/0 group-hover:via-white/10 transition-all duration-300" />
					</button>
				))}
			</div>
		</div>
	);
};

export default LauncherSelector;
