import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GameSliderBase from './GameSliderBase.jsx';

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
    359550, // Tom Clancy's Rainbow Six Siege
    1086940, // Baldur's Gate 3
];

const DEFAULT_ITEMS = Array.from({ length: 9 }).map((_, i) => {
    const n = i + 1;
    const appid = DEFAULT_STEAM_APPIDS[i] ?? null;
    return {
        id: `shop-${n}`,
        appid,
        title: `Featured Game ${n}`,
        image: steamPoster(appid) || `https://via.placeholder.com/440x640?text=Featured+${n}`,
    };
});

// Store slider wrapper (same pattern as GameSlider):
// - Structure + behavior comes from GameSliderBase
// - Design comes from existing CSS in src/index.css (.carousel/.cards/.shop-card...)
// - Animation comes from getStackMotion() (Motion transforms per offset)
const Storeslider = ({ items }) => {
    const cards = useMemo(() => (items && items.length ? items : DEFAULT_ITEMS), [items]);
    const navigate = useNavigate();
    const [viewportW, setViewportW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1200));

    useEffect(() => {
        const onResize = () => setViewportW(window.innerWidth);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    const spread = useMemo(() => {
        // Slightly wider spacing on large/fullscreen windows.
        if (viewportW >= 1536) return 1.32;
        if (viewportW >= 1280) return 1.22;
        if (viewportW >= 1024) return 1.12;
        return 1;
    }, [viewportW]);

    const openGame = (card) => {
        if (!card) return;
        const appid = Number(card.appid);
        const routeId = Number.isFinite(appid) && appid > 0 ? String(appid) : (card.id != null ? String(card.id) : 'unknown');

        navigate(`/game/${encodeURIComponent(routeId)}`, {
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
            classNameWrapper=""
            classNameCarousel="carousel"
            classNameContainer="cards"
            classNameCard="shop-card"
            classNameCardActive="shop-card-active"
            ariaLabel="Shop carousel"
            renderBeforeContainer={({ move }) => (
                <button type="button" className="prev" onClick={() => move(-1)} aria-label="Previous">
                    ‹
                </button>
            )}
            renderAfterContainer={({ move }) => (
                <button type="button" className="next" onClick={() => move(1)} aria-label="Next">
                    ›
                </button>
            )}
            // Keep the existing Store design: cards are centered & stacked; we animate each
            // card based on how far it is from the active card.
            getStackMotion={({ offset, abs, dir }) => {
                const visible = Math.abs(offset) <= 3;

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
                    x = dir * (220 * spread);
                    scale = 0.92;
                    opacity = 0.75;
                    y = 10;
                    zIndex = 8;
                    blur = 0.5;
                } else if (abs === 2) {
                    x = dir * (380 * spread);
                    scale = 0.84;
                    opacity = 0.38;
                    y = 18;
                    zIndex = 6;
                    blur = 1.2;
                } else if (abs === 3) {
                    x = dir * (520 * spread);
                    scale = 0.78;
                    opacity = 0;
                    y = 24;
                    zIndex = 4;
                    blur = 2;
                }

                return {
                    visible,
                    style: { zIndex },
                    animate: {
                        x,
                        y,
                        scale,
                        opacity: visible ? opacity : 0,
                        filter: `blur(${blur}px)`,
                    },
                };
            }}
            transitionMs={300}
            renderCard={({ card, abs }) => (
                <>
                    <img src={card.image} alt={card.title} loading={abs <= 1 ? 'eager' : 'lazy'} />
                    <div className="shop-card-title">{card.title}</div>
                </>
            )}
        />
    );
};

export default Storeslider;