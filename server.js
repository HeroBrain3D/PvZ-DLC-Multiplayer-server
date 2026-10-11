const WebSocket = require('ws');
const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 8910;
const salas = {}; // { "codigo": { host: ws, cliente: ws, password: "..." } }

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    
    if (parsedUrl.pathname === '/check') {
        const roomCode = parsedUrl.searchParams.get('room');
        const password = parsedUrl.searchParams.get('pass');
        
        res.setHeader('Access-Control-Allow-Origin', '*');
        
        const room = salas[roomCode];
        if (!room) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('sala_no_encontrada');
            return;
        }
        if (room.password && room.password !== password) {
            res.writeHead(401, { 'Content-Type': 'text/plain' });
            res.end('password_incorrecta');
            return;
        }
        if (room.cliente) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('sala_llena');
            return;
        }
        
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
    }

    res.writeHead(404);
    res.end();
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, request) => {
    const parsedUrl = new URL(request.url, `http://${request.headers.host}`);
    const roomCode = parsedUrl.searchParams.get('room');
    const password = parsedUrl.searchParams.get('pass');
    const role = parsedUrl.searchParams.get('role'); // 'host' o 'cliente'

    if (!roomCode || !role) {
        ws.close();
        return;
    }

    let currentRoom = roomCode;
    let isHost = (role === 'host');

    if (isHost) {
        salas[currentRoom] = { host: ws, cliente: null, password: password || '' };
        console.log(`Host conectado en sala: ${currentRoom}`);
    } else {
        const room = salas[currentRoom];
        if (!room || (room.password && room.password !== password) || room.cliente) {
            ws.close();
            return;
        }
        room.cliente = ws;
        console.log(`Cliente conectado a sala: ${currentRoom}`);
        
        if (room.host && room.host.readyState === WebSocket.OPEN) {
            room.host.send(JSON.stringify({ type: 'cliente_conectado' }));
        }
    }

    ws.on('message', (message) => {
        const room = salas[currentRoom];
        if (!room) return;

        // Reenviar mensajes o chat entre el host y el cliente
        if (isHost) {
            if (room.cliente && room.cliente.readyState === WebSocket.OPEN) {
                room.cliente.send(message);
            }
        } else {
            if (room.host && room.host.readyState === WebSocket.OPEN) {
                room.host.send(message);
            }
        }
    });

    ws.on('close', () => {
        const room = salas[currentRoom];
        if (!room) return;

        if (isHost) {
            if (room.cliente && room.cliente.readyState === WebSocket.OPEN) {
                room.cliente.send(JSON.stringify({ type: 'host_desconectado' }));
                room.cliente.close();
            }
            delete salas[currentRoom];
            console.log(`Sala destruida (host desconectado): ${currentRoom}`);
        } else {
            room.cliente = null;
            if (room.host && room.host.readyState === WebSocket.OPEN) {
                room.host.send(JSON.stringify({ type: 'cliente_desconectado' }));
            }
            console.log(`Cliente abandonó la sala: ${currentRoom}`);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Servidor Relay WebSocket y HTTP corriendo en puerto ${PORT}`);
});