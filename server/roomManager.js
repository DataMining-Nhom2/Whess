/**
 * roomManager.js — Quản lý phòng chơi
 */
const { v4: uuidV4 } = require('uuid');

// rooms: Map<roomId, Room>
const rooms = new Map();

// disconnectedSessions: Map<sessionToken, DisconnectSession>
const disconnectedSessions = new Map();

// roomCleanupTimers: Map<roomId, setTimeoutId>
const roomCleanupTimers = new Map();

/**
 * Sinh mã phòng ngẫu nhiên 6 ký tự.
 */
function generateRoomId() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * Sinh session token (UUID v4).
 */
function generateSessionToken() {
    return uuidV4();
}

/**
 * Tạo phòng mới. Người tạo được gán phe Trắng.
 * @returns {{ roomId: string, sessionToken: string }}
 */
function createRoom() {
    const roomId = generateRoomId();
    const sessionToken = generateSessionToken();
    const room = {
        id: roomId,
        status: 'waiting',
        players: { white: null, black: null },
        sessionTokens: { white: null, black: null },
        moves: [],
        clockTimes: [],
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        timeControl: { initial: 900, increment: 0 }, // 15+0
        whiteTimeLeft: 900,
        blackTimeLeft: 900,
        lastMoveTimestamp: null,
        currentTurn: 'w',
        result: null,
        resultReason: null,
        createdAt: Date.now(),
        finishedAt: null,
    };
    rooms.set(roomId, room);
    console.log(`[RoomManager] Created room ${roomId}`);
    return { roomId, sessionToken };
}

/**
 * Lấy phòng theo ID.
 * @returns {Room|null}
 */
function getRoom(roomId) {
    return rooms.get(roomId) || null;
}

/**
 * Gán player vào phòng:
 * - Slot trống đầu tiên (white → black) được fill.
 * @returns {{ success: boolean, color: string|null, sessionToken: string|null, error: string|null }}
 */
function assignPlayer(roomId, socketId) {
    const room = rooms.get(roomId);
    if (!room) {
        return { success: false, color: null, sessionToken: null, error: 'ROOM_NOT_FOUND' };
    }
    if (room.status === 'finished') {
        return { success: false, color: null, sessionToken: null, error: 'ROOM_FINISHED' };
    }

    let color = null;
    if (room.players.white === null) {
        room.players.white = socketId;
        color = 'white';
    } else if (room.players.black === null) {
        room.players.black = socketId;
        color = 'black';
    } else {
        return { success: false, color: null, sessionToken: null, error: 'ROOM_FULL' };
    }

    const sessionToken = generateSessionToken();
    room.sessionTokens[color] = sessionToken;

    // If both slots filled, start the game
    if (room.players.white !== null && room.players.black !== null) {
        room.status = 'playing';
    }

    console.log(`[RoomManager] ${socketId} assigned as ${color} in ${roomId}`);
    return { success: true, color, sessionToken, error: null };
}

/**
 * Join room: tìm phòng và gán player.
 * @returns {{ success: boolean, color: string|null, sessionToken: string|null, error: { code: string, message: string }|null }}
 */
function joinRoom(roomId, socketId) {
    const room = rooms.get(roomId);
    if (!room) {
        return { success: false, color: null, sessionToken: null, error: { code: 'ROOM_NOT_FOUND', message: 'Phòng không tồn tại' } };
    }
    if (room.status === 'finished') {
        return { success: false, color: null, sessionToken: null, error: { code: 'ROOM_FINISHED', message: 'Ván đấu đã kết thúc' } };
    }

    if (room.players.white === socketId) {
        return { success: true, color: 'white', sessionToken: room.sessionTokens.white, error: null };
    }
    if (room.players.black === socketId) {
        return { success: true, color: 'black', sessionToken: room.sessionTokens.black, error: null };
    }

    let color = null;
    if (room.players.white === null) {
        room.players.white = socketId;
        color = 'white';
    } else if (room.players.black === null) {
        room.players.black = socketId;
        color = 'black';
    } else {
        return { success: false, color: null, sessionToken: null, error: { code: 'ROOM_FULL', message: 'Phòng đã đầy' } };
    }

    const sessionToken = generateSessionToken();
    room.sessionTokens[color] = sessionToken;

    if (room.players.white !== null && room.players.black !== null) {
        room.status = 'playing';
    }

    console.log(`[RoomManager] ${socketId} joined ${roomId} as ${color}`);
    return { success: true, color, sessionToken, error: null };
}

/**
 * Player chủ động thoát phòng.
 * @returns {{ action: string }} — 'waiting' | 'playing' | 'finished'
 */
