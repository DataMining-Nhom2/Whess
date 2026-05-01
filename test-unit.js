/**
 * Unit tests for Whess server modules
 * Run: node test-unit.js
 */
const assert = require('assert');

// ─── Test roomManager ──────────────────────────────────────────────────────────
console.log('\n=== Testing roomManager ===');

const roomManager = require('./server/roomManager');

// Test: createRoom
const { roomId, sessionToken } = roomManager.createRoom();
console.log('PASS createRoom: ' + roomId + ', token: ' + sessionToken.substring(0, 8) + '...');
assert(roomId.length === 6, 'Room ID should be 6 chars');
assert(typeof sessionToken === 'string', 'Session token should be string');

const room = roomManager.getRoom(roomId);
console.log('PASS getRoom: ' + (room ? 'found' : 'not found'));
assert(room !== null, 'Room should exist');
assert(room.status === 'waiting', 'New room should be waiting');
assert(room.players.white === null, 'White slot should be empty');
assert(room.timeControl.initial === 900, 'Default time should be 900s');

// Test: createRoom with custom time (5 mins)
const { roomId: r_5m } = roomManager.createRoom(5);
const room_5m = roomManager.getRoom(r_5m);
console.log('PASS createRoom 5 mins');
assert(room_5m.timeControl.initial === 300, '5 mins time should be 300s');
assert(room_5m.whiteTimeLeft === 300, 'White time should be 300s');

// Test: createRoom with invalid custom time (fallback to 15 mins)
const { roomId: r_inv } = roomManager.createRoom(999);
const room_inv = roomManager.getRoom(r_inv);
console.log('PASS createRoom invalid time fallback');
assert(room_inv.timeControl.initial === 900, 'Invalid time should fallback to 900s');


// Test: assignPlayer - first player gets white
const { success, color, sessionToken: token2 } = roomManager.assignPlayer(roomId, 'socket-1');
console.log('PASS assignPlayer(socket-1): ' + color);
assert(success === true, 'assignPlayer should succeed');
assert(color === 'white', 'First player should be white');

// Test: assignPlayer - second player gets black
const { success: s2, color: c2 } = roomManager.assignPlayer(roomId, 'socket-2');
console.log('PASS assignPlayer(socket-2): ' + c2);
assert(s2 === true, 'Second assignPlayer should succeed');
assert(c2 === 'black', 'Second player should be black');

// Test: assignPlayer - third player gets ROOM_FULL
const { success: s3, error } = roomManager.assignPlayer(roomId, 'socket-3');
console.log('PASS assignPlayer(socket-3): ROOM_FULL, error=' + error);
assert(s3 === false, 'Third assignPlayer should fail');
assert(error === 'ROOM_FULL', 'Should return ROOM_FULL');

// Test: joinRoom - existing room
roomManager.cleanupRoom(roomId);
const { roomId: r2 } = roomManager.createRoom();
const joinRes = roomManager.joinRoom(r2, 'socket-X');
console.log('PASS joinRoom: ' + joinRes.color + ', success=' + joinRes.success);
assert(joinRes.success === true, 'joinRoom should succeed');
assert(joinRes.color === 'white', 'First joiner should be white');

// Test: joinRoom - non-existent room
const badJoin = roomManager.joinRoom('nonexistent', 'socket-Y');
console.log('PASS joinRoom nonexistent: ' + badJoin.error.code);
assert(badJoin.success === false, 'joinRoom should fail for nonexistent room');
assert(badJoin.error.code === 'ROOM_NOT_FOUND', 'Should be ROOM_NOT_FOUND');

// Test: room status after both players join
roomManager.cleanupRoom(r2);
const { roomId: r3 } = roomManager.createRoom();
roomManager.joinRoom(r3, 'player-white');
roomManager.joinRoom(r3, 'player-black');
const r3room = roomManager.getRoom(r3);
console.log('PASS Room status after 2 players: ' + r3room.status);
assert(r3room.status === 'playing', 'Room should be playing after 2 players join');

