/**
 * Utility functions for game data transformation and filtering
 */

/**
 * Transform backend game object to card format
 * @param {Object} game - Backend game object
 * @returns {Object} Formatted game object {id, appid, title, image, price, genres}
 */
export function gameToCardFormat(game) {
	return {
		id: game.id || game.appid,
		appid: game.appid || game.id,
		title: game.title || game.name || 'Untitled Game',
		image: game.image || game.poster || getSteamImageUrl(game.appid),
		price: game.price !== undefined ? game.price : 0,
		genres: game.genres || [],
	};
}

/**
 * Filter games by search query (case-insensitive title match)
 * @param {Array} games - Array of game objects
 * @param {String} query - Search query string
 * @returns {Array} Filtered games
 */
export function filterGamesBySearch(games, query) {
	if (!query || query.trim() === '') return games;
	
	const lowerQuery = query.toLowerCase().trim();
	return games.filter(game => {
		const title = (game.title || game.name || '').toLowerCase();
		return title.includes(lowerQuery);
	});
}

/**
 * Filter games by selected genres (match any selected genre)
 * @param {Array} games - Array of game objects
 * @param {Array} genreIds - Array of genre IDs to filter by
 * @returns {Array} Filtered games
 */
export function filterGamesByGenres(games, genreIds) {
	if (!genreIds || genreIds.length === 0) return games;
	
	return games.filter(game => {
		if (!game.genres || game.genres.length === 0) return false;
		
		// Match if game has any of the selected genres
		return game.genres.some(genre => {
			const genreId = typeof genre === 'object' ? genre.id : genre;
			return genreIds.includes(genreId);
		});
	});
}

/**
 * Filter games by price range
 * @param {Array} games - Array of game objects
 * @param {Number} min - Minimum price
 * @param {Number} max - Maximum price
 * @returns {Array} Filtered games
 */
export function filterGamesByPrice(games, min, max) {
	if (min === undefined && max === undefined) return games;
	
	return games.filter(game => {
		const price = game.price !== undefined ? game.price : 0;
		
		if (min !== undefined && price < min) return false;
		if (max !== undefined && price > max) return false;
		
		return true;
	});
}

/**
 * Apply all filters to games array
 * @param {Array} games - Array of game objects
 * @param {Object} filters - Filter options {query, genres, priceRange}
 * @returns {Array} Filtered games
 */
export function combineFilters(games, filters = {}) {
	let filtered = [...games];
	
	// Apply search query
	if (filters.query) {
		filtered = filterGamesBySearch(filtered, filters.query);
	}
	
	// Apply genre filter
	if (filters.genres && filters.genres.length > 0) {
		filtered = filterGamesByGenres(filtered, filters.genres);
	}
	
	// Apply price range filter
	if (filters.priceRange) {
		const { min, max } = filters.priceRange;
		filtered = filterGamesByPrice(filtered, min, max);
	}
	
	return filtered;
}

/**
 * Construct Steam CDN image URL
 * @param {Number|String} appid - Steam app ID
 * @param {String} type - Image type (default: 'library_600x900')
 * @returns {String|null} Image URL or null if invalid appid
 */
export function getSteamImageUrl(appid, type = 'library_600x900') {
	const id = Number(appid);
	if (!Number.isFinite(id) || id <= 0) return null;
	
	return `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/${type}.jpg`;
}

/**
 * Check if any filters are active
 * @param {Object} filters - Filter options {query, genres, priceRange}
 * @returns {Boolean} True if any filter is active
 */
export function hasActiveFilters(filters = {}) {
	if (filters.query && filters.query.trim() !== '') return true;
	if (filters.genres && filters.genres.length > 0) return true;
	if (filters.priceRange) {
		const { min, max } = filters.priceRange;
		if (min > 0 || max < 100) return true;
	}
	return false;
}

/**
 * Get random subset of games
 * @param {Array} games - Array of game objects
 * @param {Number} count - Number of games to return
 * @returns {Array} Random subset of games
 */
export function getRandomGames(games, count) {
	if (!games || games.length === 0) return [];
	if (games.length <= count) return [...games];
	
	const shuffled = [...games].sort(() => Math.random() - 0.5);
	return shuffled.slice(0, count);
}

/**
 * Get games by tag/category
 * @param {Array} games - Array of game objects
 * @param {String} tag - Tag to filter by (e.g., 'featured', 'discount', 'upcoming')
 * @returns {Array} Filtered games
 */
export function getGamesByTag(games, tag) {
	if (!games || !tag) return [];
	
	return games.filter(game => {
		if (!game.tags) return false;
		
		const tags = Array.isArray(game.tags) ? game.tags : [game.tags];
		return tags.some(t => 
			typeof t === 'string' ? t.toLowerCase() === tag.toLowerCase() : t.name?.toLowerCase() === tag.toLowerCase()
		);
	});
}
