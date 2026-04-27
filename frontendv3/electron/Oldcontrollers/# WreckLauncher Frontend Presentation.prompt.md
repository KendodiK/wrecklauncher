# WreckLauncher Frontend Presentation
## React + Electron Game Launcher

---

## 1. Introduction (2 minutes)

### What is WreckLauncher?
- **Desktop game launcher** built with Electron + React
- Aggregates games from multiple platforms (Steam, Epic Games)
- Custom UI with **frameless window** design
- Modern web technologies in a native desktop app

### Technology Stack
- **Frontend Framework:** React 18 with Hooks
- **Desktop Runtime:** Electron (Chromium + Node.js)
- **Routing:** React Router (Hash-based for Electron)
- **Styling:** Tailwind CSS + Custom CSS
- **Animations:** Framer Motion
- **Build Tool:** Vite

---

## 2. Electron + React Architecture (3 minutes)

### The Two-Process Model

```
┌─────────────────────────────────────────┐
│         Main Process (Node.js)          │
│  - Window management                    │
│  - System APIs                          │
│  - Backend controllers                  │
│  - IPC handlers                         │
└──────────────┬──────────────────────────┘
               │ IPC Bridge
┌──────────────▼──────────────────────────┐
│      Renderer Process (Chromium)        │
│  - React application                    │
│  - UI components                        │
│  - User interactions                    │
└─────────────────────────────────────────┘
```

### Main Process Setup

**File:** `frontendv3/electron/main.js`

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    frame: false,  // Custom title bar!
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      // contextIsolation: true (default) - Security!
    },
  });

  // Load React app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}
```

**Key Points:**
- `frame: false` - We control the entire window
- `preload.js` - The security bridge between processes
- Dev mode loads Vite dev server, production loads built files

---

## 3. Secure IPC Communication (4 minutes)

### The Context Bridge (Preload Script)

**File:** `frontendv3/preload.js`

```javascript
const { contextBridge, ipcRenderer } = require('electron');

// Expose ONLY safe APIs to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  
  // Backend communication
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  
  // User authentication
  login: (username, password) => 
    ipcRenderer.invoke('user:login', username, password),
  
  // Game data
  getSteamGameDetails: (appID) => 
    ipcRenderer.invoke('steam:get-game-details', appID),
});
```

**Why Context Bridge?**
- ✅ **Security:** Prevents renderer from accessing full Node.js APIs
- ✅ **Type Safety:** Explicit API surface
- ✅ **Maintainability:** Clear contract between processes

### IPC Handlers in Main Process

**File:** `frontendv3/electron/main.js`

```javascript
// Window controls
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());

