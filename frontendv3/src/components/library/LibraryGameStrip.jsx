import React, { useCallback, useMemo } from 'react';
import GameSliderBase from '../shared/GameSliderBase.jsx';
import PlatformBadge from './PlatformBadge.jsx';
import { getSteamImageUrl } from '../../utils/gameUtils.js';

// Library game strip — wrapper around GameSliderBase in translate mode.
// Renders game cover cards with active card highlight.
const LibraryGameStrip = React.memo(({ games, activeGameId, onSelect, onOpenStore }) => {

  // Map LibraryGame data to the format GameSliderBase expects.
  // Keep this memoized to avoid rebuilding slider data on every parent render.
  const sliderGames = useMemo(
    () =>
      (games ?? []).map((game) => ({
        id: game.id,
        image: game.heroUrl || game.coverUrl,
        title: game.title,
        appid: game.appid,
        launcherId: game.launcherId,
        _origGame: game,
      })),
    [games],
  );

  const shouldLoop = sliderGames.length > 6;

  const handleCurrentCardChange = useCallback(
    (card) => {
      if (typeof onSelect !== 'function') return;
      if (card?.id == null) return;

      const nextId = String(card.id);
      const currentId = String(activeGameId ?? '');
      if (nextId === currentId) return;

      onSelect(card.id);
    },
    [activeGameId, onSelect],
  );

  const handleCardClick = useCallback(
    (card) => {
      if (typeof onSelect !== 'function') return;
      if (card?.id == null) return;

      const nextId = String(card.id);
      const currentId = String(activeGameId ?? '');
      if (nextId === currentId) return;

      onSelect(card.id);
    },
    [activeGameId, onSelect],
  );

  return (
    
    <GameSliderBase
      mode="translate"
      loop={false} //is breaking navigation, implement in the future, shouldLoop is responsible for triggering it normally
      games={sliderGames}
      //selectedCardId={activeGameId}
      showFallbackCards={false}
      activeOffsetPx={246}
      cloneCount={Math.min(5, sliderGames.length)}
      ariaLabel="Library game strip"
      classNameWrapper="lib-strip-wrapper"
      classNameCarousel="lib-strip-carousel"
      classNameContainer="lib-strip-cards"
      classNameCard="lib-strip-card"
      classNameCardActive="lib-strip-card-active"
      advanceOnActiveClick
      transitionMs={300}
      renderBeforeContainer={({ move, focusCarousel }) => (
        <button
          type="button"
          className="lib-strip-nav lib-strip-nav-prev"
          onMouseDown={(event) => {
            event.preventDefault();
            
          }}
          onClick={(event) => {
            event.preventDefault();
            focusCarousel?.();
            event.stopPropagation();
            move(-1);
          }}
          aria-label="Previous game"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="m15 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      renderAfterContainer={({ move, focusCarousel }) => (
        <button
          type="button"
          className="lib-strip-nav lib-strip-nav-next"
          tabIndex={-1}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            focusCarousel?.();
            move(1);
          }}
          aria-label="Next game"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="m9 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
      onCurrentCardChange={handleCurrentCardChange}
      onCardClick={handleCardClick}
      renderCard={({ card, index, currentIndex }) => {
        const isActive = index === currentIndex;
        const game = card._origGame;
        let imageUrl = card.image;

        return (
          <>
            <img
              src={imageUrl}
              alt={card.title}
              className="lib-strip-card-image"
              decoding="async"   
              draggable={false}           
              onError={(e) => {
                e.currentTarget.onerror = null; // prevent infinite loop
                e.currentTarget.src = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAAHCCAYAAABVM/SHAAAYF0lEQVR4Xu3d3at0cxsH8PUcIKVIiVJCRMIJJVLyksSBlwNKSU78UU4kpTjwViQlOZK6iUjeQsp7iSLJwfP0U9Mz9l6/WWvNXNfc+9r35y4H2rOv+c3nutZ31lqz9pr/nDhx4r+DfwQIECgg8B+BVaBLlkiAwD8CAssgECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBAgLLDBAgUEZAYJVplYUSICCwzAABAmUEBFaZVlkoAQICywwQIFBGQGCVaZWFEiAgsMwAAQJlBARWmVZZKAECAssMECBQRkBglWmVhRIgILDMAAECZQQEVplWWSgBArMD64UXXhh+/vnnRWJnnnnmcNZZZw3nnnvucMkllwwXXXTRxt8fe45rrrlmuPHGGxc975IHf/jhh8Pbb7/d/ZX2Gh555JElJbuP/e2334Yvvvhi+OGHH4bff/99aP+/+nfaaacN55xzznDBBRcMV1111XD22WfPes5t+rKp8F133XWoT82nOa3/O++884b7779/1hq/+eab4bXXXjv02Mcff3zW77cH/fXXX8Nnn302fP/998Mff/xxaBZbn9qcNb/LLrtstl+rHbG+3gvZpj+t96effvriWRjr02zgkQeObXs9qznPs/66Lr300uH888+f82v/ekxqYB1czYUXXjjccccdwxlnnDG60JMRWK+88srw7bffboS79957t8JdFW3B9M477wxff/317Aa1QLjtttsmN7xtNohKgdWC6r333hs++eST4e+//17kd911102+SR7FwDr4IufOwlEPrKV5MNbsvQZWW0BL2fvuu280tPYdWC1Inn322cmN4OKLLx7uvPPOyceNPaDtmZw4cWLRxraq0/a6rr/++qG900W+g1cJrB9//HF4/fXXhz///HMr+/ZLV1xxxXDLLbds/P2jtoc1ttg2C3fffffGN85qgTWVB0cisNoi2p7WPffcc2g9+w6sd999d2j/Tf1rw/LYY49NPezQz6cON+cWbIfEvdA6rntYLaxeffXVrYL+oOvUG06FwGqvaSq0KgbW3DeVVU932sPqnV9qey4//fTTP7vy6+dp1gdp7DBr34HV9q4Orq8N99ih26233jpcfvnlczNm+Pzzz4c333xz9PHtOVbn9NrhcTvsaRvNRx99NHqesA3qAw88MHp4uA+zfZ/Daj15/vnnR8OqWVx55ZXD+jmQld9XX33VPezeFFr7DqzedtNeRwvq9jq+/PLL0dffztU9+OCDo0cou/ZpznBva9VeVzvS6J1+eeihhyZPf7T1pQTW+gvv7QGM7arvY+Nbra13ONjgXn755UOHIVPv0uuvuQ3eM888c2jg2sZ28803bwy+t956a/j0008PzU7v+fdhtuuGsHTIezOz6XTCCqw91xtvvDG6sffedJaub86GvXrMtv1pM/Tiiy+OvuH3Am/XPs15Xbta9c4Zt/ON7b+pf+mB1QuGsU+Ztm3u1Isc+/lYc9sG0QKrFxqPPvpo9wOD9edo51122UvrNXXsXWgfZrtuCEuGvHcYPSesVj1o7+YvvfTSobb3PvFdsr6ls7ZL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";
              }}              
              loading={Math.abs(index - currentIndex) <= 2 ? 'eager' : 'lazy'}
              fetchPriority={isActive ? 'high' : 'auto'}
            />
            <div className="lib-strip-card-overlay" />
            <PlatformBadge
              platform={game?.launcherId || game?.platform_name || game?.platform}
              className="lib-platform-badge-card"
            />
            {isActive ? (
              <div className="lib-strip-card-popover">
                <button
                  type="button"
                  className="lib-strip-card-popover-btn"
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenStore?.(game);
                  }}
                >
                  Open Store Page
                </button>
              </div>
            ) : null}
            <div className="lib-strip-card-info">
              <span className="lib-strip-card-title">{card.title}</span>
            </div>
          </>
        );
      }}
    />
  );
});

export default LibraryGameStrip;
