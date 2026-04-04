# Plan: Integrate Library 2.0 UI into FrontendV3

Integrate the library2.0 advanced library UI into frontendv3 while preserving frontendv3's styling system, colors, animations, and navbar structure. The library2.0 GameStrip carousel will be reimplemented using frontendv3's existing GameSliderBase engine.

## Steps

1. **Prepare data structures** — Create TypeScript-compatible types/interfaces in JavaScript format for LibraryGame and Launcher in `src/types/library.js` (new file) matching library2.0 structure
   
2. **Convert Library2.0 components to JSX** (*parallel with step 1*)
   - Convert `LauncherTabs.tsx` → `src/components/library/LauncherTabs.jsx`
   - Convert `AllGamesDrawer.tsx` → `src/components/library/AllGamesDrawer.jsx`
   - Convert `LibraryPage.tsx` → replace existing `src/components/pages/libraray.jsx`
   - Skip `GameStrip.tsx` (will be replaced with GameSliderBase integration)
   - Skip `ActiveGameSidePanel.tsx` (not used in current implementation, can add later)

3. **Adapt GameSliderBase for Library GameStrip** (*depends on 1, 2*)
   - Create `src/components/library/LibraryGameStrip.jsx` as wrapper around GameSliderBase
   - Configure in **translate mode** (horizontal scroll, not stack mode)
   - Map LibraryGame data to GameSliderBase's expected format
   - Implement active game selection on card click
   - Add active card visual treatment (larger height, -translateY, border highlight)
   - Style with CSS classes prefixed `.lib-strip-*`

4. **Extract all inline styles to index.css** (*parallel with step 3*)
   - Create new section in `src/index.css` for library page components: `.library-page`, `.library-control-board`, `.library-bottom-dock`, `.lib-strip-*`, `.library-status-bar`, `.launcher-tabs`, `.all-games-drawer`
   - Migrate color values from library2.0's cyan/blue theme to frontendv3's slate/emerald palette:
     - `cyan-400/20` → `emerald-400/20` or `slate-600/30`
     - `cyan-300` → `emerald-400` or `slate-400`
     - `blue-500` → `emerald-500` or `slate-700`
     - `#090e18`, `#0b1220`, `#080b14` → match frontendv3's `rgba(15,23,42,...)` slate-based blacks
   - Keep all backdrop-blur, shadow, and transition values
   - Remove library-theme.css background gradients (Steam red/blue radial) — use frontendv3's `bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900`

5. **Extract animations to animations.css** (*parallel with step 4*)
   - Add keyframe for GameStrip active card translateY animation (smooth bounce-in effect)
   - Add keyframe for progress bar shine animation (existing in library-theme.css)
   - Add drawer slide-in animation (currently handled by Framer Motion, consider CSS version for consistency)
   - Use existing naming pattern: `@keyframes lib-strip-active`, `.animate-lib-strip-in`, etc.

6. **Update LibraryPage layout structure** (*depends on 2, 3, 4, 5*)
   - Remove library2.0's hamburger menu from top-right — frontendv3 MainNavbar handles app-level controls
   - Layout hierarchy: MainNavbar (existing) → LibraryControlBoard (search + launcher tabs) → Main content area → LibraryBottomDock (game strip + status bar)
   - LibraryControlBoard positioned below MainNavbar with `pt-12` or margin to account for fixed navbar height
   - Background handling: Keep hero image blur + gradient overlay pattern from library2.0
   - Ensure MainNavbar remains fixed at top (z-index: 9999), library components use lower z-indexes

7. **Implement search functionality** (*depends on 6*)
   - Keep search scope dropdown (launcher vs all) but restyle to match frontendv3 patterns
   - Search bar styling: slate borders, emerald focus ring (not cyan)
   - Filter logic already implemented in library2.0, only styling needs adaptation

8. **Create bottom dock with game info and controls** (*depends on 3, 6*)
   - Fixed position bottom dock with LibraryGameStrip + status bar
   - Status bar shows: active game title, launcher icon/name, tags (on hover), playtime, progress bar, install size, PLAY button
   - Hover interaction: reveal "Open Game" / "See In Store" buttons (existing in library2.0)
   - PLAY button: emerald-500 bg (not blue-500), maintains frontendv3 accent color
   - Progress bar: emerald-400 fill with shine animation

9. **Wire up game data and state management** (*depends on 2, 3, 6, 8*)
   - Create mock data similar to library2.0's mockLibraryData but adapted for frontendv3 sources (Steam, GOG, Itch, FitGirl, PcGamesTorrent, etc.)
   - Connect to existing backend controllers (GamesController, PlatformsController, UserController)
   - State: activeLauncherId, activeGameId, searchScope, searchQuery, showAllGames
   - Game selection flows through LibraryGameStrip → updates activeGameId → updates status bar display

