// Alsó navigációs linkek (Store, Library, Downloads, Friends)
import React from 'react';

const iconClassName = 'h-3.5 w-3.5 text-slate-300';

const icons = {
	store: (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true">
			<path d="M4 9h16l-1 11H5L4 9Z" />
			<path d="M8 9V7a4 4 0 0 1 8 0v2" />
		</svg>
	),
	library: (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true">
			<path d="M4 5h3v14H4zM10 5h3v14h-3zM16 5h4v14h-4z" />
		</svg>
	),
	downloads: (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true">
			<path d="M12 4v10" />
			<path d="m8 10 4 4 4-4" />
			<path d="M4 20h16" />
		</svg>
	),
	friends: (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true">
			<circle cx="9" cy="8" r="3" />
			<circle cx="17" cy="9" r="2.5" />
			<path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
			<path d="M14.5 19a4 4 0 0 1 6 0" />
		</svg>
	),
	profile: (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={iconClassName} aria-hidden="true">
			<circle cx="12" cy="8" r="3.5" />
			<path d="M5 20a7 7 0 0 1 14 0" />
		</svg>
	)
};

// handleNavClick: minden link kattintást kezeli, hogy egyedi navigate logikát használjunk
const NavLinks = ({ handleNavClick }) => {
	return (
		<nav className="ml-2 flex items-center gap-2 no-drag">
			<a
				href="/store"
				className="nav-item text-xs px-2 py-0.5 hover:bg-neutral-800 rounded no-drag inline-flex items-center gap-1.5"
				onClick={(e) => handleNavClick(e, '/store')}
			>
				{icons.store}
				<span>Store</span>
			</a>
					
			<a
				href="/library"
				className="nav-item text-xs px-2 py-0.5 hover:bg-neutral-800 rounded no-drag inline-flex items-center gap-1.5"
				onClick={(e) => handleNavClick(e, '/library')}
			>
				{icons.library}
				<span>Library</span>
			</a>
			<a
				href="/downloads"
				className="nav-item text-xs px-2 py-0.5 hover:bg-neutral-800 rounded no-drag inline-flex items-center gap-1.5"
				onClick={(e) => handleNavClick(e, '/downloads')}
			>
				{icons.downloads}
				<span>Downloads</span>
			</a>
			<a
				href="/friends"
				className="nav-item text-xs px-2 py-0.5 hover:bg-neutral-800 rounded no-drag inline-flex items-center gap-1.5"
				onClick={(e) => handleNavClick(e, '/friends')}
			>
				{icons.friends}
				<span>Friends</span>
			</a>
			<a
				href="/profile"
				className="nav-item text-xs px-2 py-0.5 hover:bg-neutral-800 rounded no-drag inline-flex items-center gap-1.5"
				onClick={(e) => handleNavClick(e, '/profile')}
			>
				{icons.profile}
				<span>Profile</span>
			</a>
		</nav>
	);
};

export default NavLinks;
