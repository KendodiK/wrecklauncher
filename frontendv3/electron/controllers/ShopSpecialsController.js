//@ts-check
class ShopSpecialsController {
        /** @type {string} */
    #serverUrl;

    /**
     * @param {{ serverUrl: string }} cfg
     */
    constructor(cfg) {
        this.#serverUrl = cfg.serverUrl || '';
    }
    /**
     * @param {string} rawFilter
     * @returns {string}
     */
    _normalizeFilter(rawFilter) {
        const filter = String(rawFilter || '').trim().toLowerCase();
        if (!filter) return 'featured';
        if(filter === 'featured') {
            return "featured";
        }
        if (filter === 'discounted' || filter === 'discount_percent') {
            return "discount_percent";
        }

        if (filter === 'coming-soon' || filter === 'coming_soon') {
            return "coming_soon";
        }

        return filter;
    }

    /**
     * 
     * @param {string} filter 
     * @param {number} from 
     * @returns {Promise<any>}
     */
    async getShopSpecials(filter,from){
        const filterCandidate = this._normalizeFilter(filter);
        const parsedFrom = Number(from);
        const safeFrom = Number.isFinite(parsedFrom) && parsedFrom > 0 ? Math.floor(parsedFrom) : 0;
        const url = `${this.#serverUrl}/api/shop-specials/${encodeURIComponent(filterCandidate)}/list/${safeFrom}`;
        const response = await fetch(url,{ method: 'GET', headers: { 'Accept': 'application/json' } });
        if (response.ok) return response.json();
        const lastStatus = response.status;
        const lastText = await response.text();        
        throw new Error(`Failed to fetch shop specials: ${lastStatus} ${lastText ? `- ${String(lastText).slice(0, 200)}` : ''}`);
    }

}
module.exports = ShopSpecialsController;