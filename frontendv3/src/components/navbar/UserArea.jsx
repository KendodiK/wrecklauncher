// Jobb felső felhasználói terület (avatar, név, Login/Logout menü)
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const UserArea = ({ user, onLogout }) => {
  // Lenyíló menü nyitva/zárva állapota
  const [isOpen, setIsOpen] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const containerRef = useRef(null);
  const navigate = useNavigate();

  // isLoggedIn: van-e bejelentkezett user
  const isLoggedIn = !!user;
  // Megjelenített felhasználónév (ha nincs user, akkor Guest)
  const username = isLoggedIn && user?.username ? user.username : 'Guest';
  const avatarCandidate =
    (isLoggedIn &&
      (user?.avatarUrl ||
        user?.avatarURL ||
        user?.avatar_url ||
        user?.profilePicture ||
        user?.pfp)) ||
    '';
  const avatarUrl = typeof avatarCandidate === 'string' ? avatarCandidate.trim() : '';

  useEffect(() => {
    setAvatarFailed(false);
  }, [avatarUrl]);

  // Külső kattintás figyelése: ha a menün kívül kattintunk, zárjuk be a lenyílót
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Lenyíló menü állapotának átváltása
  const toggleDropdown = () => {
    setIsOpen((prev) => !prev);
  };

  const openRoute = (path) => {
    setIsOpen(false);
    try {
      navigate(path);
    } catch {
      if (typeof window !== 'undefined') {
        window.location.hash = `#${path}`;
      }
    }
  };

  // Login/Logout gomb működése a lenyílóban
  const handleAuthClick = () => {
    setIsOpen(false);

    if (!isLoggedIn) {
      // Ha nincs bejelentkezve, menjünk a /login oldalra
      navigate('/login');
    } else {
      // Ha be van jelentkezve, hívjuk meg a szülő kijelentkeztető függvényét
      if (onLogout) {
        onLogout();
      }
    }
  };

  const handleProfileClick = () => {
    openRoute('/profile');
  };

  const handleSettingsClick = () => {
    openRoute('/settings');
  };

  return (
    <div
      ref={containerRef}
      className="relative no-drag text-xs text-slate-300 flex items-center select-none"
    >
      <button
        type="button"
        className="no-drag flex items-center gap-2 px-2 py-0.5 rounded hover:bg-neutral-800"
        onClick={toggleDropdown}
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        {avatarUrl && !avatarFailed ? (
          <img
            src={avatarUrl}
            alt={`${username} avatar`}
            className="w-5 h-5 rounded-full object-cover border border-slate-500"
            onError={() => setAvatarFailed(true)}
          />
        ) : (
          <span className="w-5 h-5 rounded-full bg-slate-600 flex items-center justify-center text-[9px] uppercase">
            {username.charAt(0)}
          </span>
        )}
        <span className="max-w-[100px] truncate text-ellipsis text-xs">{username}</span>
        <span className="text-[8px] opacity-70">▼</span>
      </button>

      {isOpen && (
        <div
          className="user-area-dropdown no-drag absolute right-0 top-full mt-2 min-w-[180px] overflow-hidden rounded-md border border-slate-700/70 bg-neutral-800 text-xs shadow-lg z-[10000]"
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
        >
          <button
            type="button"
            className="no-drag w-full text-left px-3 py-1.5 hover:bg-neutral-700"
            onClick={handleProfileClick}
          >
            Profile
          </button>
          <button
            type="button"
            className="no-drag w-full text-left px-3 py-1.5 hover:bg-neutral-700"
            onClick={handleSettingsClick}
          >
            Settings
          </button>
          <div className="mx-2 h-px bg-slate-600/70" />
          <button
            type="button"
            className="no-drag w-full text-left px-3 py-1.5 hover:bg-neutral-700"
            onClick={handleAuthClick}
          >
            {isLoggedIn ? 'Logout' : 'Login'}
          </button>
        </div>
      )}
    </div>
  );
};

export default UserArea;
