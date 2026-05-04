// server.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: process.env.PORT || 3000 });

// Session storage: key -> { creator, joiner }
const sessions = {};

wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw); } catch(e) { return; }

        switch(msg.type) {
            case 'create':
                if (sessions[msg.key]) {
                    ws.send(JSON.stringify({type:'error', message:'Key in use'}));
                    return;
                }
                sessions[msg.key] = { creator: ws, joiner: null };
                ws.sessionKey = msg.key;  // remember for cleanup
                broadcastSessionList();
                break;

            case 'join':
                const session = sessions[msg.key];
                if (!session || session.joiner) {
                    ws.send(JSON.stringify({type:'error', message:'Session unavailable'}));
                    return;
                }
                session.joiner = ws;
                ws.sessionKey = msg.key;
                // Tell both players to start
                session.creator.send(JSON.stringify({type:'start', mark:'X'}));
                session.joiner.send(JSON.stringify({type:'start', mark:'O'}));
                broadcastSessionList();
                break;

            case 'move':
                // Relay move to opponent
                const key = ws.sessionKey;
                if (!key || !sessions[key]) return;
                const opponent = (sessions[key].creator === ws) ? sessions[key].joiner : sessions[key].creator;
                if (opponent) {
                    opponent.send(JSON.stringify({type:'move', pos: msg.pos}));
                }
                break;

            case 'list':
                ws.send(JSON.stringify({type:'session_list', sessions: Object.keys(sessions).filter(k => !sessions[k].joiner)}));
                break;
        }
    });

    ws.on('close', () => {
        // Cleanup session
        if (ws.sessionKey && sessions[ws.sessionKey]) {
            const s = sessions[ws.sessionKey];
            const opponent = (s.creator === ws) ? s.joiner : s.creator;
            if (opponent) {
                opponent.send(JSON.stringify({type:'opponent_left'}));
                opponent.sessionKey = null;
            }
            delete sessions[ws.sessionKey];
            broadcastSessionList();
        }
    });
});

function broadcastSessionList() {
    const list = Object.keys(sessions).filter(k => !sessions[k].joiner);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({type:'session_list', sessions: list}));
        }
    });
}