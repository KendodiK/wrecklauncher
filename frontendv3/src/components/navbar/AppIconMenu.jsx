// Bal felső app ikon és lenyíló menü (Home, Settings, Exit, stb.)
import React from 'react';
import logoImage from '../../assets/logo.svg';

// dropdownOpen: nyitva van-e a menü
// openDropdown / scheduleCloseDropdown / closeDropdown: egér eseményekhez tartozó vezérlő függvények
// navigateTo: egyszerű oldalváltás (React Router path pl. /store)
// closeWindow: alkalmazás bezárása
const AppIconMenu = ({ dropdownOpen, openDropdown, scheduleCloseDropdown, closeDropdown, navigateTo, closeWindow }) => {
  return (
    <div
      className="app-icon-link relative flex items-center gap-1 cursor-pointer no-drag"
      onMouseEnter={openDropdown}
      onMouseLeave={scheduleCloseDropdown}
      onFocus={openDropdown}
      onBlur={closeDropdown}
    >
      <span className="app-icon w-6 h-6 bg-slate-700 rounded flex items-center justify-center overflow-hidden">
        <img src={logoImage} alt="WreckLauncher logo" className="w-full h-full object-cover" draggable="false" />
      </span>
      <span className="app-title text-sm">WreckLauncher</span>

      {dropdownOpen && (
        <div className="app-icon-dropdown absolute left-0 top-full mt-1 min-w-[160px] bg-neutral-800 text-xs shadow-lg z-50 no-drag">
          <button
            type="button"
            className="menu-item w-full text-left px-3 py-2 hover:bg-neutral-700"
            onClick={(e) => {
              e.stopPropagation();
              closeDropdown();
              navigateTo('/store');
            }}
          >
            Home
          </button>
          <button
            type="button"
            className="menu-item w-full text-left px-3 py-2 hover:bg-red-700 text-red-100"
            onClick={(e) => {
              e.stopPropagation();
              closeDropdown();
              closeWindow();
            }}
          >
            Exit Application
          </button>
        </div>
      )}
    </div>
  );
};

export default AppIconMenu;
