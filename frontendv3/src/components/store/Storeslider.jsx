import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameSliderBase from '../shared/GameSliderBase.jsx';

// Store slider wrapper (same pattern as GameSlider):
// - Structure + behavior comes from GameSliderBase
// - Design comes from existing CSS in src/index.css (.carousel/.cards/.shop-card...)
// - Animation comes from getStackMotion() (Motion transforms per offset)
const Storeslider = ({ items, onCardClick }) => {
    const cards = useMemo(() => (Array.isArray(items) ? items : []), [items]);
    const navigate = useNavigate();
    const [viewportW, setViewportW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));

    useEffect(() => {
        const onResize = () => setViewportW(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const spread = useMemo(() => {
        // Fixed spacing values for consistent animations
        if (viewportW >= 1536) return 1.3;
        if (viewportW >= 1280) return 1.2;
        if (viewportW >= 1024) return 1.1;
        return 1.0;
    }, [viewportW]);

    const openGame = (card) => {
        if (!card) return;
        const appid = Number(card.appid);
        const routeId = Number.isFinite(appid) && appid > 0 ? String(appid) : (card.id != null ? String(card.id) : 'unknown');
        const normalizedPlatform = String(card.platform_name || card.platform || 'steam').trim().toLowerCase();
        const platform = normalizedPlatform === 'itch' || normalizedPlatform === 'itch.io' || normalizedPlatform === 'itchio'
            ? 'itchio'
            : (normalizedPlatform === 'epic games' || normalizedPlatform === 'epic_games' ? 'steam' : (normalizedPlatform || 'steam'));

        navigate(`/store/game/${encodeURIComponent(platform)}/${encodeURIComponent(routeId)}`, {
            state: {
                game: {
                    id: routeId,
                    appid: Number.isFinite(appid) && appid > 0 ? appid : undefined,
                    title: card.title ?? 'Game Title',
                    heroImage: card.heroImage ?? card.image,
                    coverImage: card.coverImage ?? card.image,
                    description:
                        card.description ??
                        'Short description goes here. Replace this with real store data when available.',
                    sites: card.sites,
                    tags: card.tags,
                },
            },
        });
    };

    return (
        <GameSliderBase
            mode="stack"
            games={cards}
            onActivateCard={(card) => openGame(card)}
            onCardClick={onCardClick}
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
                            x: dir * 220 * spread,
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
                            x: dir * 380 * spread,
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
                            x: dir * 520 * spread,
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
                        x: dir * 640 * spread,
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
                    <img src={card.image} alt={card.title} loading={abs <= 1 ? 'eager' : 'lazy'} />
                    {Number(card.discountPercent) > 0 ? (
                        <div className="absolute left-3 top-3 rounded-md bg-emerald-500/95 px-2 py-1 text-xs font-bold text-white shadow-lg">
                            -{Math.round(Number(card.discountPercent))}%
                        </div>
                    ) : null}
                    <div className="shop-card-title">{card.title}</div>
                </>
            )}
        />
    );
};

export default Storeslider;