// Async data fetching
ipcMain.handle('user:login', async (event, username, password) => {
  try {
    const result = await getUserCtrl().login(username, password);
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

---

## 4. Custom Frameless Window (3 minutes)

### The Challenge
Without `frame: true`, we lose:
- ❌ Title bar
- ❌ Window controls (minimize/maximize/close)
- ❌ Drag-to-move functionality

### Our Solution: Custom Title Bar Component

**File:** `frontendv3/src/components/mainnavbar.jsx`

```jsx
const MainNavbar = ({ user, onLogout }) => {
  return (
    <div className="main-navbar flex flex-col">
      {/* Top row: Branding + Window Controls */}
      <div className="flex justify-between items-center">
        {/* Left: App menu (draggable area) */}
        <AppIconMenu onLogout={onLogout} />
        
        {/* Right: User + Window buttons */}
        <div className="flex items-center gap-2 no-drag">
          <UserArea user={user} />
          <WindowControls />
        </div>
      </div>
      
      {/* Bottom row: Navigation */}
      <div className="flex items-center gap-2">
        <NavArrows />
        <NavLinks />
      </div>
    </div>
  );
};
```

### Window Controls Component

**File:** `frontendv3/src/components/navbar/WindowControls.jsx`

```jsx
const WindowControls = () => {
  const handleMinimize = () => {
    window.electronAPI?.minimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize();
  };

  const handleClose = () => {
    window.electronAPI?.close();
  };

  return (
    <div className="window-controls flex gap-1">
      <button onClick={handleMinimize} 
              className="hover:bg-slate-700 px-3">
        ─
      </button>
      <button onClick={handleMaximize}
              className="hover:bg-slate-700 px-3">
        □
      </button>
      <button onClick={handleClose}
              className="hover:bg-red-600 px-3">
        ✕
      </button>
    </div>
  );
};
```

### Making it Draggable

**File:** `frontendv3/src/index.css`

```css
.main-navbar {
  -webkit-app-region: drag;  /* Entire navbar is draggable */
}

.main-navbar .no-drag {
  -webkit-app-region: no-drag;  /* Except interactive elements */
}
```

**Result:** Professional native-like window with full custom styling!

---

## 5. React Component Architecture (4 minutes)

### Organized by Feature

```
src/components/
├── store/              # Store page components
│   ├── GameGrid.jsx
│   ├── RightSidebar.jsx
│   ├── PriceRangeSlider.jsx
│   └── Storeslider.jsx
│
├── library/            # Library page components
│   ├── GameSlider.jsx
│   ├── GameSliderStack.jsx
│   └── GameListPopup.jsx
│
├── shared/             # Reusable base components
│   └── GameSliderBase.jsx
│
├── navbar/             # Navigation subcomponents
│   ├── WindowControls.jsx
│   ├── NavLinks.jsx
│   └── UserArea.jsx
│
└── pages/              # Route components
    ├── shopveiw.jsx
    ├── libraray.jsx
    └── gamepage.jsx
```

### React Router in Electron

**File:** `frontendv3/src/App.jsx`

```jsx
function App() {
  const [user, setUser] = useState(null);

  return (
    <HashRouter>  {/* Hash-based for file:// protocol */}
      <div className="min-h-screen flex flex-col">
        <MainNavbar user={user} onLogout={() => setUser(null)} />
        
        <Routes>
          <Route path="/" element={<Store />} />
          <Route path="/store" element={<Store />} />
          <Route path="/library" element={
            <ProtectedRoute user={user}>
              <LibraryPage />
            </ProtectedRoute>
          } />
          <Route path="/game/:id" element={<GamePage />} />
        </Routes>
      </div>
    </HashRouter>
  );
}
```

**Why HashRouter?**
- Electron apps use `file://` protocol
- BrowserRouter needs a real HTTP server
- HashRouter works with `file://` URLs

---

## 6. Store Page Deep Dive (5 minutes)

### Layout Design

```
┌────────────────────────────────────────────────────┐
│              MainNavbar (fixed)                    │
├──────────────────────────────┬─────────────────────┤
│                              │                     │
│  Main Content Area           │  Right Sidebar      │
│  - Featured Carousel         │  - Genre Tabs       │
│  - Deals Carousel            │  - Search Bar       │
│  - Coming Soon Carousel      │  - Price Filter     │
│  OR                          │  (fixed, 320px)     │
│  - Search Results Grid       │                     │
│  (scrollable)                │                     │
└──────────────────────────────┴─────────────────────┘
```

### Store Page Component

**File:** `frontendv3/src/components/pages/shopveiw.jsx`

```jsx
const Shopveiw = () => {
  const [allGames, setAllGames] = useState([]);
  const [genres, setGenres] = useState([]);
  const [filters, setFilters] = useState({
    query: '',
    genres: [],
    priceRange: { min: 0, max: 100 },
  });

  // Filter games based on sidebar controls
  const filteredGames = useMemo(() => {
    return combineFilters(allGames, filters);
  }, [allGames, filters]);

  const hasFilters = useMemo(() => {
    return checkActiveFilters(filters);
  }, [filters]);

  return (
    <div className="flex-1 relative">
      {/* Main content - right margin for sidebar */}
      <div className="h-full mr-80 px-3 py-4 overflow-y-auto">
        
        {/* Show carousels when no filters active */}
        {!hasFilters && (
          <div className="space-y-8">
            <section>
              <h2>Featured</h2>
              <Storeslider items={FEATURED_GAMES} />
            </section>
            
            <section>
              <h2>Deals & Discounts</h2>
              <Storeslider items={DISCOUNTED_GAMES} />
            </section>
          </div>
        )}

        {/* Show grid when filters active */}
        {hasFilters && (
          <section>
            <h2>Search Results ({filteredGames.length})</h2>
            <GameGrid games={filteredGames} />
          </section>
        )}
      </div>

      {/* Fixed right sidebar */}
      <RightSidebar 
        genres={genres}
        onFiltersChange={setFilters}
      />
    </div>
  );
};
```

### Right Sidebar with Live Filtering

**File:** `frontendv3/src/components/store/RightSidebar.jsx`

```jsx
const RightSidebar = ({ genres, onFiltersChange }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenres, setSelectedGenres] = useState([]);
  const [priceRange, setPriceRange] = useState({ min: 0, max: 100 });

  // Debounced search (300ms)
  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);

    clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      notifyFiltersChange(value, selectedGenres, priceRange);
    }, 300);
  };

  const notifyFiltersChange = (query, genres, price) => {
    onFiltersChange?.({
      query,
      genres,
      priceRange: price,
    });
  };

  return (
    <div className="fixed right-0 top-[73px] h-[calc(100vh-73px)] w-80 
                    bg-slate-900/95 backdrop-blur-sm">
      {/* Search input */}
      <input
        type="text"
        value={searchQuery}
        onChange={handleSearchChange}
        placeholder="Search games..."
      />

      {/* Genre tabs */}
      <div className="flex gap-2 overflow-x-auto">
        {genres.map((genre) => (
          <button onClick={() => handleGenreTabClick(genre.id)}>
            {genre.name}
          </button>
        ))}
      </div>

      {/* Price range slider */}
      <PriceRangeSlider
        value={priceRange}
        onChange={setPriceRange}
      />
    </div>
  );
};
```

### Steam-Style Game Grid

**File:** `frontendv3/src/components/store/GameGrid.jsx`

```jsx
const GameGrid = ({ games, isLoading, emptyMessage }) => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {games.map((game) => (
        <div
          key={game.id}
          onClick={() => navigate(`/game/${game.id}`)}
          className="group cursor-pointer rounded-lg 
                     hover:scale-[1.02] transition-all"
        >
          {/* Game cover image */}
          <div className="aspect-[3/4] overflow-hidden">
            <img
              src={game.image}
              alt={game.title}
              className="w-full h-full object-cover 
                         group-hover:scale-105 transition-transform"
            />
            
            {/* Hover overlay */}
            <div className="opacity-0 group-hover:opacity-100 
                           transition-opacity">
              View Details
            </div>
          </div>

          {/* Game info */}
          <div className="p-3">
            <h3>{game.title}</h3>
            <span>${game.price.toFixed(2)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};
```

---

## 7. Steam Integration (2 minutes)

### Dynamic Game Images

```jsx
function getSteamImageUrl(appid, type = 'library_600x900') {
  const id = Number(appid);
  if (!Number.isFinite(id) || id <= 0) return null;
  
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/${type}.jpg`;
}

// Usage
const gameImage = getSteamImageUrl(1245620); // ELDEN RING
// -> https://cdn.cloudflare.steamstatic.com/.../1245620/library_600x900.jpg
```

### Fetching Game Details via IPC

```jsx
// Renderer (React)
const fetchGameDetails = async (appId) => {
  const details = await window.electronAPI.getSteamGameDetails(appId);
  setGameData(details);
};

// Main Process (Electron)
ipcMain.handle('steam:get-game-details', async (event, appID) => {
  const response = await fetch(
    `https://store.steampowered.com/api/appdetails?appids=${appID}`
  );
  return await response.json();
});
```

---

## 8. Animation & Polish (2 minutes)

### Framer Motion Integration

**File:** `frontendv3/src/components/shared/GameSliderBase.jsx`

```jsx
import { motion, useReducedMotion } from 'framer-motion';

const GameSliderBase = ({ items, mode = 'stack' }) => {
  const prefersReducedMotion = useReducedMotion();

  const cardVariants = {
    active: {
      scale: prefersReducedMotion ? 1 : 1.05,
      opacity: 1,
      filter: 'blur(0px)',
    },
    inactive: {
      scale: prefersReducedMotion ? 0.95 : 0.9,
      opacity: 0.6,
      filter: prefersReducedMotion ? 'blur(0px)' : 'blur(2px)',
    },
  };

  return (
    <motion.div
      animate={cardVariants.active}
      exit={cardVariants.inactive}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {/* Card content */}
    </motion.div>
  );
};
```

### Tailwind Transitions

```jsx
<div className="
  transition-all duration-300
  hover:scale-[1.02] 
  hover:shadow-lg
  hover:border-slate-500/50
">
  {/* Interactive element */}
</div>
```

---

## 9. Development Workflow (2 minutes)

### Concurrent Dev Servers

**File:** `frontendv3/package.json`

```json
{
  "scripts": {
    "dev": "vite",
    "dev:electron": "NODE_ENV=development electron .",
    "build": "vite build",
    "build:electron": "electron-builder"
  }
}
```

**Development:**
1. Terminal 1: `npm run dev` → Vite dev server (http://localhost:5173)
2. Terminal 2: `npm run dev:electron` → Electron loads dev server
3. Hot reload works for React components!

**Production Build:**
```bash
npm run build           # Build React app to dist/
npm run build:electron  # Package Electron app with built files
```

### File Structure for Electron + Vite

```
frontendv3/
├── electron/           # Main process code
│   ├── main.js
│   └── controllers/
├── src/                # React app (renderer)
│   ├── App.jsx
│   ├── components/
│   └── utils/
├── preload.js          # IPC bridge
├── package.json
└── vite.config.cjs     # Vite configuration
```

---

## 10. Key Takeaways (1 minute)

### What Makes This Architecture Great

✅ **Security First**
- Context Bridge isolates renderer from Node.js
- No direct filesystem access from UI

✅ **Best of Both Worlds**
- React's component model + state management
- Electron's native OS integration

✅ **Professional UX**
- Custom frameless window design
- Smooth animations and transitions
- Responsive, modern interface

✅ **Maintainable Structure**
- Feature-based component organization
- Clear IPC contracts
- TypeScript-ready foundation

✅ **Performance**
- Vite for lightning-fast HMR
- Lazy loading with React.lazy
- Optimized image loading from CDN

### Why React + Electron?

| Feature | Benefit |
|---------|---------|
| **React** | Component reusability, virtual DOM, huge ecosystem |
| **Electron** | Cross-platform, system APIs, native packaging |
| **Combined** | Build desktop apps with web skills! |

---

## 11. Live Demo Flow (3 minutes)

### Demo Script

1. **Launch app** - Show custom title bar + window controls
2. **Store page** - Demonstrate carousels with Steam games
3. **Right sidebar** - Filter by genre, show instant results
4. **Search** - Type game name, show grid layout
5. **Price filter** - Adjust dual-thumb slider
6. **Navigation** - Click game card → Game detail page
7. **Dev Tools** - Open Chromium DevTools (F12)
8. **IPC inspection** - Show console logs of IPC calls

### Questions to Address

**Q: Why not just make a web app?**
- Need filesystem access (scan installed games)
- Better offline support
- Native OS integration (notifications, tray icon)
- Can bundle Node.js backend

**Q: Why not use native frameworks?**
- Web skills more common on team
- Faster iteration with hot reload
- Rich UI component libraries
- Same codebase could deploy as web app

**Q: Performance concerns?**
- Chromium footprint (~100-150MB RAM)
- Fine for launcher apps (not CPU-intensive tasks)
- Users expect desktop-quality UX

---

## 12. Future Enhancements

### Planned Features

- **Auto-updates** via `electron-updater`
- **System tray** integration
- **Game installation** through platform APIs
- **Playtime tracking** 
- **Steam/Epic authentication** with OAuth
- **Cloud save sync**

### Technical Improvements

- **TypeScript migration** for type safety
- **E2E testing** with Playwright
- **State management** with Zustand/Redux
- **Database** integration (SQLite via better-sqlite3)

---

## Resources

### Documentation
- **Electron:** https://www.electronjs.org/docs
- **React:** https://react.dev
- **Vite:** https://vitejs.dev

### Code Repository
- GitHub: [wrecklauncher](https://github.com/your-org/wrecklauncher)

### Contact
- Email: your.email@example.com
- Discord: YourDiscord#1234

---

## Thank You!

### Questions?

**Key Files to Explore:**
- `frontendv3/electron/main.js` - Main process
- `frontendv3/preload.js` - IPC bridge  
- `frontendv3/src/App.jsx` - React root
- `frontendv3/src/components/mainnavbar.jsx` - Custom title bar
- `frontendv3/src/components/pages/shopveiw.jsx` - Store page

**Try it yourself:**
```bash
cd frontendv3
npm install
npm run dev &
npm run dev:electron
```
