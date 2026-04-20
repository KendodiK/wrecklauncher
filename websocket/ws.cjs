const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const nativeUserController = require('../database/controllers/NativeUsersController.js');
const middleware = require('./middleware/auth.js');

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
const clients = new Map();

s.on('upgrade', async (req, socket, head) => {
    socket.on('error', onSocketPreError);

    // perform auth
    const auth = await middleware.tokenValidate(req);

    try {
        if (auth.status !== 200) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
    } catch {}

    req.user = auth.user;

    wss.handleUpgrade(req, socket, head, (ws) => {
        socket.removeListener('error', onSocketPreError);
        wss.emit('connection', ws, req);
    });
});

wss.on('connection', (ws, req) => {
    ws.on('error', onSocketPostError);

    const userId = req.user.id;
    
    clients.set(userId, ws);
    console.log(`User ${userId} connected`);

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);
            const { to, text } = data;
    
            const target = clients.get(to);
            if (target && target.readyState === ws.OPEN) {
                target.send(JSON.stringify({ from: userId, text }));
            } else {
                ws.send(JSON.stringify({ error: 'User offline' }));
            }
        } catch (err) {
            console.error('Error processing message:', err);
        }
    });

    ws.on('close', () => {
        console.log('User disconnected:', userId);
        clients.delete(userId);
    });
});