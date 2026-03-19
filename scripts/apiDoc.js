/**
 * @typedef {Object} Game
 * @property {number} id - gameId
 * @property {number} app_id - local ID in platform
 * @property {number} platform_id - platform ID
 * @property {string} banner_img - banner image URL
 * @property {string} description - short description
 * @property {string} minimum_requirements - minimum requirements
 */

/**
 * GET /game/:id
 * 
 * @route GET /game/:id
 * @param {Object} req
 * @param {Object} req.params
 * @param {number} req.params.id
 * @param {Object} res
 * 
 * @returns {Game}
 */