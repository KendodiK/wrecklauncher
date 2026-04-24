import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

function buildInlineSliderPlaceholder(title) {
	const raw = String(title || 'Game').trim() || 'Game';
	const safeLabel = raw
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
		.slice(0, 24);

	const svg = [
		'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="420" viewBox="0 0 300 420">',
		'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">',
		'<stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/>',
		'</linearGradient></defs>',
		'<rect width="300" height="420" fill="url(#g)"/>',
		'<rect x="18" y="18" width="264" height="384" rx="16" fill="none" stroke="#334155" stroke-width="2"/>',
		'<text x="150" y="212" text-anchor="middle" fill="#e2e8f0" font-size="20" font-family="Segoe UI, Arial, sans-serif" font-weight="700">Game</text>',
		`<text x="150" y="244" text-anchor="middle" fill="#94a3b8" font-size="14" font-family="Segoe UI, Arial, sans-serif">${safeLabel}</text>`,
		'</svg>',
	].join('');

	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Base slider: structure + JavaScript behavior. Styling/animation is injected via props.
// games: optional array of { id, image, title }
const GameSliderBase = ({
	mode = 'translate',
	games,
	showFallbackCards = true,
	topVh = 0,
	activeOffsetPx = 200,
	cloneCount: cloneCountProp = 5,
	loop = true,
	ariaLabel,
	selectedCardId,
	onActivateCard,
	onCardClick,
	onCurrentCardChange,
	advanceOnActiveClick = false,
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
	transition,
	transitionMs = 300,
}) => {
	const carouselRef = useRef(null);
	const containerRef = useRef(null);
	const shouldReduceMotion = useReducedMotion();
	const [isMoving, setIsMoving] = useState(false);
	const skipAnimationRef = useRef(false);
	const lastEmittedCurrentCardRef = useRef('');
	const suppressCurrentCardEmitRef = useRef(false);
	const emitCurrentCardOnIndexChangeRef = useRef(false);
	const resizeRafRef = useRef(0);
	const wheelLockRef = useRef(false);
	const xRef = useRef(0);
	
	// Drag state
	const dragStartX = useRef(0);
	const dragCurrentX = useRef(0);
	const isDragging = useRef(false);
	const touchStartXRef = useRef(0);
	const touchCurrentXRef = useRef(0);
	const isTouchDraggingRef = useRef(false);

	const baseCards = useMemo(() => {
		const fallbackCards = showFallbackCards
			? [1, 2, 3, 4, 5, 6, 7].map((n) => ({
				id: n,
				image: buildInlineSliderPlaceholder(String(n)),
				title: `Game ${n}`,
			}))
			: [];

		const source = (games && games.length
			? games
			: fallbackCards)
			.map((g, index) => {
				const card = g && typeof g === 'object' ? g : { id: g };
				const title = card.title ?? card.name ?? `Game ${index + 1}`;
				const image =
					typeof (card.image ?? card.banner_img) === 'string' && String(card.image ?? card.banner_img).trim()
						? String(card.image ?? card.banner_img).trim()
						: buildInlineSliderPlaceholder(title);
				return {
					...card,
					id: card.id ?? card.appid ?? card.app_id ?? card.game_id ?? index,
					image,
					title,
				};
			});

		return source;
	}, [games, showFallbackCards]);

	// Stable identity for card composition/order to avoid resetting internal loop state
	// when parent passes a new array instance with the same ids.
	const baseCardsKey = useMemo(
		() => baseCards.map((card) => String(card?.id ?? '')).join('|'),
		[baseCards],
	);
	const baseCardsRef = useRef(baseCards);
	useLayoutEffect(() => {
		baseCardsRef.current = baseCards;
	}, [baseCards]);

	const hasLoopClones = loop && baseCards.length > 1;
	const useProceduralLoop = mode === 'translate' && hasLoopClones;
	const [effectiveLoopCloneCount, setEffectiveLoopCloneCount] = useState(() => Math.max(1, cloneCountProp));

	useEffect(() => {
		const minimumCloneCount = Math.max(1, cloneCountProp);
		setEffectiveLoopCloneCount((prev) => (prev === minimumCloneCount ? prev : minimumCloneCount));
	}, [cloneCountProp]);

	const createProceduralEntry = useCallback(
		(ordinal) => {
			const source = baseCardsRef.current;
			const baseLen = source.length;
			if (!baseLen) return null;
			const baseIndex = ((ordinal % baseLen) + baseLen) % baseLen;
			const card = source[baseIndex];
			return {
				...card,
				_key: `stream-${ordinal}`,
				_baseIndex: baseIndex,
				_streamOrdinal: ordinal,
			};
		},
		[],
	);

	const initialIndex = useMemo(() => {
		const baseLen = baseCards.length;
		if (!baseLen) return 0;
		if (useProceduralLoop) return Math.max(1, effectiveLoopCloneCount) + Math.floor(baseLen / 2);
		if (!hasLoopClones) return Math.floor(baseLen / 2);
		return Math.max(1, effectiveLoopCloneCount) + Math.floor(baseLen / 2);
	}, [baseCards.length, effectiveLoopCloneCount, hasLoopClones, useProceduralLoop]);

	const [streamCards, setStreamCards] = useState([]);
	const [currentIndex, setCurrentIndex] = useState(initialIndex);

	useLayoutEffect(() => {
		if (!useProceduralLoop) {
			setStreamCards((prev) => (prev.length ? [] : prev));
			return;
		}

		const baseLen = baseCards.length;
		if (!baseLen) {
			setStreamCards([]);
			return;
		}

		const side = Math.max(1, effectiveLoopCloneCount);
		const startOrdinal = -side;
		const count = baseLen + (side * 2);
		const nextStreamCards = Array.from({ length: count }, (_, offset) => createProceduralEntry(startOrdinal + offset)).filter(Boolean);

		skipAnimationRef.current = true;
		setStreamCards(nextStreamCards);
		suppressCurrentCardEmitRef.current = true;
		setCurrentIndex(side + Math.floor(baseLen / 2));
	}, [baseCardsKey, baseCards.length, createProceduralEntry, effectiveLoopCloneCount, useProceduralLoop]);

	const cards = useMemo(() => {
		if (!baseCards.length) return [];

		if (useProceduralLoop) {
			if (streamCards.length > 0) {
				// Keep stream ordinals/keys stable for infinite-loop behavior,
				// but always hydrate visual fields (image/title/metadata) from
				// the latest base card data so background image refreshes also
				// update the smaller strip cards immediately.
				return streamCards.map((entry) => {
					const baseIndex = Number(entry?._baseIndex);
					if (!Number.isFinite(baseIndex) || baseIndex < 0 || baseIndex >= baseCards.length) {
						return entry;
					}

					const latestBaseCard = baseCards[baseIndex];
					if (!latestBaseCard || typeof latestBaseCard !== 'object') {
						return entry;
					}

					return {
						...latestBaseCard,
						_key: entry._key,
						_baseIndex: entry._baseIndex,
						_streamOrdinal: entry._streamOrdinal,
					};
				});
			}

			const side = Math.max(1, effectiveLoopCloneCount);
			const startOrdinal = -side;
			const count = baseCards.length + (side * 2);
			return Array.from({ length: count }, (_, offset) => createProceduralEntry(startOrdinal + offset)).filter(Boolean);
		}

		if (!hasLoopClones) {
			return baseCards.map((c, i) => ({ ...c, _key: `base-${c.id ?? i}` }));
		}

		const baseLen = baseCards.length;
		const cloneCount = Math.max(1, effectiveLoopCloneCount);
		const tailStartIndex = ((baseLen - (cloneCount % baseLen)) + baseLen) % baseLen;

		const tail = Array.from({ length: cloneCount }, (_, cloneIndex) => {
			const baseIndex = (tailStartIndex + cloneIndex) % baseLen;
			const card = baseCards[baseIndex];
			return {
				...card,
				_key: `clone-pre-${cloneIndex}-${card.id ?? baseIndex}`,
				_isClone: true,
				_baseIndex: baseIndex,
			};
		});

		const head = Array.from({ length: cloneCount }, (_, cloneIndex) => {
			const baseIndex = cloneIndex % baseLen;
			const card = baseCards[baseIndex];
			return {
				...card,
				_key: `clone-post-${cloneIndex}-${card.id ?? baseIndex}`,
				_isClone: true,
				_baseIndex: baseIndex,
			};
		});

		return [
			...tail,
			...baseCards.map((card, index) => ({
				...card,
				_key: `base-${card.id ?? index}`,
				_baseIndex: index,
			})),
			...head,
		];
	}, [baseCards, createProceduralEntry, effectiveLoopCloneCount, hasLoopClones, streamCards, useProceduralLoop]);

	if (!cards.length) return null;

	useLayoutEffect(() => {
		if (selectedCardId == null || selectedCardId === '') return;

		const normalizedSelectedId = String(selectedCardId);
		const source = cards;
		if (!Array.isArray(source) || source.length < 1) return;
		const safeCurrentIndex = Math.max(0, Math.min(source.length - 1, currentIndex));
		if (String(source[safeCurrentIndex]?.id ?? '') === normalizedSelectedId) return;

		const matchingIndices = [];
		for (let index = 0; index < source.length; index += 1) {
			if (String(source[index]?.id ?? '') !== normalizedSelectedId) continue;
			matchingIndices.push(index);
		}

		if (matchingIndices.length < 1) return;

		const isCanonicalMatch = (entry) => {
			if (!entry || typeof entry !== 'object') return false;
			if (useProceduralLoop) {
				const ordinal = Number(entry._streamOrdinal);
				return Number.isFinite(ordinal) && ordinal >= 0 && ordinal < baseCards.length;
			}
			if (hasLoopClones) {
				return entry._isClone !== true;
			}
			return true;
		};

		const canonicalIndices = matchingIndices.filter((index) => isCanonicalMatch(source[index]));
		const candidateIndices = canonicalIndices.length > 0 ? canonicalIndices : matchingIndices;

		let targetIndex = -1;
		let minDistance = Number.POSITIVE_INFINITY;
		for (const index of candidateIndices) {
			const distance = Math.abs(index - safeCurrentIndex);
			if (distance < minDistance) {
				minDistance = distance;
				targetIndex = index;
			}
		}

		if (targetIndex < 0 || targetIndex === safeCurrentIndex) return;
		skipAnimationRef.current = true;
		suppressCurrentCardEmitRef.current = true;
		emitCurrentCardOnIndexChangeRef.current = false;
		setCurrentIndex(targetIndex);
	}, [cards, currentIndex, selectedCardId]);

	const move = (dir) => {
		if (isMoving) return;
		if (cards.length < 2) return;
		if (useProceduralLoop) {
			const next = Math.max(0, Math.min(cards.length - 1, currentIndex + dir));
			if (next === currentIndex) return;
			emitCurrentCardOnIndexChangeRef.current = true;
			setIsMoving(true);
			setCurrentIndex(next);
			return;
		}
		if (!hasLoopClones) {
			const next = Math.max(0, Math.min(cards.length - 1, currentIndex + dir));
			if (next === currentIndex) return;
			emitCurrentCardOnIndexChangeRef.current = true;
			setIsMoving(true);
			setCurrentIndex(next);
			return;
		}
		emitCurrentCardOnIndexChangeRef.current = true;
		setIsMoving(true);
		setCurrentIndex((prev) => prev + dir);
	};

	const focusCarousel = useCallback(() => {
		const node = carouselRef.current;
		if (!node || typeof node.focus !== 'function') return;
		node.focus({ preventScroll: true });
	}, []);

	const handleCardClick = (index) => {
		if (isMoving) return;
		if (index === currentIndex) {
			if (advanceOnActiveClick) {
				move(1);
			}
			return;
		}
		// Call onCardClick callback if provided (e.g., for scroll-into-view)
		if (typeof onCardClick === 'function') {
			onCardClick(cards[index], { index });
		}
		emitCurrentCardOnIndexChangeRef.current = true;
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
					const shouldAnimate = animate && !shouldReduceMotion && !skipAnimationRef.current && transitionMs > 0;
					const transitionValue = String(transition || '').trim();
					const resolvedTransition = transitionValue || `transform ${Math.max(0, transitionMs)}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
					container.style.transition = shouldAnimate
						? resolvedTransition
						: 'none';
					container.style.transform = `translate3d(${offset}px, 0, 0)`;
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
				const shouldAnimate = animate && !shouldReduceMotion && !skipAnimationRef.current && transitionMs > 0;
				const transitionValue = String(transition || '').trim();
				const resolvedTransition = transitionValue || `transform ${Math.max(0, transitionMs)}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
				container.style.transition = shouldAnimate
					? resolvedTransition
					: 'none';
				container.style.transform = `translate3d(${offset}px, 0, 0)`;
			}
		},
		[activeOffsetPx, cards.length, currentIndex, mode, shouldReduceMotion, transition, transitionMs]
	);

	// Layout update: place active card + toggle active class
	useLayoutEffect(() => {
		if (mode !== 'translate') return;
		recenter(!skipAnimationRef.current);
		skipAnimationRef.current = false;
	}, [currentIndex, cards.length, recenter, mode]);

	// Unlock the movement guard after the current animation frame finishes.
	useEffect(() => {
		if (!isMoving) return;

		const timer = setTimeout(() => {
			if (useProceduralLoop) {
				const baseLen = baseCards.length;
				if (!baseLen || !cards.length) {
					setIsMoving(false);
					return;
				}

				const side = Math.max(1, effectiveLoopCloneCount);
				const extendThreshold = Math.max(2, side);
				let nextCards = cards;
				let nextIndex = currentIndex;
				let changed = false;

				if (nextIndex <= extendThreshold) {
					const firstOrdinal = Number(nextCards[0]?._streamOrdinal ?? 0);
					const prepend = Array.from({ length: baseLen }, (_, offset) => createProceduralEntry(firstOrdinal - baseLen + offset)).filter(Boolean);
					if (prepend.length > 0) {
						nextCards = [...prepend, ...nextCards];
						nextIndex += prepend.length;
						changed = true;
					}
				}

				if ((nextCards.length - 1 - nextIndex) <= extendThreshold) {
					const lastOrdinal = Number(nextCards[nextCards.length - 1]?._streamOrdinal ?? 0);
					const append = Array.from({ length: baseLen }, (_, offset) => createProceduralEntry(lastOrdinal + 1 + offset)).filter(Boolean);
					if (append.length > 0) {
						nextCards = [...nextCards, ...append];
						changed = true;
					}
				}

				const pruneBuffer = Math.max(side * 3, baseLen * 2);
				const minKeepIndex = Math.max(0, nextIndex - pruneBuffer);
				const maxKeepIndex = Math.min(nextCards.length - 1, nextIndex + pruneBuffer);

				let sliceStart = Math.floor(minKeepIndex / baseLen) * baseLen;
				let sliceEnd = Math.ceil((maxKeepIndex + 1) / baseLen) * baseLen;
				sliceStart = Math.max(0, Math.min(sliceStart, nextCards.length - 1));
				sliceEnd = Math.max(sliceStart + 1, Math.min(sliceEnd, nextCards.length));

				if (sliceStart > 0 || sliceEnd < nextCards.length) {
					nextCards = nextCards.slice(sliceStart, sliceEnd);
					nextIndex -= sliceStart;
					changed = true;
				}

				if (changed) {
					skipAnimationRef.current = true;
					setStreamCards(nextCards);
					if (nextIndex !== currentIndex) {
						suppressCurrentCardEmitRef.current = true;
						emitCurrentCardOnIndexChangeRef.current = false;
						setCurrentIndex(nextIndex);
					}
				}

				setIsMoving(false);
				return;
			}

			if (hasLoopClones && !useProceduralLoop) {
				const baseLen = baseCards.length;
				const loopStart = effectiveLoopCloneCount;
				const loopEnd = loopStart + baseLen;

				let nextIndex = currentIndex;
				if (nextIndex >= loopEnd) nextIndex -= baseLen;
				if (nextIndex < loopStart) nextIndex += baseLen;

				if (nextIndex !== currentIndex) {
					skipAnimationRef.current = true;
					suppressCurrentCardEmitRef.current = true;
					emitCurrentCardOnIndexChangeRef.current = false;
					setCurrentIndex(nextIndex);
					requestAnimationFrame(() => setIsMoving(false));
					return;
				}
			}
			setIsMoving(false);
		}, Math.max(0, transitionMs + 10));

		return () => clearTimeout(timer);
	}, [baseCards.length, cards, createProceduralEntry, currentIndex, effectiveLoopCloneCount, hasLoopClones, isMoving, transitionMs, useProceduralLoop]);

	// Recenter when the carousel area changes size (e.g., dropdown opens, window resizes).
	useEffect(() => {
		if (mode !== 'translate') return;
		const carousel = carouselRef.current;
		if (!carousel) return;
		const container = containerRef.current;

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
			if (container) {
				container.style.transition = '';
				container.style.transform = '';
			}
			if (resizeRafRef.current) {
				cancelAnimationFrame(resizeRafRef.current);
				resizeRafRef.current = 0;
			}
		};
	}, [cards.length, currentIndex, recenter, mode]);

	// Keep the current selection stable as cards are appended; only clamp if out of bounds.
	useEffect(() => {
		if (!cards.length) return;
		setCurrentIndex((prev) => {
			const maxIndex = cards.length - 1;

			if (prev < 0) {
				skipAnimationRef.current = true;
				suppressCurrentCardEmitRef.current = true;
				emitCurrentCardOnIndexChangeRef.current = false;
				return 0;
			}
			if (prev > maxIndex) {
				skipAnimationRef.current = true;
				suppressCurrentCardEmitRef.current = true;
				emitCurrentCardOnIndexChangeRef.current = false;
				return maxIndex;
			}

			if (hasLoopClones && baseCards.length > 0 && !useProceduralLoop) {
				const baseLen = baseCards.length;
				const normalizedBaseIndex = ((prev - effectiveLoopCloneCount) % baseLen + baseLen) % baseLen;
				const anchoredIndex = effectiveLoopCloneCount + normalizedBaseIndex;
				if (anchoredIndex !== prev) {
					skipAnimationRef.current = true;
					suppressCurrentCardEmitRef.current = true;
					emitCurrentCardOnIndexChangeRef.current = false;
					return anchoredIndex;
				}
			}

			return prev;
		});
	}, [baseCards.length, cards.length, effectiveLoopCloneCount, hasLoopClones, isMoving, useProceduralLoop]);

	useEffect(() => {
		if (typeof onCurrentCardChange !== 'function') return;
		const card = cards[currentIndex];
		if (!card) return;
		const hasControlledSelection = selectedCardId != null && selectedCardId !== '';

		if (suppressCurrentCardEmitRef.current) {
			suppressCurrentCardEmitRef.current = false;
			emitCurrentCardOnIndexChangeRef.current = false;
			return;
		}

		if (hasControlledSelection && !emitCurrentCardOnIndexChangeRef.current) {
			return;
		}

		const marker = String(card.id ?? '');
		if (lastEmittedCurrentCardRef.current === marker) {
			emitCurrentCardOnIndexChangeRef.current = false;
			return;
		}
		lastEmittedCurrentCardRef.current = marker;

		onCurrentCardChange(card, { index: currentIndex });
		emitCurrentCardOnIndexChangeRef.current = false;
	}, [cards, currentIndex, onCurrentCardChange, selectedCardId]);

	const onKeyDown = (e) => {
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			e.stopPropagation?.();
			focusCarousel();
			move(1);
			return;
		}
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			e.stopPropagation?.();
			focusCarousel();
			move(-1);
			return;
		}
		if (e.key === 'Tab') {
			if (e.ctrlKey || e.metaKey || e.altKey) return;
			e.preventDefault();
			e.stopPropagation?.();
			focusCarousel();
			if (e.shiftKey) {
				move(-1);
			} else {
				move(1);
			}
			return;
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

	const onKeyUp = (e) => {
		if (e.key !== 'Tab') return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		e.preventDefault();
		e.stopPropagation?.();
	};

	// Native non-passive wheel handler to reliably block vertical page scroll while hovering.
	useEffect(() => {
		const el = carouselRef.current;
		if (!el) return;

		const handler = (e) => {
			// Only react when SHIFT is held
			if (!e.shiftKey) return;
			// Treat mouse wheel/trackpad as left/right navigation.
			// Prevent page scroll while the cursor is over the carousel.
			if (e.cancelable) e.preventDefault();
			e.stopPropagation();
			focusCarousel();
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
	}, [focusCarousel, isMoving]);

	// Drag handlers for mouse drag navigation
	useEffect(() => {
		const el = carouselRef.current;
		if (!el) return;

		const handleMouseDown = (e) => {
			focusCarousel();
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
	}, [focusCarousel, isMoving]);

	// Touch swipe navigation for mobile/tablet.
	useEffect(() => {
		const el = carouselRef.current;
		if (!el) return;

		const handleTouchStart = (event) => {
			if (!event.touches || event.touches.length < 1) return;
			const touch = event.touches[0];
			focusCarousel();
			isTouchDraggingRef.current = true;
			touchStartXRef.current = touch.clientX;
			touchCurrentXRef.current = touch.clientX;
		};

		const handleTouchMove = (event) => {
			if (!isTouchDraggingRef.current || !event.touches || event.touches.length < 1) return;
			touchCurrentXRef.current = event.touches[0].clientX;
		};

		const handleTouchEnd = () => {
			if (!isTouchDraggingRef.current) return;
			isTouchDraggingRef.current = false;

			const dragDistance = touchStartXRef.current - touchCurrentXRef.current;
			const threshold = 34;

			if (Math.abs(dragDistance) > threshold && !isMoving) {
				move(dragDistance > 0 ? 1 : -1);
			}
		};

		el.addEventListener('touchstart', handleTouchStart, { passive: true });
		el.addEventListener('touchmove', handleTouchMove, { passive: true });
		el.addEventListener('touchend', handleTouchEnd, { passive: true });
		el.addEventListener('touchcancel', handleTouchEnd, { passive: true });

		return () => {
			el.removeEventListener('touchstart', handleTouchStart);
			el.removeEventListener('touchmove', handleTouchMove);
			el.removeEventListener('touchend', handleTouchEnd);
			el.removeEventListener('touchcancel', handleTouchEnd);
		};
	}, [focusCarousel, isMoving]);

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
				role="region"
				aria-keyshortcuts="ArrowLeft ArrowRight Tab Shift+Tab"
				aria-label={ariaLabel}
				onMouseEnter={focusCarousel}
				onTouchStart={focusCarousel}
				onMouseDown={focusCarousel}
				onKeyDown={onKeyDown}
				onKeyUp={onKeyUp}
			>
				{typeof renderBeforeContainer === 'function' ? renderBeforeContainer({ move, focusCarousel }) : null}

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
					<ul
						ref={containerRef}
						className={classNameContainer}
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
					</ul>
				)}

				{typeof renderAfterContainer === 'function' ? renderAfterContainer({ move, focusCarousel }) : null}
			</div>
		</div>
	);
};

export default GameSliderBase;
