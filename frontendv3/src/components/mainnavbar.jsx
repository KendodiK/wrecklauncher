// Fő felső navigációs sáv (Electron ablak címsor + app navigáció)
import React, { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UserArea from './navbar/UserArea.jsx';
import WindowControls from './navbar/WindowControls.jsx';
import NavArrows from './navbar/NavArrows.jsx';
import NavLinks from './navbar/NavLinks.jsx';

// Általános IPC hívás Electron felé (safe fallback több API-ra)
async function genericInvoke(channel) {
	try {
		if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.invoke === 'function') {
			return window.electronAPI.invoke(channel);
		}
		if (typeof window !== 'undefined' && window.api && typeof window.api.invoke === 'function') {
			return window.api.invoke(channel);
		}
	} catch (e) {
		// ignore
	}

	try {
		if (typeof window.require === 'function') {
			const { ipcRenderer } = window.require('electron');
			if (ipcRenderer && typeof ipcRenderer.invoke === 'function') {
				return ipcRenderer.invoke(channel);
			}
		}
	} catch (e) {
		// ignore
	}

	window.postMessage({ type: 'app:invoke', channel }, '*');
}

// Fő navbar komponens, kapja a bejelentkezett user-t és a kijelentkezés callback-et
const MainNavbar = ({ user, onLogout }) => {
	const navigate = useNavigate();

	// Ablak minimalizálása Electron API-n vagy fallback IPC-n keresztül
	const minimize = useCallback(() => {
		if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.minimize === 'function') {
			window.electronAPI.minimize();
		} else {
			genericInvoke('window:minimize');
		}
	}, []);

	// Ablak maximalizálása
	const maximize = useCallback(() => {
		if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.maximize === 'function') {
			window.electronAPI.maximize();
		} else {
			genericInvoke('window:maximize');
		}
	}, []);

	// Ablak bezárása
	const closeWindow = useCallback(() => {
		if (typeof window !== 'undefined' && window.electronAPI && typeof window.electronAPI.close === 'function') {
			window.electronAPI.close();
		} else {
			genericInvoke('window:close');
		}
	}, []);

	// Navigálás egy adott path-re (React Router)
	const navigateTo = useCallback((path) => {
		if (!path) return;
		navigate(path);
	}, [navigate]);

	// Vissza / előre navigálás az app history-ban
	const goBack = useCallback(() => {
		navigate(-1);
	}, [navigate]);

	const goForward = useCallback(() => {
		navigate(1);
	}, [navigate]);

	// Fő link kattintás kezelő: HTML hivatkozást saját navigációra cserélünk
	const handleNavClick = useCallback((event, path) => {
		event.preventDefault();
		navigateTo(path);
	}, [navigateTo]);

	// Komponens mount-kor kezeljük az Alt+F4-et
	useEffect(() => {
		const onKeyDown = (e) => {
			if (e.altKey && e.key === 'F4') {
				e.preventDefault();
				closeWindow();
			}
		};

		window.addEventListener('keydown', onKeyDown);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
		};
	}, [closeWindow]);

	return (
		<header className="main-navbar flex flex-col select-none">
			{/* Top strip: app title, user area, window controls */}
			<div className="flex items-center justify-between h-6 text-xs px-1">
				<div className="flex items-center gap-2 pl-1 no-drag">
					<span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Anchor Launcher</span>
				</div>

				<div className="flex items-center gap-1 no-drag">
					<UserArea user={user} onLogout={onLogout} />
					<WindowControls
						minimize={minimize}
						maximize={maximize}
						closeWindow={closeWindow}
					/>
				</div>
			</div>

			{/* Bottom strip: arrows + main navigation (all left-aligned) */}
			<div className="flex items-center justify-start h-6 text-xs px-2 gap-3">
				<NavArrows goBack={goBack} goForward={goForward} />
				<NavLinks handleNavClick={handleNavClick} />
			</div>
		</header>
	);
};

export default MainNavbar;

