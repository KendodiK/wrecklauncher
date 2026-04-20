# Plan: Store Page with Navigation & Game Discovery

**TL;DR**: Enhance the store page with a navbar (search, categorize filter, jump-to-filter), two slider sections reusing [Storeslider.jsx](frontendv3/src/components/Storeslider.jsx) for Featured (new releases) and Recommended (popular) games, and a Browse by Category section with genre tiles. Games are sourced from the database (scraped from Steam/other sites). Search provides real-time filtering using existing genre system.

**Key Decisions:**
- Featured = new releases (requires `created_at` field) vs Recommended = popular games (requires view/download count tracking)
- Use existing database genres (Action, Adventure, RPG) for categorization
- Real-time search filtering as user types
- Backend needs new endpoints for game listing, filtering, and sorting

## Steps

### 1. Backend: Add Game Listing & Search Endpoints

**File**: [api.js](api.js)

Add the following endpoints:
- `GET /api/games` - List all games with pagination, genre filtering, search query, sorting (newest/popular)
- `GET /api/games/featured` - Get newest games (limit 10-15)
- `GET /api/games/recommended` - Get popular games (limit 10-15)
- `GET /api/genres` - List all available genres

Update `GamesController` and `GenresController` to support these queries.

**Implementation details:**
- Pagination: `page` and `limit` query params
- Filtering: `genreId` or `genre` query param (supports multiple)
- Search: `q` or `search` query param (searches game name)
- Sorting: `sort` query param (values: `newest`, `popular`, `name`)
- Join with `game_genres_connections` and `genres` tables for genre filtering
- Join with `platforms` table for platform information

### 2. Backend: Database Schema Updates

**File**: [database/makers/GamesTableMaker.js](database/makers/GamesTableMaker.js)

Add new fields to the games table:
- `created_at` timestamp field (for Featured sorting) - defaults to current timestamp
- `view_count` or `download_count` integer field (for Recommended sorting) - defaults to 0
- Consider adding indexes on these fields for performance

**Migration considerations:**
- Existing games will need default values
- `created_at` can be set to current timestamp for all existing games
- `view_count` initialized to 0 for all existing games

### 3. Frontend: Add IPC Methods

**Files**: 
- [frontendv3/preload.js](frontendv3/preload.js)
- [frontendv3/electron/controllers/GamesController.js](frontendv3/electron/controllers/GamesController.js)

Add the following IPC methods in preload.js:
```javascript
getAllGames: (page, limit, genreId, searchQuery, sort) => ipcRenderer.invoke('get-all-games', page, limit, genreId, searchQuery, sort)
getFeaturedGames: () => ipcRenderer.invoke('get-featured-games')
getRecommendedGames: () => ipcRenderer.invoke('get-recommended-games')
getAllGenres: () => ipcRenderer.invoke('get-all-genres')
```

Wire these in GamesController.js to corresponding API endpoints.

### 4. Frontend: Create Store Navbar Component

**New file**: [frontendv3/src/components/StoreNavbar.jsx](frontendv3/src/components/StoreNavbar.jsx)

Component features:
- **Search bar**: Real-time onChange handler with debouncing (300ms)
  - Input field with search icon
  - Clear button when text is present
  - Emit `onSearchChange` callback to parent
  
- **Categorize dropdown/button**: Shows genre filters
  - Dropdown or modal with genre checkboxes
  - Multi-select support
  - "Apply Filters" button
  - Emit `onGenreFilterChange` callback to parent
  
- **Jump to Filter**: Section selector buttons
  - Buttons for: Featured → Recommended → Categories
  - Smooth scroll to section on click
  - Emit `onJumpToSection` callback or handle scroll directly via refs
  
**Styling**:
- Use Tailwind utility classes matching existing dark theme (slate colors)
- Sticky/fixed positioning at top of store page
- Responsive design (collapse to hamburger on mobile if needed)

### 5. Frontend: Create Browse by Category Component

**New file**: [frontendv3/src/components/BrowseByCategory.jsx](frontendv3/src/components/BrowseByCategory.jsx)

Component features:
- Fetch genres from `getAllGenres()` IPC method on mount
- Display genre tiles in responsive grid layout (3-4 per row on desktop, 2 on tablet, 1 on mobile)
- Each tile contains:
  - Genre name (large text)
  - Representative game image or icon background
  - Hover effects (scale, brightness)
- Click handler navigates to filtered store view or dedicated genre page
- Loading state while fetching genres
- Empty state if no genres available

**Styling**:
- Large clickable cards (Adventure, Co-op, Action, RPG, etc.)
- Use CSS Grid or Tailwind grid utilities
- Card height: ~150-200px
- Background image with gradient overlay for text readability
- Match existing component aesthetic

