// Bejelentkezési oldal: statikus teszt felhasználóval és átirányítással a Store oldalra
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Statikus teszt user, amivel be lehet lépni
const TEST_USER = {
  username: 'testuser',
  password: 'password123',
  avatarUrl: null,
};

// onLogin: szülőből érkező callback, ami elmenti a user adatokat globálisan (App-ben)
const Login = ({ onLogin }) => {
  // Form mezők lokális állapota
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const navigate = useNavigate();

  // Form elküldése: ellenőrizzük a teszt user adatokat
  const handleSubmit = (event) => {
    event.preventDefault();

    if (username === TEST_USER.username && password === TEST_USER.password) {
      const userData = {
        username: TEST_USER.username,
        avatarUrl: TEST_USER.avatarUrl,
      };

      // Sikeres belépésnél frissítjük a globális user állapotot
      if (onLogin) {
        onLogin(userData);
      }

      // Visszajelzés a felhasználónak, majd átirányítás a Store oldalra
      setStatus(`Logged in as ${TEST_USER.username}`);
      navigate('/store');
    } else {
      setStatus('Invalid username or password');
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 text-slate-100">
      <div className="w-full max-w-sm bg-slate-900/80 border border-slate-700 rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-semibold mb-1 text-center">Login</h1>
        <p className="text-xs text-slate-400 mb-6 text-center">
          Use <span className="font-mono">testuser</span> / <span className="font-mono">password123</span> to log in.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs mb-1" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex gap-2 mt-2">
            <button
              type="submit"
              className="flex-1 rounded bg-sky-600 hover:bg-sky-500 text-sm font-medium py-1.5 transition-colors"
            >
              Sign In
            </button>
            <button
              type="button"
              className="flex-1 rounded bg-neutral-700 hover:bg-neutral-600 text-sm font-medium py-1.5 transition-colors"
              onClick={() => navigate('/store')}
            >
              Sign Up
            </button>
          </div>
        </form>

        {status && (
          <div
            className={`mt-4 text-xs text-center ${
              status.startsWith('Logged in') ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {status}
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
