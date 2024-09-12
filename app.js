const WebSocket = require('ws');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);

app.use(express.static('public')); // Serve static files from the public directory

const wss = new WebSocket.Server({ server });

let users = {}; // Maintain a list of connected users by their unique ID

// WebSocket server logic
wss.on('connection', (ws) => {
    console.log('A user connected');

    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'register':
                users[data.userId] = ws; // Register the user by mapping userId to WebSocket
                console.log(`User ${data.userId} registered`);
                break;

            case 'call-initiate':
                const targetSocket = users[data.targetUserId];
                if (targetSocket) {
                    targetSocket.send(JSON.stringify({ type: 'call-initiate', fromUserId: data.fromUserId }));
                } else {
                    ws.send(JSON.stringify({ type: 'user-not-found' }));
                }
                break;

            case 'call-accept':

            case 'offer':
            case 'answer':
            case 'candidate':
                const recipientSocket = users[data.targetUserId];
                if (recipientSocket) {
                    recipientSocket.send(JSON.stringify(data));
                }
                break;

            case 'call-reject':
            case 'call-end':
                const endSocket = users[data.targetUserId];
                if (endSocket) {
                    endSocket.send(JSON.stringify({ type: 'call-end' }));
                }
                break;
            case 'call-disconnect':
                const callerSocket = users[data.fromUserId];
                if (callerSocket) {
                    callerSocket.send(JSON.stringify(data));
                }
                break;

            default:
                console.log('Unknown message type:', data.type);
                break;
        }
    });

    ws.on('close', () => {
        for (const userId in users) {
            if (users[userId] === ws) {
                console.log(`User ${userId} disconnected`);
                delete users[userId];
                break;
            }
        }
    });
});

server.listen(3000, () => {
    console.log('Server is listening on port 3000');
});