### 6. Frontend: Update Store Page

**File**: [frontendv3/src/components/pages/shopveiw.jsx](frontendv3/src/components/pages/shopveiw.jsx)

Major changes:
1. **Add navbar at top**:
   ```jsx
   <StoreNavbar 
     onSearchChange={handleSearchChange}
     onGenreFilterChange={handleGenreFilterChange}
     onJumpToSection={handleJumpToSection}
   />
   ```

2. **Replace single slider with three sections**:
   - **Featured Games section**:
     - Section title: "Featured Games" or "New Releases"
     - `<Storeslider>` component with data from `getFeaturedGames()`
     - Use `useRef` for scroll targeting
   
   - **Recommended Games section**:
     - Section title: "Recommended" or "Popular Games"
     - `<Storeslider>` component with data from `getRecommendedGames()`
     - Use `useRef` for scroll targeting
   
   - **Browse by Category section**:
     - Section title: "Browse by Category"
     - `<BrowseByCategory>` component
     - Use `useRef` for scroll targeting

3. **State management**:
   ```jsx
   const [searchQuery, setSearchQuery] = useState('')
   const [activeGenres, setActiveGenres] = useState([])
   const [featuredGames, setFeaturedGames] = useState([])
   const [recommendedGames, setRecommendedGames] = useState([])
   const [filteredGames, setFilteredGames] = useState([])
   ```

4. **Data fetching**:
   - `useEffect` to fetch featured and recommended games on mount
   - Separate `useEffect` to apply search/filter to games in real-time
   - Debounce search input

5. **Scroll behavior**:
   - Create refs for each section
   - `handleJumpToSection` uses `scrollIntoView({ behavior: 'smooth' })`

### 7. Frontend: Add Loading & Error States

**File**: [frontendv3/src/components/pages/shopveiw.jsx](frontendv3/src/components/pages/shopveiw.jsx)

Add proper state handling:
- **Loading states**:
  - Show skeleton loaders for sliders while fetching
  - Use placeholder cards matching Storeslider layout
  - Spinner or shimmer effect
  
- **Empty states**:
  - "No games found for '{searchQuery}'" message
  - "No games in this category yet" for empty genre filters
  - Helpful suggestions (clear filters, try different search)
  
- **Error states**:
  - Display error message if API calls fail
  - "Something went wrong" with retry button
  - Toast notification for transient errors
  
**Implementation**:
```jsx
const [loading, setLoading] = useState(true)
const [error, setError] = useState(null)

// In fetch logic:
try {
  setLoading(true)
  const featured = await window.electronAPI.getFeaturedGames()
  setFeaturedGames(featured)
} catch (err) {
  setError(err.message)
} finally {
  setLoading(false)
}
```

Use existing Tailwind patterns from other components for consistent styling.

## Verification Checklist

- [ ] Launch app and navigate to Store page
- [ ] Type in search bar → games filter in real-time (debounced)
- [ ] Click "Categorize" → see genre filter options
- [ ] Select multiple genres → see filtered results
- [ ] Click "Jump to Filter" buttons → page scrolls to selected section smoothly
- [ ] Verify Featured slider shows newest games (sorted by `created_at`)
- [ ] Verify Recommended slider shows popular games (sorted by `view_count`)
- [ ] Click genre tile in Browse by Category → see filtered game list
- [ ] Test with empty database → see appropriate empty states
- [ ] Test with no search results → see "No games found" message
- [ ] Test API failure → see error state with retry option
- [ ] Test responsiveness across different screen sizes
- [ ] Verify consistent styling with existing dark theme

## Technical Notes

**Performance Considerations**:
- Debounce search input (300ms) to avoid excessive API calls
- Consider implementing pagination for "Browse All Games" if dataset is large
- Cache genre list (rarely changes)
- Preload images for visible slider cards
- Use `useMemo` for filtered game calculations

**Data Flow**:
```
shopveiw.jsx
  ↓ (fetch on mount)
electronAPI.getFeaturedGames() → IPC → GamesController → API → DB
  ↓ (return data)
setFeaturedGames(data)
  ↓ (pass as prop)
<Storeslider games={featuredGames} />
```

**Reusability**:
- Storeslider is already built and tested - just pass different data
- GameSliderBase supports both stack and translate modes
- BrowseByCategory can be reused on other pages (genre landing pages)
- StoreNavbar filters can be applied to other game lists

**Future Enhancements** (out of scope for this plan):
- User-specific recommendations based on play history
- "Recently Viewed" slider
- Price range filter in navbar
- Platform filter (Steam, Epic, etc.)
- Sort options (price, rating, release date)
- Save filter preferences to localStorage
- Advanced search with tags/descriptions
- Infinite scroll for long lists
