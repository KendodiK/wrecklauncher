const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const nativeUserController = require('../database/controllers/NativeUsersController.js');
const apiHelpers = require('../scripts/apiHelpers.js');

const app = express();
const port = process.env.WS_PORT || 8080;

function onSocketPreError(err) {
    console.log("Error while starting WebSocket connection:", err);
}

function onSocketPostError(err) {
    console.log("Error in WebSocket connection:", err);
}

const s = app.listen(port);

s.on('error', (err) => {
  console.error('Server error:', err);
});

s.on('listening', async () => {
  try {
    const addr = s.address();
    if (typeof addr === 'string') {
      console.log('Server listening on', addr);
    } else {
      console.log('Server listening on', `${addr.address}:${addr.port}`);
    }
  } catch (err) {
    console.error('Error retrieving server address:', err);
  }
});

const wss = new WebSocketServer({ noServer: true });

s.on('upgrade', (req, socket, head) => {
    console.log('WebSocket upgrade request received:', req.Authorization);
    socket.on('error', onSocketPreError);

    // perform auth
    const auth = apiHelpers.tokenValidate(req);
    try {
        if (auth.status) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
    } catch {}

    wss.handleUpgrade(req, socket, head, (ws) => {
        socket.removeListener('error', onSocketPreError);
        wss.emit('connection', ws, req);
    });
});

wss.on('connection', (ws, req) => {
    ws.on('error', onSocketPostError);

    ws.on('message', (msg, isBinary) => {
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg, { binary: isBinary });
            }
        });
    });

    ws.on('close', () => {
        console.log('Connection closed');
    });
});