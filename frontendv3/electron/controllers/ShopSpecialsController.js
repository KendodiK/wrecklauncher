const { normalizeBaseUrl, enc, joinUrl } = require('../lib/url');
const { fetchJsonSafe } = require('../lib/http');
class ShopSpecialsController {
        /** @type {string} */
    #serverUrl;

    /**
     * @param {{ serverUrl: string }} cfg
     */
    constructor(cfg) {
        this.#serverUrl = normalizeBaseUrl(cfg.serverUrl || '', { defaultProtocol: 'https:' });
    }
    async getShopSpecials(filter,from){
        const { ok, status, json, text } = await fetchJsonSafe(`${this.#serverUrl}/api/shop_specials/${filter}/list/${from}`,{ method: 'GET' });
        if (!ok) {
            throw new Error(`Failed to fetch shop specials: ${status} ${text ? `- ${String(text).slice(0, 200)}` : ''}`);
        }
        return json;
    }

}
module.exports = ShopSpecialsController;