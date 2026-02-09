import React, { useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

const DEFAULT_ITEMS = Array.from({ length: 9 }).map((_, i) => {
	const n = i + 1;
	return {
		id: `shop-${n}`,
		title: `Featured Game ${n}`,
		image: `https://via.placeholder.com/440x640?text=Featured+${n}`,
	};
});

function wrapIndex(index, length) {
	if (!length) return 0;
	return ((index % length) + length) % length;
}

// Returns shortest signed distance from active -> index in a circular list.
function circularOffset(index, active, length) {
	if (!length) return 0;
	let d = index - active;
	const half = length / 2;
	if (d > half) d -= length;
	if (d < -half) d += length;
	return d;
}

const Shopveiw = ({ items }) => {
	const shouldReduceMotion = useReducedMotion();
	const cards = useMemo(() => (items && items.length ? items : DEFAULT_ITEMS), [items]);
	const [active, setActive] = useState(() => Math.min(2, Math.max(0, Math.floor(cards.length / 2))));

	const next = () => setActive((prev) => wrapIndex(prev + 1, cards.length));
	const prev = () => setActive((prev) => wrapIndex(prev - 1, cards.length));

	const onKeyDown = (e) => {
		if (e.key === 'ArrowRight') next();
		else if (e.key === 'ArrowLeft') prev();
	};

	const transition = shouldReduceMotion
		? { duration: 0 }
		: { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 };

	return (
		<div className="flex-1 px-3 py-4">
			<h1 className="text-2xl font-semibold mb-4">Shop</h1>

			<section className="carousel" tabIndex={0} onKeyDown={onKeyDown} aria-label="Shop carousel">
				<button type="button" className="prev" onClick={prev} aria-label="Previous">
					‹
				</button>

				<ul className="cards">
					{cards.map((card, index) => {
						const offset = circularOffset(index, active, cards.length);

						// Map the old CSS-class approach (active-center/left/right/etc)
						// to explicit Motion transforms.
						const visible = Math.abs(offset) <= 3;
						const dir = Math.sign(offset);
						const abs = Math.abs(offset);

						let x = 0;
						let scale = 1;
						let opacity = 1;
						let y = 0;
						let zIndex = 10;
						let blur = 0;

						if (abs === 0) {
							x = 0;
							scale = 1;
							opacity = 1;
							y = 0;
							zIndex = 10;
							blur = 0;
						} else if (abs === 1) {
							x = dir * 220;
							scale = 0.92;
							opacity = 0.75;
							y = 10;
							zIndex = 8;
							blur = 0.5;
						} else if (abs === 2) {
							x = dir * 380;
							scale = 0.84;
							opacity = 0.38;
							y = 18;
							zIndex = 6;
							blur = 1.2;
						} else if (abs === 3) {
							x = dir * 520;
							scale = 0.78;
							opacity = 0;
							y = 24;
							zIndex = 4;
							blur = 2;
						}

						return (
							<motion.li
								key={card.id ?? index}
								className={"shop-card" + (offset === 0 ? ' shop-card-active' : '')}
								initial={false}
								animate={{
									x,
									y,
									scale,
									opacity: visible ? opacity : 0,
									filter: shouldReduceMotion ? 'none' : `blur(${blur}px)`,
								}}
								transition={transition}
								style={{ zIndex, pointerEvents: visible ? 'auto' : 'none' }}
								onClick={() => setActive(index)}
								role="button"
								tabIndex={-1}
								aria-label={card.title}
							>
								<img src={card.image} alt={card.title} loading={abs <= 1 ? 'eager' : 'lazy'} />
								<div className="shop-card-title">{card.title}</div>
							</motion.li>
						);
					})}
				</ul>

				<button type="button" className="next" onClick={next} aria-label="Next">
					›
				</button>
			</section>
		</div>
	);
};

export default Shopveiw;
