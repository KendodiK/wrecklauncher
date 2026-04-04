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

        if (!cancelled) {
          setUser({
            id: profile?.id ?? userId,
            username,
            bio: profile?.bio ?? null,
            avatarUrl: profile?.avatarUrl ?? null,
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

  // Kijelentkezés: egyszerűen null-ra állítjuk a user állapotot
  const handleLogout = useCallback(() => {
    try {
      if (window?.electronAPI && typeof window.electronAPI.clearToken === 'function') {
        void window.electronAPI.clearToken();
      }
    } catch {
      // ignore
    }
    setUser(null);
  }, []);

  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <AuthExpiredGuard onLogout={handleLogout} />
        <MainNavbar user={user} onLogout={handleLogout} />
        <Routes>
          <Route path="/login" element={<Login onLogin={setUser} />} />
          <Route path="/store" element={<Store />} />
          <Route path="/store/game/:platform/:id" element={<StoreGamePage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/all-games" element={<AllGamesPage />} />
          <Route path="/shop/all-games" element={<AllGamesPage />} />
          <Route path="/shop/platform/:platform" element={<AllGamesPage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/game/:id" element={<GamePage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage user={user} />} />
          <Route path="/" element={<Store />} />
        </Routes>
      </div>
    </HashRouter>
  );
}

export default App;