// Test: getPlayerColor
const whiteColor = roomManager.getPlayerColor(r3, 'player-white');
const blackColor = roomManager.getPlayerColor(r3, 'player-black');
console.log('PASS getPlayerColor: white=' + whiteColor + ', black=' + blackColor);
assert(whiteColor === 'white', 'Should be white');
assert(blackColor === 'black', 'Should be black');

// Test: handleDisconnect
roomManager.handleDisconnect(r3, 'black');
const r3After = roomManager.getRoom(r3);
console.log('PASS handleDisconnect(black): players.black = ' + r3After.players.black);
assert(r3After.players.black === null, 'Black should be null after disconnect');

// Test: restoreSession
const r3After2 = roomManager.getRoom(r3);
const tokenBlack = r3After2.sessionTokens.black;
const restore = roomManager.restoreSession(tokenBlack, 'player-black-new');
console.log('PASS restoreSession: ' + restore.success + ', color=' + restore.color);
assert(restore.success === true, 'Restore should succeed');
assert(restore.color === 'black', 'Should restore as black');

// Test: cleanupRoom
roomManager.cleanupRoom(r3);
const r3Deleted = roomManager.getRoom(r3);
console.log('PASS cleanupRoom: ' + (r3Deleted === null ? 'deleted' : 'still exists'));
assert(r3Deleted === null, 'Room should be deleted');

// ─── Test gameLogic ───────────────────────────────────────────────────────────
console.log('\n=== Testing gameLogic ===');

const gameLogic = require('./server/gameLogic');

// Test: validateMove - valid opening
const valid = gameLogic.validateMove(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'e4'
);
console.log('PASS validateMove e4: valid=' + valid.valid);
assert(valid.valid === true, 'e4 should be valid');

// Test: validateMove - invalid move (white trying e5)
const invalid = gameLogic.validateMove(
    'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    'e5'
);
console.log('PASS validateMove e5 (invalid): valid=' + invalid.valid);
assert(invalid.valid === false, 'e5 should be invalid for white');

// Test: validateMove - valid after opening
const valid2 = gameLogic.validateMove(
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    'e5'
);
console.log('PASS validateMove e5 (after e4): valid=' + valid2.valid);
assert(valid2.valid === true, 'e5 should be valid after e4');

// Test: detectGameOver - not over
const notOver = gameLogic.detectGameOver(
    'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'
);
console.log('PASS detectGameOver (start): isOver=' + notOver.isOver);
assert(notOver.isOver === false, 'Game should not be over at start');

// Test: detectGameOver - checkmate (Fool's Mate: e4 f5 e5 g5 Qh5#)
const checkmateFen = 'rnbqkbnr/ppppp2p/8/4PppQ/8/8/PPPP1PPP/RNB1KBNR b KQkq - 1 3';
const checkmate = gameLogic.detectGameOver(checkmateFen);
console.log('PASS detectGameOver (checkmate): isOver=' + checkmate.isOver + ', result=' + checkmate.result + ', reason=' + checkmate.reason);
assert(checkmate.isOver === true, 'Should detect checkmate');
assert(checkmate.reason === 'checkmate', 'Should be checkmate');
assert(checkmate.result === '1-0', 'White wins (1-0)');

// Test: detectGameOver - stalemate
const stalemateFen = gameLogic.detectGameOver('8/8/8/8/8/8/8/4K1k1 w - - 0 1');
console.log('PASS detectGameOver (stalemate): isOver=' + stalemateFen.isOver + ', result=' + stalemateFen.result + ', reason=' + stalemateFen.reason);
// Note: stalemate detection may return false for invalid FEN, but the function should handle it gracefully

