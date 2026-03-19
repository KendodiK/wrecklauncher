import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameSliderBase from '../shared/GameSliderBase.jsx';

function normalizeLauncherId(card) {
    const raw = String(card?.platform_name || card?.platform || card?.launcherId || '').trim().toLowerCase();
    if (!raw) return 'steam';
    if (raw === 'itch' || raw === 'itch.io' || raw === 'itchio') return 'itchio';
    if (raw === 'epic games' || raw === 'epic_games') return 'epic';
    return raw;
}

function launcherBorderClass(card) {
    const launcherId = normalizeLauncherId(card);
    if (launcherId === 'steam') return 'border-sky-500/70';
    if (launcherId === 'gog') return 'border-violet-500/70';
    if (launcherId === 'itchio') return 'border-rose-500/70';
    if (launcherId === 'epic') return 'border-blue-500/70';
    return 'border-slate-600/70';
}

function hasDiscountFlag(card) {
    const discountValue = Number(
        card?.discountPercent ??
        card?.discount ??
        card?.discount_percentage ??
        card?.discount_percent ??
        0
    );
    const discountTag = Array.isArray(card?.tags) && card.tags.some((tag) => {
        const normalized = String(tag).toLowerCase();
        return normalized.includes('discount') || normalized.includes('deal') || normalized.includes('sale');
    });
    return discountValue > 0 || Boolean(card?.is_discounted || card?.isDiscounted) || discountTag;
}

function hasUpcomingFlag(card) {
    const status = String(card?.status || '').toLowerCase();
    const upcomingTag = Array.isArray(card?.tags) && card.tags.some((tag) => {
        const normalized = String(tag).toLowerCase();
        return normalized.includes('upcoming') || normalized.includes('coming soon');
    });
    return Boolean(
        card?.is_upcoming ||
        card?.isUpcoming ||
        card?.upcoming ||
        card?.coming_soon ||
        card?.comingSoon ||
        status.includes('upcoming') ||
        status.includes('coming soon') ||
        upcomingTag
    );
}

// Store slider wrapper (same pattern as GameSlider):
// - Structure + behavior comes from GameSliderBase
// - Design comes from existing CSS in src/index.css (.carousel/.cards/.shop-card...)
// - Animation comes from getStackMotion() (Motion transforms per offset)
const Storeslider = ({ items, onCardClick, onNearEnd, nearEndThreshold = 5 }) => {
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
        if (remaining <= nearEndThreshold) {
            onNearEnd();
        }
    };

    return (
        <GameSliderBase
            mode="stack"
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
                    <div className={`pointer-events-none absolute inset-0 rounded-[inherit] border-2 ${launcherBorderClass(card)}`} />
                    {Number(card.discountPercent) > 0 ? (
                        <div className="absolute left-3 top-3 rounded-md bg-emerald-500/95 px-2 py-1 text-xs font-bold text-white shadow-lg">
                            -{Math.round(Number(card.discountPercent))}%
                        </div>
                    ) : null}
                    {hasDiscountFlag(card) || hasUpcomingFlag(card) ? (
                        <div className={`absolute right-3 bottom-3 z-20 h-2 w-10 rounded-sm ${hasDiscountFlag(card) ? 'bg-emerald-400' : 'bg-yellow-400'}`} />
                    ) : null}
                    <div className="shop-card-title">{card.title}</div>
                </>
            )}
        />
    );
};

export default Storeslider;