10. **Test responsive behavior and interactions** (*depends on all previous steps*)
    - Keyboard navigation in LibraryGameStrip (use GameSliderBase's built-in support)
    - Mouse wheel, drag interaction
    - Mobile/tablet: search bar repositioning, launcher tabs wrapping, game strip scrolling
    - AllGamesDrawer open/close animations
    - Reduced motion support (already in GameSliderBase)

## Relevant Files

- `src/components/shared/GameSliderBase.jsx` — Core carousel engine to reuse, uses translate mode for horizontal scroll, handles keyboard/mouse/wheel/drag
- `src/components/library/GameSlider.jsx` — Example wrapper showing how to configure GameSliderBase
- `src/index.css` — Component styles organized by function, add new `.library-*` and `.lib-strip-*` sections
- `src/animations.css` — Keyframe animations, add library-specific animations
- `src/components/pages/libraray.jsx` — Current simple library page, will be completely replaced
- `src/components/navbar/mainnavbar.jsx` — Fixed navbar at top, stays unchanged
- `tailwind.config.js` — No custom theme, uses Tailwind defaults

## Verification Checklist

1. Navigate to Library page — verify MainNavbar visible at top, library controls below it
2. Test launcher tabs — clicking switches games shown in strip
3. Test search functionality — type query filters games, scope toggle works
4. Test game strip carousel — keyboard arrows move selection, mouse wheel/drag work, active game highlights with larger size and -translateY
5. Verify active game updates status bar — title, playtime, progress, PLAY button all show correct data
6. Test AllGamesDrawer — opens with full list, clicking game updates active selection and closes drawer
7. Inspect element styling — no inline styles in JSX, all styles come from index.css or Tailwind classes
8. Check animations.css — game strip active animation runs smoothly
9. Verify color scheme — no cyan/blue from library2.0, only slate/emerald/neutral from frontendv3
10. Test with prefers-reduced-motion — animations disabled appropriately

## Key Decisions

- **Color scheme**: Replace library2.0's Steam-inspired cyan/blue with frontendv3's slate/emerald palette. Emerald for active states and accents, slate for backgrounds and borders
- **Carousel implementation**: Use GameSliderBase instead of library2.0's GameStrip. This leverages existing robust logic (keyboard/mouse/wheel/drag/loop) rather than reimplementing
- **Layout**: MainNavbar stays fixed at top (existing), library controls are a new band below it, game strip docked at bottom. This preserves frontendv3's navigation structure
- **No inline styles**: All styling moved to index.css following frontendv3's established pattern. Only use Tailwind utility classes for spacing/display, not colors or effects
- **Animations**: Extract to animations.css for consistency. Library2.0 uses Framer Motion for drawer/panel, keep for complex animations but add CSS alternatives where simple
- **Data source**: Start with mock data matching library2.0 structure, then connect to frontendv3 backend controllers in later iteration
- **Excluded**: ActiveGameSidePanel component (not used in library2.0's current implementation, can be added later as enhancement)
- **Responsive**: Library2.0 has mobile optimizations in library-theme.css — migrate these to index.css media queries
 the backround blured img is one img from that game, so it changes when you change the active game in the strip. The background image is blurred and has a gradient overlay to ensure text readability, creating a dynamic and immersive library experience that reflects the currently selected game.
## Further Considerations

### 1. Mock Data vs Real Backend Integration
Start with mock data structure matching LibraryGame interface for initial implementation, then connect to existing backend (GamesController, SteamGamesController, GogController, ItchioController, etc.). Need to map backend game schema to LibraryGame schema.

**Recommended**: Create data adapter/mapper function.

### 2. GameSliderBase Configuration for Library Strip
Library2.0's GameStrip has specific active card treatment (h-24 inactive → h-64 active with -translateY-8). GameSliderBase uses CSS classes for active state.

**Recommended**: Use `.lib-strip-card-active` class with height + transform in index.css, leverage GameSliderBase's transition handling.

### 3. Alternative Implementations for Carousel
Could keep library2.0's GameStrip component instead of using GameSliderBase. Tradeoff: simpler migration but duplicates carousel logic and misses GameSliderBase's accessibility features (keyboard nav, reduced motion support).

**Recommended**: Use GameSliderBase for consistency and features.

---

## 💡 Additional Feature Ideas

Innovative features to enhance the library experience beyond the base integration:

### High Priority (Leverage Existing Architecture)

#### 1. Multi-Platform Game Comparison
- Show same game across different launchers (Steam version vs GOG/Itch vs Cracked)
- Compare install sizes, prices, DLC availability
- Quick-switch between versions with visual indicator
- *Uses*: existing PlatformsController, GamesController


#### 4. Enhanced Game Details on Hover
- Expand GameSliderBase cards on hover (not just active)
- Show quick stats: playtime, last played, achievements
- Mini changelog for recent updates
- *Uses*: GameSliderBase's hover states, existing card structure

### Medium Priority (New Components)

#### 5. Activity Timeline
- Vertical timeline showing recent library activity
- "Added 3 games", "Played Elden Ring for 2h", "Updated 5 games"
- Slides in from right (similar to AllGamesDrawer)
- *Pattern*: Similar to AllGamesDrawer component

#### 6. Game Statistics Dashboard
- Visual charts: playtime by genre, launcher distribution, install size breakdown
- Most/least played games
- Collapsible panel above game strip
- *Integration*: New component using existing game data

#### 7. Quick Actions Radial Menu
- Right-click or long-press on game card
- Radial menu with: Play, View Store Page, File Location, Properties, Uninstall
- Animated appearance with rotation
- *Pattern*: Similar to AppIconMenu dropdown but radial

#### 8. Friend Activity Feed
- Show what friends are playing from your library
- "John is playing Cyberpunk 2077" with join button
- Small panel at top-right under MainNavbar
- *Uses*: existing friends page structure, UserController

### Advanced Features

