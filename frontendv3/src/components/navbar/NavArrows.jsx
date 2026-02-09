// Előre/Vissza nyilak az ablakon belüli history veremhez
import React from 'react';

// goBack: visszalépés az előző oldalra
// goForward: előrelépés a következő oldalra
const NavArrows = ({ goBack, goForward }) => {
  return (
    <div className="flex items-center gap-1 no-drag">
      <button
        type="button"
        aria-label="Back"
        className="px-2 py-0.5 text-xs nav-arrow-btn no-drag"
        onClick={goBack}
      >
        ←
      </button>
      <button
        type="button"
        aria-label="Forward"
        className="px-2 py-0.5 text-xs nav-arrow-btn no-drag"
        onClick={goForward}
      >
        →
      </button>
    </div>
  );
};

export default NavArrows;
