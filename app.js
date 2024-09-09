const WebSocket = require('ws');
const express = require('express');
const http = require('http');

const app = express();
const server = http.createServer(app);

app.use(express.static('public'));

const wss = new WebSocket.Server({ server });

// Maintain a list of connected users by their unique ID
let users = {};

// WebSocket server logic
wss.on('connection', (ws) => {
    // When a new user connects, they will send their user ID
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        switch (data.type) {
            case 'register':
                // When a client registers, map their user ID to their WebSocket
                users[data.userId] = ws;
                console.log(`User ${data.userId} connected`);
                break;
            case 'call-initiate':
                // When a caller initiates a call to a specific user ID
                const targetUserSocket = users[data.targetUserId];
                if (targetUserSocket) {
                    // Send a message to the receiver that they are being called
                    targetUserSocket.send(JSON.stringify({
                        type: 'call-initiate',
                        fromUserId: data.fromUserId
                    }));
                } else {
                    ws.send(JSON.stringify({ type: 'user-not-found' }));
                }
                break;
            case 'call-accept':
            case 'offer':
            case 'answer':
            case 'candidate':
                // Forward signaling messages to the correct user
                const recipientSocket = users[data.targetUserId];
                if (recipientSocket) {
                    recipientSocket.send(JSON.stringify(data));
                }
                break;
            case 'call-reject':
                const callerSocket = users[data.fromUserId];
                if (callerSocket) {
                    callerSocket.send(JSON.stringify({ type: 'call-reject' }));
                }
                break;
            case 'call-end':
                // Notify the opponent that the call has ended
                const opponentSocket = users[data.targetUserId];
                if (opponentSocket) {
                    opponentSocket.send(JSON.stringify({ type: 'call-end' }));
                }
                break;
        }
    });

    ws.on('close', () => {
        // When a user disconnects, clean up their entry from the users list
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
    console.log('Server running on port 3000');
});