function exitRoom(roomId, color) {
    const room = rooms.get(roomId);
    if (!room) return { action: 'none' };

    if (room.status === 'waiting') {
        // Only the creator was in the room
        rooms.delete(roomId);
        console.log(`[RoomManager] Room ${roomId} deleted (waiting, player left)`);
        return { action: 'waiting' };
    }

    if (room.status === 'playing') {
        // Opponent wins by resign
        return { action: 'playing' };
    }

    return { action: 'finished' };
}

/**
 * Lấy màu quân của player từ socketId.
 * @returns {'white'|'black'|null}
 */
function getPlayerColor(roomId, socketId) {
    const room = rooms.get(roomId);
    if (!room) return null;
    if (room.players.white === socketId) return 'white';
    if (room.players.black === socketId) return 'black';
    return null;
}

/**
 * Lấy socketId từ màu quân.
 */
function getSocketId(roomId, color) {
    const room = rooms.get(roomId);
    if (!room) return null;
    return room.players[color];
}

/**
 * Lấy trạng thái room để gửi cho client.
 */
function getRoomState(roomId) {
    const room = rooms.get(roomId);
    if (!room) return null;
    return {
        fen: room.fen,
        moves: room.moves,
        clockTimes: room.clockTimes,
        whiteTime: room.whiteTimeLeft,
        blackTime: room.blackTimeLeft,
        currentTurn: room.currentTurn,
        status: room.status,
    };
}

/**
 * Cleanup phòng: xóa khỏi rooms, disconnectedSessions, clear timers.
 */
function cleanupRoom(roomId) {
    if (roomCleanupTimers.has(roomId)) {
        clearTimeout(roomCleanupTimers.get(roomId));
        roomCleanupTimers.delete(roomId);
    }
    rooms.delete(roomId);
    console.log(`[RoomManager] Room ${roomId} cleaned up`);
}

/**
 * Schedule room cleanup sau delay (ms).
 */
function scheduleRoomCleanup(roomId, delayMs) {
    cancelRoomCleanup(roomId);
    const timerId = setTimeout(() => {
        cleanupRoom(roomId);
        roomCleanupTimers.delete(roomId);
    }, delayMs);
    roomCleanupTimers.set(roomId, timerId);
    console.log(`[RoomManager] Scheduled cleanup for ${roomId} in ${delayMs}ms`);
}

/**
 * Cancel scheduled cleanup.
 */
function cancelRoomCleanup(roomId) {
    if (roomCleanupTimers.has(roomId)) {
        clearTimeout(roomCleanupTimers.get(roomId));
        roomCleanupTimers.delete(roomId);
        console.log(`[RoomManager] Cancelled cleanup for ${roomId}`);
    }
}

/**
 * Handle player disconnect.
 */
function handleDisconnect(roomId, color) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.players[color] = null;

    // Store disconnected session
    const sessionToken = room.sessionTokens[color];
    if (sessionToken) {
        disconnectedSessions.set(sessionToken, {
            roomId,
            color,
            sessionToken,
            disconnectedAt: Date.now(),
        });
    }

    console.log(`[RoomManager] Player ${color} disconnected from ${roomId}`);

    // If only one player was in the room (waiting state), remove the room immediately.
    // If both players were in (playing state), only nullify — room stays for reconnect window.
    if (room.status === 'waiting') {
        // Single player left a waiting room → clean up immediately
        rooms.delete(roomId);
        cancelRoomCleanup(roomId);
        console.log(`[RoomManager] Room ${roomId} cleaned up (was in waiting state)`);
    } else {
        // Both disconnected → cleanup timer 30s
        if (room.players.white === null && room.players.black === null) {
            scheduleRoomCleanup(roomId, 30000);
        }
    }
}

/**
 * Restore session from token (reconnect).
 * @returns {{ success: boolean, color: string|null, roomState: object|null }}
 */
function restoreSession(sessionToken, newSocketId) {
    const session = disconnectedSessions.get(sessionToken);
    if (!session) return { success: false, color: null, roomState: null };

    const { roomId, color } = session;
    const room = rooms.get(roomId);
    if (!room) return { success: false, color: null, roomState: null };

    // Restore socket id
    room.players[color] = newSocketId;

    // Remove from disconnected sessions
    disconnectedSessions.delete(sessionToken);

    // Cancel any pending cleanup
    cancelRoomCleanup(roomId);

    console.log(`[RoomManager] Session restored for ${color} in ${roomId}`);
    return {
        success: true,
        color,
        roomState: getRoomState(roomId),
    };
}

module.exports = {
    createRoom,
    getRoom,
    assignPlayer,
    joinRoom,
    exitRoom,
    getPlayerColor,
    getSocketId,
    getRoomState,
    handleDisconnect,
    restoreSession,
    cleanupRoom,
    scheduleRoomCleanup,
    cancelRoomCleanup,
    generateSessionToken,
};
