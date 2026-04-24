import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameSliderBase from '../shared/GameSliderBase.jsx';
import { buildStoreGameRoute, resolveStoreGameRouteId, resolveStorePlatformFromGame } from '../../utils/storeRouting.js';

// Store slider wrapper (same pattern as GameSlider):
// - Structure + behavior comes from GameSliderBase
// - Design comes from existing CSS in src/index.css (.carousel/.cards/.shop-card...)
// - Animation comes from getStackMotion() (Motion transforms per offset)
const Storeslider = ({ items, onCardClick, onNearEnd, nearEndThreshold = 5 }) => {
    const cards = useMemo(() => (Array.isArray(items) ? items : []), [items]);
    const navigate = useNavigate();
    const [viewportW, setViewportW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));
    const previousRemainingRef = useRef(null);

    useEffect(() => {
        const onResize = () => setViewportW(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        previousRemainingRef.current = null;
    }, [cards.length]);

    const spread = useMemo(() => {
        // Fixed spacing values for consistent animations
        if (viewportW >= 1536) return 1.3;
        if (viewportW >= 1280) return 1.2;
        if (viewportW >= 1024) return 1.1;
        return 1.0;
    }, [viewportW]);

    const openGame = (card) => {
        if (!card) return;
        const target = buildStoreGameRoute(card, 'steam');
        const routeId = resolveStoreGameRouteId(card);
        if (!target || !routeId) return;
        const normalizedPlatform = resolveStorePlatformFromGame(card, 'steam');

        const appid = Number(card.appid ?? card.app_id ?? card.id);
        navigate(target, {
            state: {
                game: {
                    id: routeId,
                    appid: Number.isFinite(appid) && appid > 0 ? appid : undefined,
                    title: card.title ?? 'Game Title',
                    heroImage: card.heroImage ?? card.image,
                    coverImage: card.coverImage ?? card.image,
                    platform_name: normalizedPlatform,
                    description:
                        card.description ??
                        'No description available. Click to learn more about this game on the store page.',
                    sites: card.sites,
                    tags: card.tags,
                },
            },
        });
    };

    const handleCurrentCardChange = (card) => {
        if (typeof onNearEnd !== 'function') return;
        if (!Array.isArray(cards) || cards.length <= nearEndThreshold) return;

        const currentKey = String(card?.appid ?? card?.app_id ?? card?.id ?? '').trim();
        if (!currentKey) return;

        const currentPos = cards.findIndex((entry) => {
            const entryKey = String(entry?.appid ?? entry?.app_id ?? entry?.id ?? '').trim();
            return entryKey && entryKey === currentKey;
        });

        if (currentPos < 0) return;
        const remaining = cards.length - 1 - currentPos;
        const previousRemaining = previousRemainingRef.current;
        previousRemainingRef.current = remaining;

        const crossedIntoNearEnd = previousRemaining == null
            ? remaining <= nearEndThreshold
            : (previousRemaining > nearEndThreshold && remaining <= nearEndThreshold);

        if (crossedIntoNearEnd) {
            onNearEnd();
        }
    };

    return (
        <GameSliderBase
            mode="stack"
            loop={false}
            games={cards}
            onActivateCard={(card) => openGame(card)}
            onCardClick={onCardClick}
            onCurrentCardChange={handleCurrentCardChange}
            classNameWrapper=""
            classNameCarousel="carousel"
            classNameContainer="cards"
            classNameCard="shop-card"
            classNameCardActive="shop-card-active"
            ariaLabel="Shop carousel"
            // Keep the existing Store design: cards are centered & stacked; we animate each
            // card based on how far it is from the active card.
            getStackMotion={({ offset, abs, dir }) => {
                const visible = abs <= 4;

                if (abs === 0) {
                    return {
                        visible,
                        style: { zIndex: 10 },
                        animate: {
                            x: 0,
                            y: 0,
                            scale: 1,
                            opacity: 1,
                            filter: 'blur(0px)',
                        },
                    };
                }

                if (abs === 1) {
                    return {
                        visible,
                        style: { zIndex: 8 },
                        animate: {
                            x: dir * 320 * spread,
                            y: 10,
                            scale: 0.92,
                            opacity: 0.75,
                            filter: 'blur(0.5px)',
                        },
                    };
                }

                if (abs === 2) {
                    return {
                        visible,
                        style: { zIndex: 6 },
                        animate: {
                            x: dir * 520 * spread,
                            y: 18,
                            scale: 0.84,
                            opacity: 0.38,
                            filter: 'blur(1.2px)',
                        },
                    };
                }

                if (abs === 3) {
                    return {
                        visible,
                        style: { zIndex: 4 },
                        animate: {
                            x: dir * 700 * spread,
                            y: 24,
                            scale: 0.78,
                            opacity: 0.2,
                            filter: 'blur(2px)',
                        },
                    };
                }

                // abs === 4
                return {
                    visible,
                    style: { zIndex: 2 },
                    animate: {
                        x: dir * 860 * spread,
                        y: 28,
                        scale: 0.72,
                        opacity: 0,
                        filter: 'blur(3px)',
                    },
                };
            }}
            transitionMs={300}
            renderCard={({ card, abs }) => (
                <>
                    <img
                        src={card.image}
                        alt={card.title}
                        loading={abs <= 1 ? 'eager' : 'lazy'}
                        style={{ objectFit: card.preferContainImage ? 'contain' : 'cover' }}
                    />
                    {Number(card.discount_percent) > 0 ? (
                        <div className="absolute left-3 top-3 rounded-md bg-emerald-500/95 px-2 py-1 text-xs font-bold text-white shadow-lg">
                            -{Math.round(Number(card.discount_percent))}%
                        </div>
                    ) : null}
                    <div className="shop-card-title">{card.title}</div>
                </>
            )}
        />
    );
};

export default Storeslider;