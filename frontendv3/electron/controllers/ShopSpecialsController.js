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
    /**
     * @param {string} rawFilter
     * @returns {string[]}
     */
    _expandFilterCandidates(rawFilter) {
        const filter = String(rawFilter || '').trim().toLowerCase();
        if (!filter) return ['featured'];

        if (filter === 'discounted' || filter === 'discount_percent') {
            return ['discount_percent', 'discounted'];
        }

        if (filter === 'coming-soon' || filter === 'coming_soon') {
            return ['coming_soon', 'coming-soon'];
        }

        return [filter];
    }

    async getShopSpecials(filter,from){
        const filterCandidates = this._expandFilterCandidates(filter);
        const parsedFrom = Number(from);
        const safeFrom = Number.isFinite(parsedFrom) && parsedFrom > 0 ? Math.floor(parsedFrom) : 0;

        /** @type {string[]} */
        const endpoints = [];
        for (const candidate of filterCandidates) {
            endpoints.push(`${this.#serverUrl}/api/shop-specials/${candidate}/list/${safeFrom}`);
            endpoints.push(`${this.#serverUrl}/api/shop-specials/${candidate}/${safeFrom}`);
            endpoints.push(`${this.#serverUrl}/api/shop_specials/${candidate}/list/${safeFrom}`);
            endpoints.push(`${this.#serverUrl}/api/shop_specials/${candidate}/${safeFrom}`);
        }

        const uniqueEndpoints = Array.from(new Set(endpoints));

        let lastStatus = 0;
        let lastText = '';
        for (const endpoint of uniqueEndpoints) {
            const { ok, status, json, text } = await fetchJsonSafe(endpoint,{ method: 'GET', headers: { 'Accept': 'application/json' } });
            if (ok) return json;
            lastStatus = status;
            lastText = text;
        }

        throw new Error(`Failed to fetch shop specials: ${lastStatus} ${lastText ? `- ${String(lastText).slice(0, 200)}` : ''}`);
    }

}
module.exports = ShopSpecialsController;