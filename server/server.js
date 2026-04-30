/**
 * server.js — Entry point: Express + Socket.IO
 * Port: 3000
 */
const express = require('express');
const { Server } = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

const io = new Server(server, {
    cors: '*'
});

server.listen(port, () => {
    console.log(`[Server] listening on *:${port}`);
});

// ─── REST Endpoints ────────────────────────────────────────────────

app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Modules ────────────────────────────────────────────────────────

const roomManager = require('./roomManager');
const clockManager = require('./clockManager');
const { validateMove, detectGameOver, buildPGN } = require('./gameLogic');
const { requestELOPrediction } = require('./aiClient');

// ─── Helpers ───────────────────────────────────────────────────────

function getOpponentSocketId(roomId, color) {
    const opponentColor = color === 'white' ? 'black' : 'white';
    return roomManager.getSocketId(roomId, opponentColor);
}

function getOpponentRoom(roomId, socketId) {
    const color = roomManager.getPlayerColor(roomId, socketId);
    if (!color) return null;
    return { roomId, color, socketId };
}

// ─── Game Over Handler ─────────────────────────────────────────────

async function handleGameOver(roomId, result, reason, io) {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    room.status = 'finished';
    room.result = result;
    room.resultReason = reason;
    room.finishedAt = Date.now();

    clockManager.stopClock(roomId);

    console.log(`[GameOver] ${roomId}: ${result} (${reason}), moves=${room.moves.length}, clockTimes=${room.clockTimes.length}`);

    // Notify both players
    io.to(roomId).emit('game_over', { result, reason });
    io.to(roomId).emit('ai_loading');

    // Call AI Engine
    const aiResult = await requestELOPrediction(room);
    if (aiResult) {
        io.to(roomId).emit('ai_result', aiResult);
    } else {
        io.to(roomId).emit('ai_error', {
            message: 'Không thể kết nối AI Engine. Phân tích ELO tạm thời không khả dụng.',
        });
    }

    // Schedule room cleanup after 5 minutes
    roomManager.scheduleRoomCleanup(roomId, 5 * 60 * 1000);
}

// ─── Socket.IO Events ───────────────────────────────────────────────

