// Bejelentkezési oldal: használja a TokenController-t login és register műveletekhez
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// onLogin: szülőből érkező callback, ami elmenti a user adatokat globálisan (App-ben)
const Login = ({ onLogin }) => {
  // Form mezők lokális állapota
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Form elküldése: használja a TokenController-t
  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!username || !password) {
      setStatus('Please enter username and password');
      return;
    }

    if (isRegisterMode && !email) {
      setStatus('Please enter your email');
      return;
    }

    setIsLoading(true);
    setStatus('');

    try {
      if (isRegisterMode) {
        // Registration logic via TokenController
        const token = await window.electronAPI.register(username, password, email, {
          bio: bio.trim(),
          avatarUrl: avatarUrl.trim(),
        });
        
        // Validate token is a non-empty string
        if (token && typeof token === 'string' && token.trim().length > 0) {
          setStatus('Registration successful! Please log in.');
          setIsRegisterMode(false);
          setPassword('');
          setEmail('');
          setBio('');
          setAvatarUrl('');
        } else {
          setStatus('Registration failed. Username may already exist.');
        }
      } else {
        // Login logic via TokenController
        const token = await window.electronAPI.login(username, password);
        
        // Validate token is a non-empty string
        if (token && typeof token === 'string' && token.trim().length > 0) {
          let profile = null;
          if (typeof window?.electronAPI?.getCurrentUser === 'function') {
            try {
              profile = await window.electronAPI.getCurrentUser();
            } catch {
              profile = null;
            }
          }

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
          const resolvedUsername =
            typeof profile?.username === 'string' && profile.username.trim()
              ? profile.username.trim()
              : username;

          const userData = {
            id: profile?.id ?? null,
            username: resolvedUsername,
            bio: profile?.bio ?? null,
            avatarUrl: resolvedAvatarUrl,
            token: token.trim(),
          };

          // Sikeres belépésnél frissítjük a globális user állapotot
          if (onLogin) {
            onLogin(userData);
          }

          // Visszajelzés a felhasználónak, majd átirányítás a Store oldalra
          setStatus(`Logged in as ${resolvedUsername}`);
          setTimeout(() => navigate('/store'), 500);
        } else {
          setStatus('Login failed. Username or password might be invalid.');
        }
      }
    } catch (error) {
      console.error('Auth error:', error);
      setStatus(isRegisterMode 
        ? 'Registration failed: ' + (error.message || 'Unknown error')
        : 'Login failed. Username or password might be invalid.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center px-4 text-slate-100">
      <div className="w-full max-w-sm bg-slate-900/80 border border-slate-700 rounded-lg shadow-lg p-6">
        <h1 className="text-2xl font-semibold mb-1 text-center">
          {isRegisterMode ? 'Register' : 'Login'}
        </h1>
        <p className="text-xs text-slate-400 mb-6 text-center">
          {isRegisterMode 
            ? 'Create a new account to get started' 
            : 'Sign in to your account'}
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
              disabled={isLoading}
              className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          {isRegisterMode && (
            <>
              <div>
                <label className="block text-xs mb-1" htmlFor="email">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  disabled={isLoading}
                  className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs mb-1" htmlFor="avatarUrl">
                  Profile picture URL (optional)
                </label>
                <input
                  id="avatarUrl"
                  type="url"
                  disabled={isLoading}
                  placeholder="https://example.com/avatar.png"
                  className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs mb-1" htmlFor="bio">
                  Bio (optional)
                </label>
                <textarea
                  id="bio"
                  rows={3}
                  disabled={isLoading}
                  placeholder="Tell people a little about yourself"
                  className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50 resize-none"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs mb-1" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={isRegisterMode ? 'new-password' : 'current-password'}
              disabled={isLoading}
              className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="mt-2">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full rounded bg-sky-600 hover:bg-sky-500 text-sm font-medium py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Please wait...' : (isRegisterMode ? 'Sign Up' : 'Sign In')}
            </button>
          </div>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => {
              setIsRegisterMode(!isRegisterMode);
              setStatus('');
              setPassword('');
              setEmail('');
              setBio('');
              setAvatarUrl('');
            }}
            className="text-xs text-slate-400 hover:text-sky-400 transition-colors disabled:opacity-50"
          >
            {isRegisterMode ? 'Already have an account? Login' : 'Are you new? Register'}
          </button>
        </div>

        {status && (
          <div
            className={`mt-4 text-xs text-center ${
              status.startsWith('Logged in') || status.includes('successful') ? 'text-emerald-400' : 'text-rose-400'
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
