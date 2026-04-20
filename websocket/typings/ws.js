const { WebSocket } = require('ws');

if (WebSocket && !Object.prototype.hasOwnProperty.call(WebSocket.prototype, 'isAlive')) {
    Object.defineProperty(WebSocket.prototype, 'isAlive', {
        value: false,
        writable: true,
        configurable: true,
        enumerable: false,
    });
}

module.exports = WebSocket;