# Enhanced Store Navigation and Game Discovery

Transform the basic Store page into a rich game discovery experience with category tabs in the navbar, a search bar, and multiple game slider sections (Featured, Recommended, and Browse by Category). All categories will be fetched dynamically from the backend API, and the page will use the existing sophisticated Storeslider component throughout.

## Implementation Steps

### 1. Backend API endpoints

Add new routes to `api.js` after existing endpoints:
- `GET /api/genres` - Returns all genres from GenresController
- `GET /api/games` - Returns all games (optional pagination/limit params)
- `GET /api/games/genre/:genreId` - Returns games filtered by genre using GamesGenresConnectionController

**Implementation details:**
```javascript
// GET /api/genres
app.get('/api/genres', async (req, res) => {
  try {
    const genresCtrl = new genresController();
    const genres = await genresCtrl.index();
    return res.json(genres);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/games
app.get('/api/games', async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const gamesCtrl = new gamesController();
    const games = await gamesCtrl.index();
    // Optional: Apply limit/offset for pagination
    return res.json(games);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/games/genre/:genreId
app.get('/api/games/genre/:genreId', async (req, res) => {
  try {
    const { genreId } = req.params;
    const gamesGenresCtrl = new gamesGenresConnnectionController();
    const gameIds = await gamesGenresCtrl.getByGenreId(genreId);
    
    // Fetch full game details for each game ID
    const gamesCtrl = new gamesController();
    const games = await Promise.all(
      gameIds.map(item => gamesCtrl.show(item.game_id))
    );
    
    return res.json(games);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
```

### 2. Electron IPC layer

Update `frontendv3/electron/main.js` and `frontendv3/preload.js`:
- Add IPC handlers for `genres:get-all`, `games:get-all`, `games:get-by-genre`
- Create new GamesController methods or use direct HTTP calls to backend
- Expose via `window.electronAPI.getGenres()`, `getAllGames()`, `getGamesByGenre(genreId)`

**main.js additions:**
```javascript
// Add IPC handlers
ipcMain.handle('genres:get-all', async () => {
  try {
    const response = await fetch(`${backendUrl}/api/genres`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    throw new Error(`Failed to fetch genres: ${err.message}`);
  }
});

ipcMain.handle('games:get-all', async () => {
  try {
    const response = await fetch(`${backendUrl}/api/games`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    throw new Error(`Failed to fetch games: ${err.message}`);
  }
});

ipcMain.handle('games:get-by-genre', async (event, genreId) => {
  try {
    const response = await fetch(`${backendUrl}/api/games/genre/${genreId}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (err) {
    throw new Error(`Failed to fetch games by genre: ${err.message}`);
  }
});
```

**preload.js additions:**
```javascript
// Expose in contextBridge
getGenres: () => ipcRenderer.invoke('genres:get-all'),
getAllGames: () => ipcRenderer.invoke('games:get-all'),
getGamesByGenre: (genreId) => ipcRenderer.invoke('games:get-by-genre', genreId),
```

### 3. Category tabs in navbar

Create `frontendv3/src/components/navbar/CategoryTabs.jsx`:
- Horizontal scrollable tabs for major categories (Action, Adventure, RPG, etc.)
- Fetch genres on mount using `window.electronAPI.getGenres()`
- Active state styling with slate accent colors matching design system
- Click handler to filter Store content or scroll to category section
- Position between NavLinks and page content (not inside main navbar strip)

**Component structure:**
```jsx
import React, { useEffect, useState } from 'react';

const CategoryTabs = ({ selectedCategory, onCategorySelect }) => {
  const [genres, setGenres] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const api = window.electronAPI;
    if (!api?.getGenres) return;

    api.getGenres()
      .then(data => {
        setGenres(data || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load genres:', err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex gap-2 overflow-x-auto px-3 py-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-8 w-20 rounded-lg bg-slate-800/30 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto px-3 py-2 no-scrollbar">
      <button
        onClick={() => onCategorySelect(null)}
        className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
          selectedCategory === null
            ? 'bg-slate-700/60 text-slate-100 font-medium'
            : 'bg-slate-900/20 text-slate-300 hover:bg-slate-800/40'
        }`}
      >
        All
      </button>
      {genres.map(genre => (
        <button
          key={genre.id}
          onClick={() => onCategorySelect(genre)}
          className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap transition-colors ${
            selectedCategory?.id === genre.id
              ? 'bg-slate-700/60 text-slate-100 font-medium'
              : 'bg-slate-900/20 text-slate-300 hover:bg-slate-800/40'
          }`}
        >
          {genre.genre}
        </button>
      ))}
    </div>
  );
};

