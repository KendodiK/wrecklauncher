import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

// Base slider: structure + JavaScript behavior. Styling/animation is injected via props.
// games: optional array of { id, image, title }
const GameSliderBase = ({
	mode = 'translate',
	games,
	topVh = 0,
	activeOffsetPx = 200,
	cloneCount: cloneCountProp = 5,
	ariaLabel,
	onActivateCard,
	onCardClick,
	onCurrentCardChange,
	// Styling hooks (wrapper supplies CSS classnames)
	classNameWrapper = '',
	classNameCarousel = '',
	classNameContainer = '',
	classNameCard = '',
	classNameCardActive = '',
	// Render hooks
	renderBeforeContainer,
	renderAfterContainer,
	renderCard,
	// Stack-mode animation hook
	getStackMotion,
	stackMotionTransition,
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
	
	// Drag state
	const dragStartX = useRef(0);
	const dragCurrentX = useRef(0);
	const isDragging = useRef(false);

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
	const activeCardIdRef = useRef(null);

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
		// Call onCardClick callback if provided (e.g., for scroll-into-view)
		if (typeof onCardClick === 'function') {
			onCardClick(cards[index], { index });
		}
		setIsMoving(true);
		setCurrentIndex(index);
	};

	const recenter = useCallback(
		(animate = true) => {
			if (mode !== 'translate') return;
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
		[activeOffsetPx, cards.length, currentIndex, mode]
	);

	// Layout update: place active card + toggle active class
	useLayoutEffect(() => {
		if (mode !== 'translate') return;
		recenter(!skipAnimationRef.current);
		skipAnimationRef.current = false;
	}, [currentIndex, cards.length, recenter, mode]);

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
		if (mode !== 'translate') return;
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
	}, [cards.length, currentIndex, recenter, mode]);

	// If the game list changes (e.g. load-more), keep the same active card when possible.
	useEffect(() => {
		if (!baseCards.length) return;

		const activeId = activeCardIdRef.current;
		if (activeId == null) {
			skipAnimationRef.current = true;
			setCurrentIndex(initialIndex);
			return;
		}

		const nextBaseIndex = baseCards.findIndex((card) => String(card?.id) === String(activeId));
		if (nextBaseIndex < 0) {
			skipAnimationRef.current = true;
			setCurrentIndex(initialIndex);
			return;
		}

		const nextIndex = cloneCount + nextBaseIndex;
		setCurrentIndex((prev) => (prev === nextIndex ? prev : nextIndex));
	}, [baseCards, cloneCount, initialIndex]);

	useEffect(() => {
		if (typeof onCurrentCardChange !== 'function') return;
		const card = cards[currentIndex];
		if (!card) return;
		activeCardIdRef.current = card.id;
		onCurrentCardChange(card, { index: currentIndex });
	}, [cards, currentIndex, onCurrentCardChange]);

	const onKeyDown = (e) => {
		if (e.key === 'ArrowRight') move(1);
		if (e.key === 'ArrowLeft') move(-1);
		if (e.key === 'Tab') {
			if (e.shiftKey) {
				e.preventDefault();
				move(-1);
			} else {
				e.preventDefault();
				move(1);
			}
		}
		if (e.key === 'Enter') {
			if (typeof onActivateCard !== 'function') return;
			const card = cards[currentIndex];
			if (!card) return;
			e.preventDefault?.();
			e.stopPropagation?.();
			onActivateCard(card, { index: currentIndex });
		}
	};

	// Native non-passive wheel handler to reliably block vertical page scroll while hovering.
	useEffect(() => {
		const el = carouselRef.current;
		if (!el) return;

		const handler = (e) => {
			// Treat mouse wheel/trackpad as left/right navigation.
			// Prevent page scroll while the cursor is over the carousel.
			if (e.cancelable) e.preventDefault();
			e.stopPropagation();
			if (wheelLockRef.current) return;
			if (isMoving) return;

			const dx = e.deltaX ?? 0;
			const dy = e.deltaY ?? 0;
			const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
			if (Math.abs(delta) < 4) return;

			wheelLockRef.current = true;
			move(delta > 0 ? 1 : -1);
			setTimeout(() => {
				wheelLockRef.current = false;
			}, 120);
		};

		el.addEventListener('wheel', handler, { passive: false });
		return () => el.removeEventListener('wheel', handler, { passive: false });
	}, [isMoving]);

	// Drag handlers for mouse drag navigation
	useEffect(() => {
		const el = carouselRef.current;
		if (!el) return;

		const handleMouseDown = (e) => {
			isDragging.current = true;
			dragStartX.current = e.clientX;
			dragCurrentX.current = e.clientX;
			el.style.cursor = 'grabbing';
		};

		const handleMouseMove = (e) => {
			if (!isDragging.current) return;
			dragCurrentX.current = e.clientX;
		};

		const handleMouseUp = () => {
			if (!isDragging.current) return;
			isDragging.current = false;
			el.style.cursor = 'grab';

			const dragDistance = dragStartX.current - dragCurrentX.current;
			const threshold = 50; // minimum drag distance to trigger move

			if (Math.abs(dragDistance) > threshold && !isMoving) {
				move(dragDistance > 0 ? 1 : -1);
			}
		};

		const handleMouseLeave = () => {
			if (isDragging.current) {
				isDragging.current = false;
				el.style.cursor = 'grab';
			}
		};

		el.style.cursor = 'grab';
		el.addEventListener('mousedown', handleMouseDown);
		window.addEventListener('mousemove', handleMouseMove);
		window.addEventListener('mouseup', handleMouseUp);
		el.addEventListener('mouseleave', handleMouseLeave);

		return () => {
			el.style.cursor = '';
			el.removeEventListener('mousedown', handleMouseDown);
			window.removeEventListener('mousemove', handleMouseMove);
			window.removeEventListener('mouseup', handleMouseUp);
			el.removeEventListener('mouseleave', handleMouseLeave);
		};
	}, [isMoving]);

	const effectiveRenderCard = renderCard
		? renderCard
		: ({ card }) => (
			<img
				src={card.image}
				alt={card.title}
				decoding="async"
				loading="lazy"
			/>
		);

	const stackTransition = useMemo(() => {
		if (shouldReduceMotion || skipAnimationRef.current) return { duration: 0 };
		if (stackMotionTransition) return stackMotionTransition;
		return { duration: Math.max(0, transitionMs) / 1000, ease: [0.2, 0.8, 0.2, 1] };
	}, [shouldReduceMotion, stackMotionTransition, transitionMs]);

	return (
		<div className={classNameWrapper} style={topVh ? { marginTop: `${topVh}vh` } : undefined}>
			<div
				ref={carouselRef}
				className={classNameCarousel}
				tabIndex={0}
				aria-label={ariaLabel}
				onKeyDown={onKeyDown}
			>
				{typeof renderBeforeContainer === 'function' ? renderBeforeContainer({ move }) : null}

				{mode === 'stack' ? (
					<ul ref={containerRef} className={classNameContainer}>
						{cards.map((card, index) => {
							const offset = index - currentIndex;
							const abs = Math.abs(offset);
							const dir = offset === 0 ? 0 : offset > 0 ? 1 : -1;

							const stack = typeof getStackMotion === 'function'
								? getStackMotion({ offset, abs, dir, index, currentIndex, card })
								: { visible: abs <= 3, style: undefined, animate: undefined };

							if (stack && stack.visible === false) return null;

							return (
								<motion.li
									key={card._key ?? card.id}
									className={`${classNameCard} ${index === currentIndex ? classNameCardActive : ''}`.trim()}
									style={stack?.style}
									initial={false}
									animate={stack?.animate}
									transition={stackTransition}
									onClick={() => handleCardClick(index)}
									onDoubleClick={() => {
										if (typeof onActivateCard !== 'function') return;
										onActivateCard(card, { index });
									}}
								>
									{effectiveRenderCard({
										card,
										offset,
										abs,
										dir,
										index,
										currentIndex,
										classNameCardActive,
									})}
								</motion.li>
							);
						})}
					</ul>
				) : (
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
								onDoubleClick={() => {
									if (typeof onActivateCard !== 'function') return;
									onActivateCard(card, { index });
								}}
							>
								{effectiveRenderCard({
									card,
									offset: index - currentIndex,
									abs: Math.abs(index - currentIndex),
									dir: index === currentIndex ? 0 : index > currentIndex ? 1 : -1,
									index,
									currentIndex,
									classNameCardActive,
								})}
							</li>
						))}
					</motion.ul>
				)}

				{typeof renderAfterContainer === 'function' ? renderAfterContainer({ move }) : null}
			</div>
		</div>
	);
};

export default GameSliderBase;
