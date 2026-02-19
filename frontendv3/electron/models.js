// @ts-check

/**
 * @typedef {object} UploadGameRequest
 * @property {string} app_id
 * @property {string} platform_name
 * @property {string} name
 * @property {string} banner_img
 * @property {string|null|undefined} [description]
 * @property {string|null|undefined} [minimum_requirements]
 * @property {number|null|undefined} [cost]
 * @property {string[]|null|undefined} [genre_names]
 */

/**
 * @typedef {object} UploadGameResult
 * @property {boolean} ok
 * @property {number} statusCode
 * @property {any|null} response
 * @property {any|null} rawJson
 * @property {string|null} rawText
 */

/**
 * @typedef {object} SteamGameDetails
 * @property {number} appid
 * @property {string|null} name
 * @property {string|null} bannerimg
 * @property {any[]|any|null} genres
 * @property {number|null} price_overview
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
