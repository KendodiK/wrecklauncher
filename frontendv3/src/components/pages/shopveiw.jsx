import React, { useMemo } from 'react';
import Storeslider from '../Storeslider.jsx';

const DEFAULT_ITEMS = Array.from({ length: 9 }).map((_, i) => {
	const n = i + 1;
	return {
		id: `shop-${n}`,
		title: `Featured Game ${n}`,
		image: `https://via.placeholder.com/440x640?text=Featured+${n}`,
	};
});

const Shopveiw = ({ items }) => {
	const cards = useMemo(() => (items && items.length ? items : DEFAULT_ITEMS), [items]);

	return (
		<div className="flex-1 px-3 py-4">
			<h1 className="text-2xl font-semibold mb-4">Shop</h1>

			<Storeslider items={cards} />
		</div>
	);
};

export default Shopveiw;
