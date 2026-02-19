import React, { useEffect, useMemo } from 'react';
import Storeslider from '../Storeslider.jsx';
import { runSmokeControllers } from '../../smokeControllers.js';

function steamPoster(appid) {
	const id = Number(appid);
	if (!Number.isFinite(id) || id <= 0) return null;
	return `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
}

const DEFAULT_STEAM_APPIDS = [
	570, // Dota 2
	730, // CS2
	440, // TF2
	271590, // GTA V
	578080, // PUBG
	1174180, // Red Dead Redemption 2
	1245620, // ELDEN RING
	359550, // Rainbow Six Siege
	1086940, // Baldur's Gate 3
];

const DEFAULT_ITEMS = Array.from({ length: 9 }).map((_, i) => {
	const n = i + 1;
	const appid = DEFAULT_STEAM_APPIDS[i] ?? null;
	return {
		id: appid,
		appid: appid,
		title: `Featured Game ${n}`,
		image: steamPoster(appid) || `https://via.placeholder.com/440x640?text=Featured+${n}`,
	};
});

const Shopveiw = ({ items }) => {
	const cards = useMemo(() => (items && items.length ? items : DEFAULT_ITEMS), [items]);

	useEffect(() => {
		if (!import.meta.env.DEV) return;
		runSmokeControllers().catch((err) => {
			console.warn('[smoke] runSmokeControllers failed:', err);
		});
	}, []);
	
	return (
		<div className="flex-1 px-3 py-4">
			<h1 className="text-2xl font-semibold mb-4">Shop</h1>

			<Storeslider items={cards} />
		</div>
	);
};

export default Shopveiw;
