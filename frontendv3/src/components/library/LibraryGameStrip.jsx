import React from 'react';
import GameSliderBase from '../shared/GameSliderBase.jsx';

// Library game strip — wrapper around GameSliderBase in translate mode.
// Renders game cover cards with active card highlight.
const LibraryGameStrip = ({ games, activeGameId, onSelect }) => {
  // Map LibraryGame data to the format GameSliderBase expects
  const sliderGames = (games ?? []).map((game) => ({
    id: game.id,
    image: game.coverUrl,
    title: game.title,
    _origGame: game,
  }));

  return (
    <GameSliderBase
      mode="translate"
      games={sliderGames}
      activeOffsetPx={200}
      cloneCount={Math.min(5, sliderGames.length)}
      ariaLabel="Library game strip"
      classNameWrapper="lib-strip-wrapper"
      classNameCarousel="lib-strip-carousel"
      classNameContainer="lib-strip-cards"
      classNameCard="lib-strip-card"
      classNameCardActive="lib-strip-card-active"
      transitionMs={300}
      onCardClick={(card) => {
        if (typeof onSelect === 'function') {
          onSelect(card.id);
        }
      }}
      renderCard={({ card, index, currentIndex }) => {
        const isActive = index === currentIndex;
        const game = card._origGame;
        return (
          <>
            <img
              src={card.image}
              alt={card.title}
              decoding="async"
              loading={Math.abs(index - currentIndex) <= 2 ? 'eager' : 'lazy'}
              fetchPriority={isActive ? 'high' : 'auto'}
            />
            <div className="lib-strip-card-overlay" />
            <div className="lib-strip-card-info">
              <span className="lib-strip-card-title">{card.title}</span>
              {game?.cracked ? <span className="lib-strip-card-cracked">CRK</span> : null}
            </div>
          </>
        );
      }}
    />
  );
};

export default LibraryGameStrip;
