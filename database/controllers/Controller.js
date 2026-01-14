import DatabaseHandler from '../utils/DatabaseHandler.js';

export default Controller;

class Controller extends DatabaseHandler {
    constructor() {
        super('dbName');
    }

    async index() {}

    async show(id) {}

    async create(data) {}

    async update(id, data) {}

    async delete(id) {}
} 