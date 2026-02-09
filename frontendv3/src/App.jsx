// Fő alkalmazás komponens, itt kezeljük a globális user állapotot és a route-okat
import { useState } from 'react';
import MainNavbar from './components/mainnavbar.jsx';
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Login from "./components/pages/login.jsx";
import Store from "./components/pages/store.jsx";
import LibraryPage from "./components/pages/libraray.jsx";
import DownloadsPage from "./components/pages/download.jsx";
import FriendsPage from "./components/pages/friends.jsx";
import SettingsPage from "./components/pages/setting.jsx";
import ProfilePage from "./components/pages/profle.jsx";

function App() {
  // user: bejelentkezett felhasználó adatai (vagy null, ha nincs bejelentkezve)
  const [user, setUser] = useState(null);

  // Kijelentkezés: egyszerűen null-ra állítjuk a user állapotot
  const handleLogout = () => {
    setUser(null);
  };

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <MainNavbar user={user} onLogout={handleLogout} />
        <Routes>
          <Route path="/login" element={<Login onLogin={setUser} />} />
          <Route path="/store" element={<Store />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/downloads" element={<DownloadsPage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/" element={<Store />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
