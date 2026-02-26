// Fő alkalmazás komponens, itt kezeljük a globális user állapotot és a route-okat
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import MainNavbar from './components/mainnavbar.jsx';
import { HashRouter, Routes, Route } from "react-router-dom";
import Login from "./components/pages/login.jsx";
import Store from "./components/pages/store.jsx";
import LibraryPage from "./components/pages/libraray.jsx";
import DownloadsPage from "./components/pages/download.jsx";
import FriendsPage from "./components/pages/friends.jsx";
import SettingsPage from "./components/pages/setting.jsx";
import ProfilePage from "./components/pages/profle.jsx";
import GamePage from "./components/pages/gamepage.jsx";

// Protected Route Component - redirects to login if not authenticated
const ProtectedRoute = ({ user, children }) => {
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

function App() {
  // user: bejelentkezett felhasználó adatai (vagy null, ha nincs bejelentkezve)
  const [user, setUser] = useState(null);

  // Kijelentkezés: egyszerűen null-ra állítjuk a user állapotot
  const handleLogout = () => {
    setUser(null);
  };

  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <MainNavbar user={user} onLogout={handleLogout} />
        <Routes>
          <Route path="/login" element={<Login onLogin={setUser} />} />
          <Route path="/store" element={<Store />} />
          <Route path="/" element={<Store />} />
          <Route path="/library" element={
            <ProtectedRoute user={user}>
              <LibraryPage />
            </ProtectedRoute>
          } />
          <Route path="/game" element={<GamePage />} />
          <Route path="/game/:id" element={<GamePage />} />
          <Route path="/downloads" element={
            <ProtectedRoute user={user}>
              <DownloadsPage />
            </ProtectedRoute>
          } />
          <Route path="/friends" element={
            <ProtectedRoute user={user}>
              <FriendsPage />
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute user={user}>
              <SettingsPage />
            </ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute user={user}>
              <ProfilePage user={user} />
            </ProtectedRoute>
          } />
        </Routes>
      </div>
    </HashRouter>
  );
}

export default App;
