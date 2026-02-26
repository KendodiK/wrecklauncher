// Alsó navigációs linkek (Store, Library, Downloads, Friends)
import React from 'react';

// handleNavClick: minden link kattintást kezeli, hogy egyedi navigate logikát használjunk
const NavLinks = ({ handleNavClick }) => {
	return (
		<nav className="ml-2 flex items-center gap-2 no-drag">
			<a
				href="/store"
				className="nav-item text-xs px-2 py-0.5 hover:bg-neutral-800 rounded no-drag"
				onClick={(e) => handleNavClick(e, '/store')}
			>
				Store
			</a>
						<a
				href="/library"
				className="nav-item text-xs px-2 py-0.5 hover:bg-neutral-800 rounded no-drag"
				onClick={(e) => handleNavClick(e, '/library')}
			>
				Library
			</a>
			<a
				href="/downloads"
				className="nav-item text-xs px-2 py-0.5 hover:bg-neutral-800 rounded no-drag"
				onClick={(e) => handleNavClick(e, '/downloads')}
			>
				Downloads
			</a>
			<a
				href="/friends"
				className="nav-item text-xs px-2 py-0.5 hover:bg-neutral-800 rounded no-drag"
				onClick={(e) => handleNavClick(e, '/friends')}
			>
				Friends
			</a>
		</nav>
	);
};

export default NavLinks;
