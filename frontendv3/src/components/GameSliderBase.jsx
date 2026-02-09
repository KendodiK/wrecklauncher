import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

// Base slider: structure + JavaScript behavior. Styling/animation is injected via props.
// games: optional array of { id, image, title }
const GameSliderBase = ({
	games,
	topVh = 0,
	activeOffsetPx = 200,
	cloneCount: cloneCountProp = 5,
	// Styling hooks (wrapper supplies CSS classnames)
	classNameWrapper = '',
	classNameCarousel = '',
	classNameContainer = '',
	classNameCard = '',
	classNameCardActive = '',
	// Animation hooks (wrapper supplies timing; easing is controlled here)
	transitionMs = 300,
}) => {
	const carouselRef = useRef(null);
	const containerRef = useRef(null);
	const shouldReduceMotion = useReducedMotion();
	const [isMoving, setIsMoving] = useState(false);
	const skipAnimationRef = useRef(false);
	const resizeRafRef = useRef(0);
	const wheelLockRef = useRef(false);
	const [x, setX] = useState(0);
	const xRef = useRef(0);

	const baseCards = useMemo(() => {
		const source = (games && games.length
			? games
			: [1, 2, 3, 4, 5, 6, 7].map((n) => ({
				id: n,
				image: `https://via.placeholder.com/300x420?text=${n}`,
				title: `Game ${n}`,
			})))
			.map((g, index) => ({
				id: g.id ?? index,
				image: g.image,
				title: g.title ?? `Game ${index + 1}`,
			}));

		return source;
	}, [games]);

	const cloneCount = useMemo(() => {
		if (!baseCards.length) return 0;
		return Math.max(0, Math.min(cloneCountProp, baseCards.length));
	}, [baseCards.length, cloneCountProp]);

	const initialIndex = useMemo(() => {
		if (!baseCards.length) return 0;
		return cloneCount + Math.floor(baseCards.length / 2);
	}, [baseCards.length, cloneCount]);

	const [currentIndex, setCurrentIndex] = useState(initialIndex);

	const cards = useMemo(() => {
		if (!baseCards.length) return [];
		if (!cloneCount) {
			return baseCards.map((c, i) => ({ ...c, _key: `base-${c.id ?? i}` }));
		}

		const head = baseCards.slice(0, cloneCount).map((c, i) => ({
			...c,
			_key: `clone-post-${c.id ?? i}-${i}`,
		}));
		const tail = baseCards.slice(-cloneCount).map((c, i) => ({
			...c,
			_key: `clone-pre-${c.id ?? i}-${i}`,
		}));

		return [
			...tail,
			...baseCards.map((c, i) => ({ ...c, _key: `base-${c.id ?? i}` })),
			...head,
		];
	}, [baseCards, cloneCount]);

	if (!cards.length) return null;

	const move = (dir) => {
		if (isMoving) return;
		setIsMoving(true);
		setCurrentIndex((prev) => prev + dir);
	};

	const handleCardClick = (index) => {
		if (isMoving) return;
		setIsMoving(true);
		setCurrentIndex(index);
	};

	const recenter = useCallback(
		(animate = true) => {
			const container = containerRef.current;
			const carousel = carouselRef.current;
			if (!container || !carousel) return;
			if (!cards.length) return;

			const allCards = container.children;
			const activeCard = allCards[currentIndex];
			if (!activeCard) return;

			const viewportWidth = carousel.offsetWidth;
			const contentWidth = container.scrollWidth;
			if (!viewportWidth || !contentWidth) return;

			// If all cards fit, just center the whole row (prevents it translating off-screen).
			if (contentWidth <= viewportWidth) {
				const offset = Math.round((viewportWidth - contentWidth) / 2);
				if (xRef.current !== offset) {
					xRef.current = offset;
					setX(offset);
				}
				return;
			}

			const viewportCenter = viewportWidth / 2;
			const cardCenter = activeCard.offsetLeft + activeCard.offsetWidth / 2;
			let offset = (viewportCenter - cardCenter) - activeOffsetPx;

			// Clamp so the list never scrolls out of view.
			const maxOffset = 0;
			const minOffset = Math.min(0, viewportWidth - contentWidth);
			offset = Math.max(minOffset, Math.min(maxOffset, offset));

			offset = Math.round(offset);
			if (xRef.current !== offset) {
				xRef.current = offset;
				setX(offset);
			}
		},
		[activeOffsetPx, cards.length, currentIndex]
	);

	// Layout update: place active card + toggle active class
	useLayoutEffect(() => {
		recenter(!skipAnimationRef.current);
		skipAnimationRef.current = false;
	}, [currentIndex, cards.length, recenter]);

	// After the move animation finishes, reset edge positions for seamless looping.
	useEffect(() => {
		if (!isMoving) return;
		const baseLen = baseCards.length;
		if (!baseLen) return;

		const timer = setTimeout(() => {
			setIsMoving(false);

			let next = currentIndex;
			const start = cloneCount;
			const end = cloneCount + baseLen;
			if (next >= end) next = next - baseLen;
			if (next < start) next = next + baseLen;

			if (next !== currentIndex) {
				skipAnimationRef.current = true;
				setCurrentIndex(next);
			}
		}, Math.max(0, transitionMs + 10));

		return () => clearTimeout(timer);
	}, [isMoving, currentIndex, cloneCount, baseCards.length, transitionMs]);

	// Recenter when the carousel area changes size (e.g., dropdown opens, window resizes).
	useEffect(() => {
		const carousel = carouselRef.current;
		if (!carousel) return;

		const ro = new ResizeObserver(() => {
			if (resizeRafRef.current) return;
			resizeRafRef.current = requestAnimationFrame(() => {
				resizeRafRef.current = 0;
				recenter(false);
			});
		});
		ro.observe(carousel);
		return () => {
			ro.disconnect();
			if (resizeRafRef.current) {
				cancelAnimationFrame(resizeRafRef.current);
				resizeRafRef.current = 0;
			}
		};
	}, [cards.length, currentIndex, recenter]);

	// If the game list changes, jump to the new middle without animating.
	useEffect(() => {
		if (!baseCards.length) return;
		skipAnimationRef.current = true;
		setCurrentIndex(initialIndex);
	}, [initialIndex, baseCards.length]);

	const onKeyDown = (e) => {
		if (e.key === 'ArrowRight') move(1);
		if (e.key === 'ArrowLeft') move(-1);
	};

	const onWheel = (e) => {
		// Treat mouse wheel as left/right navigation.
		// Prevent page scroll while the cursor is over the carousel.
		e.preventDefault();
		e.stopPropagation();
		if (wheelLockRef.current) return;
		if (isMoving) return;

		const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
		if (Math.abs(delta) < 4) return;

		wheelLockRef.current = true;
		move(delta > 0 ? 1 : -1);
		setTimeout(() => {
			wheelLockRef.current = false;
		}, 120);
	};

	return (
		<div className={classNameWrapper} style={topVh ? { marginTop: `${topVh}vh` } : undefined}>
			<div
				ref={carouselRef}
				className={classNameCarousel}
				tabIndex={0}
				onKeyDown={onKeyDown}
				onWheel={onWheel}
			>
				<motion.ul
					ref={containerRef}
					className={classNameContainer}
					initial={false}
					animate={{ x }}
					transition={
						!shouldReduceMotion && !skipAnimationRef.current
							? { duration: Math.max(0, transitionMs) / 1000, ease: [0.2, 0.8, 0.2, 1] }
							: { duration: 0 }
					}
				>
					{cards.map((card, index) => (
						<li
							key={card._key ?? card.id}
							className={`${classNameCard} ${index === currentIndex ? classNameCardActive : ''}`.trim()}
							onClick={() => handleCardClick(index)}
						>
							<img
								src={card.image}
								alt={card.title}
								decoding="async"
								loading={Math.abs(index - currentIndex) <= 2 ? 'eager' : 'lazy'}
								fetchPriority={index === currentIndex ? 'high' : 'auto'}
							/>
						</li>
					))}
				</motion.ul>
			</div>
		</div>
	);
};

export default GameSliderBase;