export default CategoryTabs;
```

### 4. Search bar component

Create `frontendv3/src/components/SearchBar.jsx`:
- Text input with search icon, styled with `rounded-lg border border-slate-700/60 bg-slate-950/20`
- Debounced onChange handler (300ms) to avoid excessive filtering
- Clear button when text exists
- Position "just under the toolbar" as user specified - integrate into Store page layout

**Component structure:**
```jsx
import React, { useCallback, useEffect, useState } from 'react';

const SearchBar = ({ value, onChange, placeholder = "Search games..." }) => {
  const [localValue, setLocalValue] = useState(value || '');

  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (onChange) onChange(localValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [localValue, onChange]);

  const handleClear = () => {
    setLocalValue('');
    if (onChange) onChange('');
  };

  return (
    <div className="relative">
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-10 pr-10 py-2 rounded-lg border border-slate-700/60 bg-slate-950/20 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-600/40"
      />
      {localValue && (
        <button
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default SearchBar;
```

### 5. Store page redesign

Update `frontendv3/src/components/pages/shopveiw.jsx`:
- Add SearchBar component at top of content area
- Add CategoryTabs component below search bar
- Create state for: `allGames`, `genres`, `searchQuery`, `selectedGenre`
- Fetch all games on mount with `window.electronAPI.getAllGames()`
- Filter logic: combine search query (match title) + selected genre
- Layout structure:
  - SearchBar
  - CategoryTabs
  - Featured Games section: `<h2>Featured Games</h2>` + Storeslider with curated subset
  - Recommended Games section: `<h2>Recommended</h2>` + Storeslider with algorithm/random selection
  - Browse by Category: Map over top 4-6 genres, render `<h2>{genreName}</h2>` + Storeslider for each
- All section headers use `text-2xl font-semibold mb-4 text-slate-100`

**Key implementation details:**
- Featured games: First 9 games or manually curated list
- Recommended games: Random selection or algorithm-based
- Browse by category sections: Show 4-6 major genres with horizontal sliders
- Each category section should have a ref for smooth scrolling
- Filter games client-side for instant feedback

### 6. Data transformation helpers

Add utility functions in `frontendv3/src/components/pages/shopveiw.jsx` or separate utils file:
- `gameToCardFormat(game)` - Transform backend game object to Storeslider card format `{id, appid, title, image}`
- `filterGamesBySearch(games, query)` - Case-insensitive title match
- `filterGamesByGenre(games, genreId)` - Match games with genre (requires games to include genre data)
- Steam image URLs: Use `library_600x900.jpg` pattern from existing `steamPoster()` function

**Helper functions:**
```javascript
function gameToCardFormat(game) {
  const appId = game.app_id || game.appid || game.id;
  return {
    id: game.id || appId,
    appid: appId,
    title: game.name || game.title || `Game ${appId}`,
    image: steamPoster(appId) || game.banner_img || `https://via.placeholder.com/440x640?text=${encodeURIComponent(game.name || 'Game')}`,
  };
}

function filterGamesBySearch(games, query) {
  if (!query || !query.trim()) return games;
  const q = query.trim().toLowerCase();
  return games.filter(game => 
    (game.name || game.title || '').toLowerCase().includes(q)
  );
}

function filterGamesByGenre(games, genreId) {
  if (!genreId) return games;
  return games.filter(game => 
    Array.isArray(game.genres) && game.genres.some(g => g.id === genreId || g.genre_id === genreId)
  );
}
```

### 7. Category navigation behavior

Implement smooth scroll-to-section in `shopveiw.jsx`:
- Use React refs for each category section
- CategoryTabs onClick triggers `scrollIntoView({ behavior: 'smooth', block: 'start' })`
- Option: Add "All" tab to reset filters and scroll to top

**Implementation approach:**
```javascript
const categoryRefs = useRef({});

const handleCategorySelect = (genre) => {
  setSelectedGenre(genre);
  
  if (!genre) {
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (categoryRefs.current[genre.id]) {
    // Scroll to category section
    categoryRefs.current[genre.id].scrollIntoView({ 
      behavior: 'smooth', 
      block: 'start',
      inline: 'nearest'
    });
  }
};
```

### 8. Loading and error states

Add to `shopveiw.jsx`:
- Show skeleton loaders for sliders while fetching data
- Error messages if API calls fail: `text-xs text-rose-300/90` styling
- Empty state if no games match search/filter: "No games found" with slate-400 text

**Example states:**
```jsx
// Loading state
{loading && (
  <div className="flex flex-col gap-4">
    <div className="h-8 w-48 bg-slate-800/30 rounded animate-pulse" />
    <div className="h-80 bg-slate-800/30 rounded-xl animate-pulse" />
  </div>
)}

// Error state
{error && (
  <div className="text-xs text-rose-300/90 bg-rose-950/20 border border-rose-900/30 rounded-lg p-3">
    {error}
  </div>
)}

// Empty state
{filteredGames.length === 0 && (
  <div className="text-sm text-slate-400 text-center py-12">
    No games found matching your search.
  </div>
)}
```

## Verification Steps

1. Start backend: `node server.js` in project root
2. Start Electron app: `npm run dev` in frontendv3/
3. Navigate to Store page, verify:
   - Category tabs appear below search bar with genres from backend
   - Search bar filters games in real-time
   - Featured Games slider displays with stack carousel
   - Recommended Games slider displays
   - 4-6 "Browse by Category" sections render with genre titles
   - Clicking category tab scrolls to that section
   - All sliders use Storeslider component with proper styling

## Technical Decisions

- **Store page only**: User specified Store page as target, Library remains unchanged
- **Category tabs style**: Horizontal tabs chosen per user selection over dropdown/sidebar
- **Backend data source**: Genres fetched from API, enables dynamic category management
- **Search placement**: Positioned at top of Store page content area "just under toolbar" per user input
- **Slider reuse**: All game sections use existing Storeslider for consistency and leverage stack mode animations

## Current Codebase Context

### Existing Components
- **Storeslider**: Sophisticated 3D stack slider with scale, opacity, blur effects
- **GameSliderBase**: Core slider engine with translate and stack modes, keyboard navigation
- **mainnavbar**: Two-tier navigation with modular subcomponents
- **NavLinks**: Current navigation links (Store, Library, Downloads, Friends)

### Data Flow
- Backend API → Electron IPC → React components
- Token-based authentication via `window.electronAPI`
- Steam API integration for game details and images

### Styling System
- **Tailwind CSS** with custom PostCSS configuration
- Dark theme with slate color palette
- Consistent card styling: `rounded-xl border border-slate-700/60 bg-slate-900/20 backdrop-blur`
- Framer Motion for animations

### API Endpoints Available
- `/api/games/:id` - Single game by ID
- `/api/games/:id/all` - Game with all foreign relations (genres, platforms, etc.)
- `/api/nativeUser` - Current user info
- `/api/platforms/:platformName` - Platform details

### Files to Modify
1. `api.js` - Add new genre and games endpoints
2. `frontendv3/electron/main.js` - Add IPC handlers
3. `frontendv3/preload.js` - Expose new API methods
4. `frontendv3/src/components/pages/shopveiw.jsx` - Complete redesign
5. `frontendv3/src/components/navbar/CategoryTabs.jsx` - New component
6. `frontendv3/src/components/SearchBar.jsx` - New component

### Files to Reference (Do Not Modify)
- `frontendv3/src/components/Storeslider.jsx` - Reuse as-is
- `frontendv3/src/components/GameSliderBase.jsx` - Reference for inspiration
- `database/controllers/GenresController.js` - Backend genre controller
- `database/controllers/GamesGenresConnectionController.js` - Games-genres relationship
