// Jobb felső ablak vezérlő gombok (Minimize, Maximize, Close)
import React from 'react';

// minimize / maximize / closeWindow: Electron ablak műveletek callback-jei a szülőből
const WindowControls = ({ minimize, maximize, closeWindow }) => {
  return (
    <div className="flex items-center window-controls no-drag">
      <button
        type="button"
        id="min-btn"
        aria-label="Minimize"
        className="px-3 py-1 text-xs hover:bg-neutral-800"
        onClick={minimize}
      >
        _
      </button>
      <button
        type="button"
        id="max-btn"
        aria-label="Maximize"
        className="px-3 py-1 text-xs hover:bg-neutral-800"
        onClick={maximize}
      >
        ▢
      </button>
      <button
        type="button"
        id="close-btn"
        aria-label="Close"
        className="px-3 py-1 text-xs hover:bg-red-700 text-red-100"
        onClick={closeWindow}
      >
        X
      </button>
    </div>
  );
};

export default WindowControls;
