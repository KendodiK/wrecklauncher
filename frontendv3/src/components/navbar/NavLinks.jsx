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
	),
	search:(
		<svg fill="#ffffff" height="14px" width="14px" version="1.1" id="Capa_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" 
	 viewBox="0 0 451 451" xml:space="preserve">
<g>
	<path d="M447.05,428l-109.6-109.6c29.4-33.8,47.2-77.9,47.2-126.1C384.65,86.2,298.35,0,192.35,0C86.25,0,0.05,86.3,0.05,192.3
		s86.3,192.3,192.3,192.3c48.2,0,92.3-17.8,126.1-47.2L428.05,447c2.6,2.6,6.1,4,9.5,4s6.9-1.3,9.5-4
		C452.25,441.8,452.25,433.2,447.05,428z M26.95,192.3c0-91.2,74.2-165.3,165.3-165.3c91.2,0,165.3,74.2,165.3,165.3
		s-74.1,165.4-165.3,165.4C101.15,357.7,26.95,283.5,26.95,192.3z"/>
</g>
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
				<a href="/search" className="nav-item text-xs px-2 py-0.5 hover:bg-neutral-800 rounded no-drag inline-flex items-center gap-1.5"
				onClick={(e) => handleNavClick(e, '/search')}>
					{icons.search}
					<span>Search</span>
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
