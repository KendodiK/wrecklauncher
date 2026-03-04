// @ts-check

/**
 * @typedef {object} UploadGameRequest
 * @property {string} app_id
 * @property {string} name
 * @property {string} banner_img
 * @property {string|null|undefined} [platform_name] - Backend accepts either `platform_name` or `platform_id`.
 * @property {number|string|null|undefined} [platform_id] - Numeric platform id from DB (string allowed for convenience).
 * @property {string|null|undefined} [description]
 * @property {string|null|undefined} [minimum_requirements]
 * @property {number|null|undefined} [cost]
 * @property {string[]|null|undefined} [genre_names]
 */

/**
 * @typedef {object} UploadGameResponse
 * @property {string} [message]
 * @property {number} [gameId]
 * @property {string} [error]
 */

/**
 * @typedef {object} UploadGameResult
 * @property {boolean} ok
 * @property {number} statusCode
 * @property {UploadGameResponse|any|null} response
 * @property {any|null} rawJson
 * @property {string|null} rawText
 */

/**
 * Row returned by `/api/games/:id/all` or `/api/games/app/:appId/all` for `genres`.
 * Note: current backend query returns `{ id: games.id, genre: genres.genre }`.
 * @typedef {object} GameGenreRow
 * @property {number} id
 * @property {string} genre
 */

/**
 * Game details returned by `/api/games/:id/all` or `/api/games/app/:appId/all`.
 * The backend currently aliases platform name as `platform`.
 * @typedef {object} GameDetailsResponse
 * @property {number} id
 * @property {number|string} app_id
 * @property {string} name
 * @property {string} banner_img
 * @property {string|null} description
 * @property {string|null} minimum_requirements
 * @property {number|null} cost
 * @property {number} platform_id
 * @property {string|null|undefined} [platform]
 * @property {string|null|undefined} [platform_name]
 * @property {GameGenreRow[]|null|undefined} [genres]
 */

/**
 * Normalized game details shape used by the renderer (derived from `GameDetailsResponse`).
 * @typedef {object} GameDetails
 * @property {string|null} app_id
 * @property {string|null} platform_name
 * @property {string|null} name
 * @property {string|null} banner_img
 * @property {string|null} description
 * @property {string|null} minimum_requirements
 * @property {number|null} cost
 * @property {string[]|null} genre_names
 */

/**
 * @typedef {object} SteamGenre
 * @property {string|number} [id]
 * @property {string} [description]
 */

/**
 * @typedef {object} SteamGameDetails
 * @property {number} appid
 * @property {string|null} name
 * @property {string|null} bannerimg
 * @property {SteamGenre[]|null} genres
 * @property {number|null} price_overview - Steam `price_overview.final` (in cents) or null.
 * @property {string|null|undefined} [minimum_requirements]
 * @property {string|null} cc
 * @property {string} lang
 * @property {any} raw
 */

/**
 * @typedef {object} EpicInstalledGame
 * @property {string} manifestPath
 * @property {string|null} appName
 * @property {string|null} displayName
 * @property {string|null} installLocation
 * @property {string|null} namespace
 * @property {string|null} catalogItemId
 * @property {string|null} artifactId
 * @property {string|null} itemId
 * @property {string|null} appVersionString
 * @property {number|null} installSize
 * @property {any} raw
 */

module.exports = {};
