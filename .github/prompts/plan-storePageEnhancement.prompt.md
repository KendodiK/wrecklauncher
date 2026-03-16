
Backend API endpoints - Add new routes to api.js after existing endpoints:

GET /api/genres - Returns all genres from GenresController
GET /api/games - Returns all games (optional pagination/limit params)
GET /api/games/genre/:genreId - Returns games filtered by genre using GamesGenresConnectionController
Electron IPC layer - Update frontendv3/electron/main.js and frontendv3/preload.js:

Add IPC handlers for genres:get-all, games:get-all, games:get-by-genre
Create new GamesController methods or use direct HTTP calls to backend
Expose via window.electronAPI.getGenres(), getAllGames(), getGamesByGenre(genreId)
Category tabs in navbar - Create frontendv3/src/components/navbar/CategoryTabs.jsx:

Horizontal scrollable tabs for major categories (Action, Adventure, RPG, etc.)
Fetch genres on mount using window.electronAPI.getGenres()
Active state styling with slate accent colors matching design system
Click handler to filter Store content or scroll to category section
Position between NavLinks and page content (not inside main navbar strip)
Search bar component - Create frontendv3/src/components/SearchBar.jsx:

Text input with search icon, styled with rounded-lg border border-slate-700/60 bg-slate-950/20
Debounced onChange handler (300ms) to avoid excessive filtering
Clear button when text exists
Position "just under the toolbar" as user specified - integrate into Store page layout
Store page redesign - Update frontendv3/src/components/pages/shopveiw.jsx:

Add SearchBar component at top of content area
Add CategoryTabs component below search bar
Create state for: allGames, genres, searchQuery, selectedGenre
Fetch all games on mount with window.electronAPI.getAllGames()
Filter logic: combine search query (match title) + selected genre
Layout structure:
SearchBar
CategoryTabs
Featured Games section: <h2>Featured Games</h2> + Storeslider with curated subset
Recommended Games section: <h2>Recommended</h2> + Storeslider with algorithm/random selection
Browse by Category: Map over top 4-6 genres, render <h2>{genreName}</h2> + Storeslider for each
All section headers use text-2xl font-semibold mb-4 text-slate-100
Data transformation helpers - Add utility functions in frontendv3/src/components/pages/shopveiw.jsx or separate utils file:

gameToCardFormat(game) - Transform backend game object to Storeslider card format {id, appid, title, image}
filterGamesBySearch(games, query) - Case-insensitive title match
filterGamesByGenre(games, genreId) - Match games with genre (requires games to include genre data)
Steam image URLs: Use library_600x900.jpg pattern from existing steamPoster() function
Category navigation behavior - Implement smooth scroll-to-section in shopveiw.jsx:

Use React refs for each category section
CategoryTabs onClick triggers scrollIntoView({ behavior: 'smooth', block: 'start' })
Option: Add "All" tab to reset filters and scroll to top
Loading and error states - Add to shopveiw.jsx:

Show skeleton loaders for sliders while fetching data
Error messages if API calls fail: text-xs text-rose-300/90 styling
Empty state if no games match search/filter: "No games found" with slate-400 text
Verification

Start backend: node server.js in project root
Start Electron app: npm run dev in frontendv3/
Navigate to Store page, verify:
Category tabs appear below search bar with genres from backend
Search bar filters games in real-time
Featured Games slider displays with stack carousel
Recommended Games slider displays
4-6 "Browse by Category" sections render with genre titles
Clicking category tab scrolls to that section
All sliders use Storeslider component with proper styling
Decisions

Store page only: User specified Store page as target, Library remains unchanged
Category tabs style: Horizontal tabs chosen per user selection over dropdown/sidebar
Backend data source: Genres fetched from API, enables dynamic category management
Search placement: Positioned at top of Store page content area "just under toolbar" per user input
Slider reuse: All game sections use existing Storeslider for consistency and leverage stack mode animations