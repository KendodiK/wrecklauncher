import React, { useMemo } from 'react';
import GameSliderStack from '../library/GameSliderStack.jsx';

const LibraryPage = () => {
	const games = useMemo(
		() =>
			[1, 2, 3, 4, 5, 6, 7].map((n) => ({
				id: `game-${n}`,
				image: `https://via.placeholder.com/300x420?text=Game+${n}`,
				title: `Game ${n}`,
			})),
		[]
	);

	const sources = useMemo(() => {
		return [
			{ id: 'steam', label: 'Steam', games },
			{
				id: 'epic',
				label: 'Epic',
				games: games.map((g) => ({
					...g,
					id: `epic-${g.id}`,
					title: `${g.title}`,
				})),
			},
		];
	}, [games]);

	return (
		<div className="flex-1 px-2 py-3 text-slate-100">
			<h1 className="text-2xl font-semibold mb-4">Library</h1>
			<GameSliderStack sources={sources} />
		</div>
	);
};

export default LibraryPage;