io.on('connection', (socket) => {
    console.log(`[Socket] ${socket.id} connected`);

    // --- Create Room ---
    socket.on('create_room', () => {
        // Leave any previous room first to avoid orphaned rooms
        const prevRoom = socket.data.roomId;
        if (prevRoom) {
            socket.leave(prevRoom);
        }

        const { roomId } = roomManager.createRoom();
        socket.join(roomId);

        // Assign creator as white
        const assign = roomManager.assignPlayer(roomId, socket.id);
        socket.data.roomId = roomId;
        socket.data.color = assign.color;

        socket.emit('room_created', { roomId, sessionToken: assign.sessionToken });
        console.log(`[Socket] ${socket.id} created room ${roomId} as ${assign.color}`);
    });

    // --- Join Room ---
    socket.on('join_room', ({ roomId }) => {
        if (!roomId) {
            return socket.emit('join_result', { error: { code: 'INVALID', message: 'Thiếu mã phòng' } });
        }

        // Leave any previous room first
        const prevRoom = socket.data.roomId;
        if (prevRoom) {
            socket.leave(prevRoom);
        }

        const result = roomManager.joinRoom(roomId, socket.id);

        if (result.error) {
            return socket.emit('join_result', { error: { code: result.error.code, message: result.error.message } });
        }

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.color = result.color;

        const room = roomManager.getRoom(roomId);
        const times = clockManager.getTimes(roomId);

        socket.emit('join_result', {
            success: true,
            color: result.color,
            roomId,
            sessionToken: result.sessionToken,
            fen: room.fen,
            whiteTime: room.whiteTimeLeft,
            blackTime: room.blackTimeLeft,
            moves: room.moves,
            clockTimes: room.clockTimes,
            status: room.status,
        });

        // Notify opponent
        socket.to(roomId).emit('opponent_joined', {
            fen: room.fen,
            whiteTime: room.whiteTimeLeft,
            blackTime: room.blackTimeLeft,
        });

        // ─── Start clock when both players are in ────────────────────
        if (room.players.white !== null && room.players.black !== null) {
            clockManager.initClock(roomId, room.timeControl);
            clockManager.setTimeoutCallback(roomId, (rmId, side) => {
                const r = roomManager.getRoom(rmId);
                if (!r || r.status !== 'playing') return;
                const result = side === 'white' ? '0-1' : '1-0';
                handleGameOver(rmId, result, 'timeout', io);
            });
            clockManager.startClock(roomId, 'white'); // White moves first
            console.log(`[Clock] Started for ${roomId}`);
        }

        console.log(`[Socket] ${socket.id} joined room ${roomId} as ${result.color}`);
    });

    // --- Make Move ---
    socket.on('make_move', ({ room: roomId, move, san, fen }, callback) => {
        if (!roomId) return;
        const color = socket.data.color;
        const room = roomManager.getRoom(roomId);
        if (!room || room.status !== 'playing') return;

        // Validate it's this player's turn
        const expectedTurn = room.currentTurn === 'w' ? 'white' : 'black';
        if (color !== expectedTurn) {
            return socket.emit('invalid_move', { message: 'Chưa đến lượt bạn' });
        }

        // Validate move with chess.js
        const validation = validateMove(room.fen, san);
        if (!validation.valid) {
            return socket.emit('invalid_move', { message: validation.error || 'Nước đi không hợp lệ' });
        }

        // Record the move
        room.moves.push(san);
        room.fen = fen;
        room.currentTurn = room.currentTurn === 'w' ? 'b' : 'w';
        room.lastMoveTimestamp = Date.now();

        // Switch clock and record time spent
        const { timeSpent } = clockManager.switchClock(roomId);
        room.clockTimes.push(timeSpent);

        console.log(`[Move] ${roomId}: ${san} by ${color}, timeSpent=${timeSpent}s, move#=${room.moves.length}`);

        const times = clockManager.getTimes(roomId);
        const activeSide = clockManager.getActiveSide(roomId);

        // Broadcast to opponent
        socket.to(roomId).emit('move_made', {
            move,
            san,
            fen,
            whiteTime: times.whiteTime,
            blackTime: times.blackTime,
            activeSide,
        });

        // Emit clock update to both
        io.to(roomId).emit('clock_update', {
            whiteTime: times.whiteTime,
            blackTime: times.blackTime,
            activeSide,
        });

        // Check for game over
        const gameOver = detectGameOver(fen);
        if (gameOver.isOver) {
            handleGameOver(roomId, gameOver.result, gameOver.reason, io);
        }

        if (callback) callback({ ok: true });
    });

    // --- Resign ---
    socket.on('resign', () => {
        const roomId = socket.data.roomId;
        const color = socket.data.color;
        if (!roomId || !color) return;

        const room = roomManager.getRoom(roomId);
        if (!room || room.status !== 'playing') return;

        const result = color === 'white' ? '0-1' : '1-0';
        handleGameOver(roomId, result, 'resign', io);
    });

    // --- Exit Room ---
    socket.on('exit_room', () => {
        const roomId = socket.data.roomId;
        const color = socket.data.color;
        if (!roomId || !color) return;

        const room = roomManager.getRoom(roomId);
        if (room) {
            socket.to(roomId).emit('opponent_left');

            if (room.status === 'waiting') {
                roomManager.cleanupRoom(roomId);
                clockManager.deleteClock(roomId);
            } else if (room.status === 'playing') {
                const result = color === 'white' ? '0-1' : '1-0';
                handleGameOver(roomId, result, 'resign', io);
            }
        }

        // Always leave the socket.io room and clear socket data
        socket.leave(roomId);
        delete socket.data.roomId;
        delete socket.data.color;
    });

    // --- Play Again ---
    socket.on('play_again', () => {
        const roomId = socket.data.roomId;
        if (!roomId) return;

        const room = roomManager.getRoom(roomId);
        if (!room) return;

        // Reset game state
        room.status = 'playing';
        room.moves = [];
        room.clockTimes = [];
        room.fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
        room.currentTurn = 'w';
        room.result = null;
        room.resultReason = null;
        room.finishedAt = null;

        clockManager.resetClock(roomId);
        clockManager.setTimes(roomId, room.timeControl.initial, room.timeControl.initial);
        clockManager.startClock(roomId, 'white');

        const times = clockManager.getTimes(roomId);
        const activeSide = clockManager.getActiveSide(roomId);

        io.to(roomId).emit('reset_game', {
            fen: room.fen,
            whiteTime: times.whiteTime,
            blackTime: times.blackTime,
            activeSide,
        });
    });

    // --- Reconnect ---
    socket.on('reconnect', ({ roomId, sessionToken }) => {
        if (!sessionToken) {
            return socket.emit('reconnect_result', { error: 'No session token' });
        }

        const { success, color, roomState } = roomManager.restoreSession(sessionToken, socket.id);

        if (!success || !roomState) {
            return socket.emit('reconnect_result', { error: 'Session not found or expired' });
        }

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.color = color;

        const times = clockManager.getTimes(roomId);
        const activeSide = clockManager.getActiveSide(roomId);

        socket.emit('reconnect_result', {
            success: true,
            color,
            roomId,
            fen: roomState.fen,
            moves: roomState.moves,
            clockTimes: roomState.clockTimes,
            whiteTime: times.whiteTime,
            blackTime: times.blackTime,
            activeSide,
        });

        // Notify opponent
        socket.to(roomId).emit('opponent_reconnected');

        console.log(`[Socket] ${socket.id} reconnected to ${roomId} as ${color}`);
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
        const roomId = socket.data.roomId;
        const color = socket.data.color;

        if (!roomId || !color) return; // Intentional exit already handled

        const room = roomManager.getRoom(roomId);
        if (!room) return;

        // Pause clock for this side
        clockManager.pauseClock(roomId, color);

        // Handle in room manager (sets player to null, schedules cleanup)
        roomManager.handleDisconnect(roomId, color);

        // Check if both disconnected
        if (room.players.white === null && room.players.black === null) {
            // Both disconnected → pause all clocks
            clockManager.pauseAllClock(roomId);
            // 30s cleanup timer already set by roomManager.handleDisconnect
        } else {
            // Notify opponent
            socket.to(roomId).emit('opponent_disconnected');
        }

        console.log(`[Socket] ${socket.id} (${color}) disconnected from ${roomId}`);
    });
});
