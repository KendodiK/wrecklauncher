class ShopSpecialsController {
        /** @type {string} */
    #serverUrl;

    /**
     * @param {{ serverUrl: string }} cfg
     */
    constructor(cfg) {
        this.#serverUrl = normalizeBaseUrl(cfg.serverUrl || '', { defaultProtocol: 'http:' });
    }
    async getUpcoming(from){
        const response = await fetch(`${}`)
    }