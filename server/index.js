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
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const rooms = new Map();
const onlineUsers = new Map(); // uid -> { socketId, name, photoURL, rating }

// Elo calculation (K=32)
function calculateNewRating(playerRating, opponentRating, score) {
    const k = 32;
    const expected = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
    return Math.round(playerRating + k * (score - expected));
}

io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // Map uid to socket
    socket.on("identify", (userData) => {
        if (userData && userData.uid) {
            onlineUsers.set(userData.uid, {
                socketId: socket.id,
                name: userData.name,
                photoURL: userData.photoURL,
                rating: userData.rating || 400
            });
            // Public list of online users
            const list = Array.from(onlineUsers.entries()).map(([uid, data]) => ({
                uid,
                name: data.name,
                photoURL: data.photoURL,
                rating: data.rating
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
            photoURL: data.photoURL,
            rating: data.rating
        })));
    });

    socket.on("match_concluded", ({ room, winnerUid, isDraw }) => {
        const roomData = rooms.get(room);
        if (roomData && roomData.isRated) {
            const playerIds = roomData.players;
            if (playerIds.length < 2) return;

            const uid1 = roomData.uids[playerIds[0]];
            const uid2 = roomData.uids[playerIds[1]];

            const user1 = onlineUsers.get(uid1);
            const user2 = onlineUsers.get(uid2);

            if (user1 && user2) {
                const score1 = isDraw ? 0.5 : (winnerUid === uid1 ? 1 : 0);
                const score2 = isDraw ? 0.5 : (winnerUid === uid2 ? 1 : 0);

                const newR1 = calculateNewRating(user1.rating, user2.rating, score1);
                const newR2 = calculateNewRating(user2.rating, user1.rating, score2);

                user1.rating = newR1;
                user2.rating = newR2;

                // Broadcast new ratings
                const list = Array.from(onlineUsers.entries()).map(([uid, data]) => ({
                    uid,
                    name: data.name,
                    photoURL: data.photoURL,
                    rating: data.rating
                }));
                io.emit("online_users_update", list);

                // Notify specific players
                io.to(playerIds[0]).emit("rating_update", { newRating: newR1 });
                io.to(playerIds[1]).emit("rating_update", { newRating: newR2 });

                console.log(`Elo Update: ${user1.name} (${newR1}), ${user2.name} (${newR2})`);
            }
        }
    });

    socket.on("create_room", ({ room, color }) => {
        const finalRoomName = room && room.trim() !== "" ? room : generateRoomName();
        if (rooms.has(finalRoomName) && room) {
            socket.emit("room_error", "Room already exists!");
            return;
        }
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
            fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            moveHistory: ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
            evaluations: []
        });
        socket.join(finalName);
        socket.emit("room_created", { room: finalName, color: assignedColor });
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
        const assignedColor = roomData.colors[roomData.players[0]] === 'white' ? 'black' : 'white';
        roomData.players.push(socket.id);
        roomData.colors[socket.id] = assignedColor;
        socket.join(room);

        // Use user_joined for Consistency with Game.jsx
        socket.emit("room_joined", {
            room,
            color: assignedColor,
            fen: roomData.fen,
            moveHistory: roomData.moveHistory,
            evaluations: roomData.evaluations
        });
        socket.to(room).emit("user_joined", socket.id);

        console.log(`User ${socket.id} joined room ${room} as ${assignedColor}`);
    });

    socket.on("send_move", ({ room, move, fen, label }) => {
        const roomData = rooms.get(room);
        if (roomData) {
            roomData.fen = fen;
            roomData.moveHistory.push(fen);
            if (label) roomData.evaluations.push(label);
            socket.to(room).emit("receive_move", move);
        }
    });

    socket.on("sync_board", ({ room, fen, moveHistory, evaluations }) => {
        const roomData = rooms.get(room);
        if (roomData) {
            roomData.fen = fen;
            if (moveHistory) roomData.moveHistory = moveHistory;
            if (evaluations) roomData.evaluations = evaluations;
            socket.to(room).emit("set_board", { fen, moveHistory, evaluations });
        }
    });

    socket.on("resign", ({ room }) => {
        socket.to(room).emit("opponent_resigned");
    });

    socket.on("draw_offer", ({ room }) => {
        socket.to(room).emit("draw_offered");
    });

    socket.on("draw_response", ({ room, accepted }) => {
        if (accepted) io.in(room).emit("game_draw");
        else socket.to(room).emit("draw_rejected");
    });

    socket.on("rematch_request", ({ room }) => {
        socket.to(room).emit("rematch_requested");
    });

    socket.on("rematch_accept", ({ room }) => {
        const roomData = rooms.get(room);
        if (roomData) {
            roomData.fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
            const p1 = roomData.players[0];
            const p2 = roomData.players[1];
            roomData.colors[p1] = roomData.colors[p1] === 'white' ? 'black' : 'white';
            if (p2) roomData.colors[p2] = roomData.colors[p2] === 'white' ? 'black' : 'white';
            io.in(room).emit("game_reset", { colors: roomData.colors, fen: roomData.fen });
        }
    });

    socket.on("send_challenge", ({ targetUid, fromUser, isRated }) => {
        const target = onlineUsers.get(targetUid);
        if (target) {
            io.to(target.socketId).emit("challenge_received", {
                fromUid: fromUser.uid,
                fromName: fromUser.name,
                fromPhoto: fromUser.photoURL,
                fromRating: fromUser.rating,
                isRated: isRated
            });
        }
    });

    socket.on("accept_challenge", ({ fromUid, isRated }) => {
        const challenger = onlineUsers.get(fromUid);
        if (challenger && challenger.socketId) {
            const roomName = `challenge-${Math.random().toString(36).substr(2, 7)}`;
            rooms.set(roomName, {
                players: [challenger.socketId, socket.id],
                colors: { [challenger.socketId]: "white", [socket.id]: "black" },
                fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                moveHistory: ["rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
                evaluations: [],
                isRated: isRated,
                uids: {
                    [challenger.socketId]: fromUid,
                    [socket.id]: Array.from(onlineUsers.entries()).find(([uid, data]) => data.socketId === socket.id)?.[0]
                }
            });
            const challengerSocket = io.sockets.sockets.get(challenger.socketId);
            if (challengerSocket) challengerSocket.join(roomName);
            socket.join(roomName);
            io.to(challenger.socketId).emit("challenge_accepted", { room: roomName, color: "white", isRated });
            socket.emit("challenge_accepted", { room: roomName, color: "black", isRated });
        }
    });

    socket.on("reject_challenge", ({ fromUid }) => {
        const challenger = onlineUsers.get(fromUid);
        if (challenger) io.to(challenger.socketId).emit("challenge_rejected");
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
