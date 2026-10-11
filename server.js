const WebSocket = require('ws');
const http = require('http');
const { URL } = require('url');

const PORT = process.env.PORT || 8910;
const salas = {}; // { "codigo": { host: ws, cliente: ws, password: "..." } }

const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    // Ruta para que UptimeRobot haga ping y el servidor despierte
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/ping') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Servidor activo y funcionando');
        return;
    }
    
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

wss.on('connection', (ws, req) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    const roomCode = parsedUrl.searchParams.get('room');
    const password = parsedUrl.searchParams.get('pass');
    const role = parsedUrl.searchParams.get('role'); // 'host' o 'cliente'
    const nombre = parsedUrl.searchParams.get('nombre') || 'Jugador';

    if (!roomCode) {
        ws.close();
        return;
    }

    // Si entra el anfitrión (host)
    if (role === 'host') {
        salas[roomCode] = {
            host: ws,
            cliente: null,
            password: password
        };

        ws.on('close', () => {
            if (salas[roomCode]) {
                if (salas[roomCode].cliente) {
                    salas[roomCode].cliente.send(JSON.stringify({ type: 'host_desconectado' }));
                }
                delete salas[roomCode];
            }
        });
    } 
    // Si entra el invitado (cliente)
    else if (role === 'cliente') {
        if (!salas[roomCode]) {
            ws.close();
            return;
        }
        salas[roomCode].cliente = ws;

        // Notificamos al host que el cliente se ha conectado, enviando su nombre
        if (salas[roomCode].host) {
            salas[roomCode].host.send(JSON.stringify({ 
                type: 'cliente_conectado', 
                nombre: nombre 
            }));
        }

        ws.on('close', () => {
            if (salas[roomCode]) {
                salas[roomCode].cliente = null;
                if (salas[roomCode].host) {
                    salas[roomCode].host.send(JSON.stringify({ type: 'cliente_desconectado' }));
                }
            }
        });
    }

    // Reenvío de mensajes de chat en tiempo real entre ambos
    ws.on('message', (message) => {
        const room = salas[roomCode];
        if (!room) return;

        if (ws === room.host && room.cliente) {
            room.cliente.send(message);
        } else if (ws === room.cliente && room.host) {
            room.host.send(message);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Servidor relay escuchando en el puerto ${PORT}`);
});