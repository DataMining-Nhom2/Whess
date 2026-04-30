/**
 * gameLogic.js — Logic cờ vua (chess.js wrapper)
 */
const { Chess } = require('chess.js');

/**
 * Validate a move given current FEN and move SAN.
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateMove(fen, san) {
    try {
        const chess = new Chess(fen);
        const move = chess.move(san);
        if (!move) {
            return { valid: false, error: 'Nước đi không hợp lệ' };
        }
        return { valid: true, error: null, move };
    } catch (e) {
        return { valid: false, error: e.message };
    }
}

/**
 * Detect game over from current FEN.
 * @returns {{ isOver: boolean, result: string|null, reason: string|null }}
 */
function detectGameOver(fen) {
    const chess = new Chess(fen);

    if (chess.isCheckmate()) {
        // The side that just moved is the winner
        const winner = chess.turn() === 'w' ? '0-1' : '1-0';
        return { isOver: true, result: winner, reason: 'checkmate' };
    }

    if (chess.isStalemate()) {
        return { isOver: true, result: '1/2-1/2', reason: 'stalemate' };
    }

    if (chess.isThreefoldRepetition()) {
        return { isOver: true, result: '1/2-1/2', reason: 'draw' };
    }

    if (chess.isInsufficientMaterial()) {
        return { isOver: true, result: '1/2-1/2', reason: 'draw' };
    }

    if (chess.isDraw()) {
        return { isOver: true, result: '1/2-1/2', reason: 'draw' };
    }

    return { isOver: false, result: null, reason: null };
}

/**
 * Build PGN string from moves array.
 * Format: "1. e4 e5 2. Nf3 Nc6"
 */
function buildPGN(moves) {
    let pgn = '';
    for (let i = 0; i < moves.length; i++) {
        if (i % 2 === 0) {
            pgn += `${Math.floor(i / 2) + 1}. `;
        }
        pgn += moves[i] + ' ';
    }
    return pgn.trim();
}

module.exports = {
    validateMove,
    detectGameOver,
    buildPGN,
};
