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
 * @property {Array<{site_name?: string|null, link?: string|null}>|null|undefined} [pirate_sites]
 */

/**
 * Normalized game details shape used by the renderer (derived from `GameDetailsResponse`).
 * @typedef {object} GameDetails
 * @property {number|null|undefined} [id]
 * @property {string|null} app_id
 * @property {string|null} platform_name
 * @property {string|null} name
 * @property {string|null} banner_img
 * @property {string|null} description
 * @property {string|null} minimum_requirements
 * @property {number|null} cost
 * @property {number|null|undefined} [price]
 * @property {string|null|undefined} [currency]
 * @property {string|null|undefined} [formated_price]
 * @property {string|null|undefined} [country_code]
 * @property {string[]|null} genre_names
 * @property {Array<{site_name?: string|null, link?: string|null}>|null|undefined} [pirate_sites]
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
 * Live snapshot of a single torrent download.
 * Sent from the Electron main process to the renderer via `torrent:progress` IPC events.
 * All numeric byte fields are in bytes; speeds are bytes per second.
 * @typedef {object} TorrentProgress
 * @property {string}  infoHash       - Unique SHA-1 hash identifying the torrent.
 * @property {string}  name           - Display name (from torrent metadata, or infoHash while pending).
 * @property {number}  progress       - Download completion ratio from 0 (none) to 1 (complete).
 * @property {number}  downloadSpeed  - Current download speed in bytes/s.
 * @property {number}  uploadSpeed    - Current upload speed in bytes/s.
 * @property {number}  downloaded     - Total bytes downloaded so far.
 * @property {number}  uploaded       - Total bytes uploaded so far.
 * @property {number}  length         - Total size of all files in the torrent (0 until metadata arrives).
 * @property {number}  numPeers       - Number of currently connected peers.
 * @property {number}  timeRemaining  - Estimated milliseconds remaining (Infinity when unknown).
 * @property {boolean} paused         - Whether the torrent is currently paused.
 * @property {boolean} done           - Whether the torrent has finished downloading.
 * @property {string}  magnetURI      - Magnet URI used to add the torrent (when available).
 * @property {string}  savePath       - Absolute path to the download directory.
 * @property {string}  path           - Absolute path to the directory where files are saved.
 */

/**
 * Row returned by `GET /api/games/list/:from`.
 * Shape comes from `GamesController.getWithAllForeign()` on the backend:
 * a JOIN of `games` and `platforms` that aliases `platform_name` as `platform`.
 * @typedef {object} GameListItem
 * @property {number} id            - Primary key of the game row.
 * @property {number|string} app_id - Platform-specific application id (e.g. Steam appid).
 * @property {string} name          - Display name of the game.
 * @property {string} banner_img    - URL / path to the banner image.
 * @property {string|null} description          - Long description text, or null.
 * @property {string|null} minimum_requirements - Minimum system requirements text, or null.
 * @property {number} cost          - Price in the store's currency unit (e.g. USD cents or full dollars depending on source).
 * @property {number} platform_id   - Foreign key referencing `platforms.id`.
 * @property {string|null} platform - Resolved platform name (aliased from `platforms.platform_name`).
 */

/**
 * @typedef {object} ItchInstalledGame
 * @property {string} gameId       - itch.io numeric game ID (as string), or folder name if receipt is missing.
 * @property {string} title         - Game display name.
 * @property {string|null} coverUrl  - URL to the game cover image.
 * @property {string|null} url       - itch.io game page URL.
 * @property {string} installLocation - Absolute path to the install directory.
 * @property {string|null} uploadId  - itch.io upload ID (from receipt).
 * @property {string|null} buildId   - itch.io build ID (from receipt).
 * @property {any} raw               - Raw receipt.json content.
 */

/**
 * @typedef {object} ItchGameDetails
 * @property {number} gameId
 * @property {string} title
 * @property {string|null} coverUrl
 * @property {string|null} shortText
 * @property {number} minPrice       - Minimum price in USD (0 = free or pay-what-you-want).
 * @property {string|null} url
 * @property {any} raw
 */

/**
 * @typedef {object} GogInstalledGame
 * @property {string} productId      - GOG numeric product ID (as string).
 * @property {string} gameName       - Game display name.
 * @property {string|null} installPath - Absolute install directory.
 * @property {string|null} launchCommand - Executable path or launch command.
 * @property {string|null} version
 * @property {string|null} buildId
 * @property {any} raw               - Raw registry value map.
 */

/**
 * @typedef {object} GogGameDetails
 * @property {string} productId
 * @property {string} title
 * @property {string|null} bannerImg
 * @property {string|null} description
 * @property {number|null} cost      - Price in USD.
 * @property {string[]} genreNames
 * @property {any} raw
 */

module.exports = {};
