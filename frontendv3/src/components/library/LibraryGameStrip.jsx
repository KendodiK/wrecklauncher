import React, { useCallback, useMemo } from 'react';
import GameSliderBase from '../shared/GameSliderBase.jsx';
import PlatformBadge from './PlatformBadge.jsx';

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
      loop={shouldLoop}
      games={sliderGames}
      selectedCardId={activeGameId}
      showFallbackCards={false}
      activeOffsetPx={200}
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
          tabIndex={-1}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            focusCarousel?.();
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
        return (
          <>
            <img
              src={card.image}
              alt={card.title}
              className="lib-strip-card-image"
              decoding="async"
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
                    event.stopPropagation();
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
              {game?.cracked ? <span className="lib-strip-card-cracked">CRK</span> : null}
            </div>
          </>
        );
      }}
    />
  );
});

export default LibraryGameStrip;
