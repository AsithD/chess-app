const express = require('express');
const app = express();
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const path = require('path');

app.use(cors());

const ADRIVES = ["Swift", "Bold", "Cunning", "Silver", "Gold", "Shadow", "Royal", "Fierce", "Noble", "Ancient"];
const CHESS_NOUNS = ["Pawn", "Bishop", "Knight", "Rook", "Queen", "King", "Gambit", "Mate", "Square", "Rank"];

function generateRoomName() {
    const adj = ADRIVES[Math.floor(Math.random() * ADRIVES.length)];
    const noun = CHESS_NOUNS[Math.floor(Math.random() * CHESS_NOUNS.length)];
    return `${adj}${noun}${Math.floor(Math.random() * 99)}`;
}

// Serve static files from the Vite build directory
app.use(express.static(path.join(__dirname, '..', 'dist')));

app.get('/health', (req, res) => {
    res.send("Chess Server is running!");
});

// For any other request, serve the index.html from the dist folder
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*", // Allow any origin to fix port 5173 vs 5174 issues
        methods: ["GET", "POST"]
    }
});

const rooms = new Map();
const onlineUsers = new Map(); // uid -> { socketId, name, photoURL }

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // Map uid to socket
    socket.on("identify", (userData) => {
        if (userData && userData.uid) {
            onlineUsers.set(userData.uid, {
                socketId: socket.id,
                name: userData.name,
                photoURL: userData.photoURL
            });
            // Public list of online users (excluding passwords/emails etc)
            const list = Array.from(onlineUsers.entries()).map(([uid, data]) => ({
                uid,
                name: data.name,
                photoURL: data.photoURL
            }));
            io.emit("online_users_update", list);
        }
    });

    socket.on("disconnect", () => {
        console.log(`User Disconnected: ${socket.id}`);
        // Remove from onlineUsers
        for (const [uid, data] of onlineUsers.entries()) {
            if (data.socketId === socket.id) {
                onlineUsers.delete(uid);
                break;
            }
        }
        io.emit("online_users_update", Array.from(onlineUsers.entries()).map(([uid, data]) => ({
            uid,
            name: data.name,
            photoURL: data.photoURL
        })));
    });

    socket.on("create_room", ({ room, color }) => {
        const finalRoomName = room && room.trim() !== "" ? room : generateRoomName();

        if (rooms.has(finalRoomName) && room) {
            socket.emit("room_error", "Room already exists!");
            return;
        }

        // If it was a random name and it exists (unlikely), generate again
        let attempts = 0;
        let finalName = finalRoomName;
        while (rooms.has(finalName) && !room && attempts < 5) {
            finalName = generateRoomName();
            attempts++;
        }

        const assignedColor = color === 'random' ? (Math.random() > 0.5 ? 'white' : 'black') : color;

        rooms.set(finalName, {
            players: [socket.id],
            colors: { [socket.id]: assignedColor },
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" // Initial FEN
        });

        socket.join(finalName);
        socket.emit("room_created", { room: finalName, color: assignedColor });
        console.log(`Room created: ${finalName} by ${socket.id} as ${assignedColor}`);
    });

    socket.on("join_room", ({ room }) => {
        const roomData = rooms.get(room);

        if (!roomData) {
            socket.emit("room_error", "Room does not exist!");
            return;
        }

        if (roomData.players.length >= 2) {
            socket.emit("room_error", "Room is full!");
            return;
        }

        // Determine color for the joiner
        const creatorId = roomData.players[0];
        const creatorColor = roomData.colors[creatorId];
        const joinerColor = creatorColor === 'white' ? 'black' : 'white';

        roomData.players.push(socket.id);
        roomData.colors[socket.id] = joinerColor;

        socket.join(room);

        // Notify joiner with current game state
        socket.emit("room_joined", {
            room,
            color: joinerColor,
            fen: roomData.fen
        });

        // Notify creator (and joiner) that game serves can start/sync
        socket.to(room).emit("user_joined", socket.id);
        io.in(room).emit("game_start", {
            players: roomData.players,
            colors: roomData.colors,
            fen: roomData.fen
        });

        console.log(`User ${socket.id} joined ${room} as ${joinerColor}`);
    });

    socket.on("send_move", (data) => {
        const roomData = rooms.get(data.room);
        if (roomData) {
            // Update FEN on server (Frontend sends the move, not FEN, so we might want to store FEN too)
            // For now, let's assume the frontend will send the *new* FEN as well or we compute it.
            // Actually, frontend current code sends { move, room }.
            // Let's add 'fen' to the send_move payload in Game.jsx later.
            if (data.newFen) roomData.fen = data.newFen;
            socket.to(data.room).emit("receive_move", data.move);
        }
    });

    socket.on("sync_board", ({ room, fen }) => {
        const roomData = rooms.get(room);
        if (roomData) {
            roomData.fen = fen;
            socket.to(room).emit("set_board", fen);
        }
    });

    // Chat Events
    socket.on("send_message", (data) => {
        socket.to(data.room).emit("receive_message", data);
    });

    // Game Control Events
    socket.on("resign", ({ room }) => {
        socket.to(room).emit("opponent_resigned");
    });

    socket.on("draw_offer", ({ room }) => {
        socket.to(room).emit("draw_offered");
    });

    socket.on("draw_response", ({ room, accepted }) => {
        if (accepted) {
            io.in(room).emit("game_draw");
        } else {
            socket.to(room).emit("draw_rejected");
        }
    });

    socket.on("rematch_request", ({ room }) => {
        socket.to(room).emit("rematch_requested");
    });

    socket.on("rematch_accept", ({ room }) => {
        const roomData = rooms.get(room);
        if (roomData) {
            // Reset FEN
            roomData.fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

            // Swap colors
            const p1 = roomData.players[0];
            const p2 = roomData.players[1];

            const p1Color = roomData.colors[p1];
            roomData.colors[p1] = p1Color === 'white' ? 'black' : 'white';

            if (p2) {
                const p2Color = roomData.colors[p2];
                roomData.colors[p2] = p2Color === 'white' ? 'black' : 'white';
            }

            io.in(room).emit("game_reset", {
                colors: roomData.colors,
                fen: roomData.fen
            });
        }
    });

    socket.on("send_challenge", ({ targetUid, fromUser }) => {
        const target = onlineUsers.get(targetUid);
        if (target) {
            io.to(target.socketId).emit("challenge_received", {
                fromUid: fromUser.uid,
                fromName: fromUser.name,
                fromPhoto: fromUser.photoURL
            });
        }
    });

    socket.on("accept_challenge", ({ fromUid }) => {
        const challenger = onlineUsers.get(fromUid);
        if (challenger && challenger.socketId) {
            const roomName = `challenge-${Math.random().toString(36).substr(2, 7)}`;

            // Initialize Room Data
            rooms.set(roomName, {
                players: [challenger.socketId, socket.id],
                colors: {
                    [challenger.socketId]: "white",
                    [socket.id]: "black"
                },
                fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
            });

            // Make both sockets join the room at the socket level
            const challengerSocket = io.sockets.sockets.get(challenger.socketId);
            if (challengerSocket) challengerSocket.join(roomName);
            socket.join(roomName);

            // Notify both to start the game
            io.to(challenger.socketId).emit("challenge_accepted", { room: roomName, color: "white" });
            socket.emit("challenge_accepted", { room: roomName, color: "black" });

            console.log(`Challenge Match Started: ${roomName} between ${challenger.socketId} and ${socket.id}`);
        }
    });

    socket.on("reject_challenge", ({ fromUid }) => {
        const challenger = onlineUsers.get(fromUid);
        if (challenger) {
            io.to(challenger.socketId).emit("challenge_rejected");
        }
    });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log("SERVER RUNNING ON PORT", PORT);
});