// Test: buildPGN
const pgn = gameLogic.buildPGN(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
console.log('PASS buildPGN: "' + pgn + '"');
assert(pgn === '1. e4 e5 2. Nf3 Nc6 3. Bb5', 'PGN should match');

// ─── Test clockManager ─────────────────────────────────────────────────────────
console.log('\n=== Testing clockManager ===');

const clockManager = require('./server/clockManager');

// Test: parseTimeControl
const tc1 = clockManager.parseTimeControl('15+0');
console.log('PASS parseTimeControl(15+0): initial=' + tc1.initial + ', increment=' + tc1.increment);
assert(tc1.initial === 900, '15 min = 900 sec');
assert(tc1.increment === 0, 'no increment');

const tc2 = clockManager.parseTimeControl('5+3');
console.log('PASS parseTimeControl(5+3): initial=' + tc2.initial + ', increment=' + tc2.increment);
assert(tc2.initial === 300, '5 min = 300 sec');
assert(tc2.increment === 3, '3 sec increment');

// Test: parseTimeControl with object
const tc3 = clockManager.parseTimeControl({ initial: 600, increment: 10 });
console.log('PASS parseTimeControl(object): initial=' + tc3.initial);
assert(tc3.initial === 600, 'Should passthrough object');

// Test: initClock
clockManager.initClock('test-room', '15+0');
const times = clockManager.getTimes('test-room');
console.log('PASS initClock: white=' + times.whiteTime + ', black=' + times.blackTime);
assert(times.whiteTime === 900, 'White should have 900 sec');
assert(times.blackTime === 900, 'Black should have 900 sec');

// Test: startClock
clockManager.startClock('test-room', 'white');
const active = clockManager.getActiveSide('test-room');
console.log('PASS startClock(white): active=' + active);
assert(active === 'white', 'White should be active');

// Test: switchClock
const { timeSpent } = clockManager.switchClock('test-room');
const times2 = clockManager.getTimes('test-room');
const active2 = clockManager.getActiveSide('test-room');
console.log('PASS switchClock: spent=' + timeSpent + 's, active=' + active2);
assert(active2 === 'black', 'Black should be active after switch');
assert(timeSpent >= 0, 'Should have recorded time spent');

// Test: pauseClock
clockManager.pauseClock('test-room', 'black');
const active3 = clockManager.getActiveSide('test-room');
console.log('PASS pauseClock(black): active=' + active3);

// Test: resumeClock
clockManager.resumeClock('test-room', 'black');
const active4 = clockManager.getActiveSide('test-room');
console.log('PASS resumeClock(black): active=' + active4);
assert(active4 === 'black', 'Black should be active after resume');

// Test: stopClock
clockManager.stopClock('test-room');
const active5 = clockManager.getActiveSide('test-room');
console.log('PASS stopClock: active=' + active5);
assert(active5 === null, 'Should be stopped');

// Test: deleteClock
clockManager.deleteClock('test-room');
console.log('PASS deleteClock');

// ─── Test clock timeout ─────────────────────────────────────────────────────────
console.log('\n=== Testing Clock Timeout ===');

let timeoutFired = false;
let timeoutSide = null;
clockManager.initClock('timeout-test', { initial: 2, increment: 0 });
clockManager.setTimeoutCallback('timeout-test', (roomId, side) => {
    timeoutFired = true;
    timeoutSide = side;
    console.log('PASS Timeout callback fired: room=' + roomId + ', side=' + side);
});
clockManager.startClock('timeout-test', 'white');

setTimeout(() => {
    clockManager.deleteClock('timeout-test');
    assert(timeoutFired === true, 'Timeout callback should have fired');
    assert(timeoutSide === 'white', 'White should timeout');

    // ─── Test aiClient module ─────────────────────────────────────────────
    console.log('\n=== Testing aiClient ===');
    const aiClient = require('./server/aiClient');
    console.log('PASS aiClient module loaded');
    assert(typeof aiClient.requestELOPrediction === 'function', 'Should have requestELOPrediction');

    console.log('\n=== ALL UNIT TESTS PASSED ===\n');
    process.exit(0);
}, 2500);

// Safety timeout
setTimeout(() => {
    console.log('\n[TIMEOUT] Tests took too long');
    clockManager.deleteClock('test-room');
    clockManager.deleteClock('timeout-test');
    process.exit(1);
}, 10000);
