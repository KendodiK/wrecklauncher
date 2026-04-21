// Fő alkalmazás komponens, itt kezeljük a globális user állapotot és a route-okat
import { useState, useEffect, useCallback } from 'react';
import MainNavbar from './components/mainnavbar.jsx';
import { HashRouter, Routes, Route, useNavigate } from "react-router-dom";
import Login from "./components/pages/login.jsx";
import Store from "./components/pages/store.jsx";
import DownloadsPage from "./components/pages/download.jsx";
import FriendsPage from "./components/pages/friends.jsx";
import SettingsPage from "./components/pages/setting.jsx";
import ProfilePage from "./components/pages/profle.jsx";
import GamePage from "./components/pages/gamepage.jsx";
import StoreGamePage from "./components/pages/StoreGamePage.jsx";
import LibraryPage from "./components/pages/libraray.jsx";
import AllGamesPage from "./components/pages/AllGamesPage.jsx";
import { DownloadManagerProvider } from './context/DownloadManagerContext.jsx';

function resolveThemeSelection(rawTheme) {
  const normalized = String(rawTheme || '').trim().toLowerCase();
  if (normalized === 'purple-black') return 'purple-black';
  if (normalized === 'light-green') return 'light-green';
  if (normalized === 'light') return 'light';
  if (normalized === 'system') {
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }
    } catch {
      // ignore and fall back to dark
    }
  }
  return 'dark';
}

function applyDocumentTheme(rawTheme) {
  const theme = resolveThemeSelection(rawTheme);
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  document.body?.setAttribute('data-theme', theme);
}

// Listens for auth-expired events and redirects to the login page.
function AuthExpiredGuard({ onLogout }) {
  const navigate = useNavigate();
  useEffect(() => {
    const handle = () => {
      onLogout();
      navigate('/login');
    };
    window.addEventListener('wreck:auth-expired', handle);
    return () => window.removeEventListener('wreck:auth-expired', handle);
  }, [navigate, onLogout]);
  return null;
}

function App() {
  // user: bejelentkezett felhasználó adatai (vagy null, ha nincs bejelentkezve)
  const [user, setUser] = useState(null);

  // Startup auth bootstrap: if a token is saved, hydrate user info so UI is logged-in immediately.
  useEffect(() => {
    let cancelled = false;

    const bootstrapUserFromToken = async () => {
      try {
        const api = window?.electronAPI;
        if (!api || typeof api.getToken !== 'function') return;

        const token = await api.getToken();
        if (typeof token !== 'string' || !token.trim()) {
          if (!cancelled) setUser(null);
          return;
        }

        let profile = null;
        if (typeof api.getCurrentUser === 'function') {
          try {
            profile = await api.getCurrentUser();
          } catch (err) {
            profile = null;
          }
        }

        const userId = String(token).split('.')[0] || null;
        const username =
          typeof profile?.username === 'string' && profile.username.trim()
            ? profile.username.trim()
            : (userId ? `User ${userId}` : 'Player');
        const avatarCandidate =
          profile?.avatarUrl ||
          profile?.avatar_url ||
          profile?.avatarURL ||
          profile?.profilePicture ||
          profile?.pfp ||
          null;
        const resolvedAvatarUrl =
          typeof avatarCandidate === 'string' && avatarCandidate.trim()
            ? avatarCandidate.trim()
            : null;

        if (!cancelled) {
          setUser({
            id: profile?.id ?? userId,
            username,
            bio: profile?.bio ?? null,
            avatarUrl: resolvedAvatarUrl,
            token: token.trim(),
          });
        }
      } catch (err) {
        if (!cancelled) setUser(null);
      }
    };

    bootstrapUserFromToken();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const bootstrapTheme = async () => {
      try {
        const api = window?.electronAPI;
        if (!api || typeof api.getSettings !== 'function') {
          applyDocumentTheme('dark');
          return;
        }

        const settings = await api.getSettings();
        if (cancelled) return;
        applyDocumentTheme(settings?.display?.theme || 'dark');
      } catch {
        if (!cancelled) applyDocumentTheme('dark');
      }
    };

    bootstrapTheme();
    return () => {
      cancelled = true;
    };
  }, []);

  // Kijelentkezés: egyszerűen null-ra állítjuk a user állapotot
  const handleLogout = useCallback(() => {
    try {
      window?.localStorage?.removeItem('wrecklauncher.authToken');
      window?.localStorage?.removeItem('authToken');
      window?.localStorage?.removeItem('token');
      window?.localStorage?.removeItem('wreck_auth_token');
    } catch {
      // ignore
    }
    try {
      if (window?.electronAPI && typeof window.electronAPI.clearToken === 'function') {
        void window.electronAPI.clearToken();
      }
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  const handleLocalUserProfileUpdate = useCallback((profilePatch) => {
    const patch = profilePatch && typeof profilePatch === 'object' ? profilePatch : {};
    const hasBio = Object.prototype.hasOwnProperty.call(patch, 'bio');
    const hasAvatar = Object.prototype.hasOwnProperty.call(patch, 'avatarUrl');
    const hasUsername = Object.prototype.hasOwnProperty.call(patch, 'username');
    const hasProfileUpdatedAt = Object.prototype.hasOwnProperty.call(patch, 'profileUpdatedAt');

    if (!hasBio && !hasAvatar && !hasUsername && !hasProfileUpdatedAt) return;

    const incomingUsername = typeof patch.username === 'string' ? patch.username.trim() : '';
    const profileUpdatedAt = Number(patch.profileUpdatedAt);
    const nextProfileUpdatedAt = Number.isFinite(profileUpdatedAt) && profileUpdatedAt > 0
      ? profileUpdatedAt
      : Date.now();

    setUser((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        username: hasUsername && incomingUsername ? incomingUsername : previous.username,
        bio: hasBio ? (patch.bio ?? null) : previous.bio,
        avatarUrl: hasAvatar ? (patch.avatarUrl ?? null) : previous.avatarUrl,
        profileUpdatedAt: nextProfileUpdatedAt,
      };
    });
  }, []);

  return (
    <DownloadManagerProvider>
      <HashRouter>
        <div className="app-shell min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
          <AuthExpiredGuard onLogout={handleLogout} />
          <MainNavbar user={user} onLogout={handleLogout} />
          <main className="flex-1 pt-14">
            <Routes>
              <Route path="/login" element={<Login onLogin={setUser} />} />
              <Route path="/store" element={<Store />} />
              <Route path="/search" element={<AllGamesPage />} />
              <Route path="/store/game/:platform/:id" element={<StoreGamePage />} />
              <Route path="/library" element={<LibraryPage />} />
              <Route path="/all-games" element={<AllGamesPage />} />
              <Route path="/shop/all-games" element={<AllGamesPage />} />
              <Route path="/shop/platform/:platform" element={<AllGamesPage />} />
              <Route path="/game" element={<GamePage />} />
              <Route path="/game/:id" element={<GamePage />} />
              <Route path="/downloads" element={<DownloadsPage />} />
              <Route path="/friends" element={<FriendsPage user={user} />} />
              <Route path="/settings" element={<SettingsPage onProfileLocalUpdate={handleLocalUserProfileUpdate} />} />
              <Route path="/profile/:userId?" element={<ProfilePage user={user} />} />
              <Route path="/" element={<Store />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </DownloadManagerProvider>
  );
}

export default App;
