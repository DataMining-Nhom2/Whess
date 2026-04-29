/**
 * clockManager.js — Server-side chess clock
 * Manages per-room clock state with pause/resume per side.
 */

// Map<roomId, ClockState>
const clocks = new Map();

/**
 * @typedef {Object} ClockState
 * @property {number} whiteTimeLeft  - Giây còn lại phe Trắng
 * @property {number} blackTimeLeft  - Giây còn lại phe Đen
 * @property {'white'|'black'|null} activeSide - Bên đang chạy
 * @property {number|null} intervalId   - setInterval ID
 * @property {number|null} lastTick      - Timestamp tick cuối
 * @property {function} timeoutCallback  - Gọi khi hết giờ (roomId, side)
 */

/**
 * Parse time control string like "15+0" into { initial, increment }.
 */
function parseTimeControl(tc) {
    if (typeof tc === 'object') return tc; // already parsed
    const match = tc.match(/^(\d+)\+(\d+)$/);
    if (!match) return { initial: 900, increment: 0 }; // default 15+0
    return {
        initial: parseInt(match[1], 10) * 60,
        increment: parseInt(match[2], 10),
    };
}

/**
 * Initialize clock for a room.
 */
function initClock(roomId, timeControl) {
    const tc = parseTimeControl(timeControl);
    clocks.set(roomId, {
        whiteTimeLeft: tc.initial,
        blackTimeLeft: tc.initial,
        activeSide: null,
        intervalId: null,
        lastTick: null,
        timeoutCallback: null,
    });
    console.log(`[Clock] Initialized ${roomId}: ${tc.initial}s / +${tc.increment}`);
}

/**
 * Set callback to call when a player's clock runs out.
 */
function setTimeoutCallback(roomId, callback) {
    const clock = clocks.get(roomId);
    if (!clock) return;
    clock.timeoutCallback = callback;
}

/**
 * Start the clock. Side parameter: which side's clock starts first.
 */
function startClock(roomId, side = 'white') {
    const clock = clocks.get(roomId);
    if (!clock) return;

    clock.activeSide = side;
    clock.lastTick = Date.now();

    if (clock.intervalId) clearInterval(clock.intervalId);

    clock.intervalId = setInterval(() => {
        tickClock(roomId);
    }, 1000);

    console.log(`[Clock] ${roomId} started, active: ${side}`);
}

/**
 * Internal tick — decrements the active side's clock by 1 second.
 */
function tickClock(roomId) {
    const clock = clocks.get(roomId);
    if (!clock || !clock.activeSide) return;

    const now = Date.now();
    const elapsed = (now - (clock.lastTick || now)) / 1000;
    clock.lastTick = now;

    // Decrement by elapsed seconds
    const decrement = elapsed;
    if (decrement <= 0) return;

    if (clock.activeSide === 'white') {
        clock.whiteTimeLeft = Math.max(0, clock.whiteTimeLeft - decrement);
        if (clock.whiteTimeLeft === 0) {
            stopClock(roomId);
            console.log(`[Clock] ${roomId} white timeout`);
            if (clock.timeoutCallback) clock.timeoutCallback(roomId, 'white');
        }
    } else {
        clock.blackTimeLeft = Math.max(0, clock.blackTimeLeft - decrement);
        if (clock.blackTimeLeft === 0) {
            stopClock(roomId);
            console.log(`[Clock] ${roomId} black timeout`);
            if (clock.timeoutCallback) clock.timeoutCallback(roomId, 'black');
        }
    }
}

/**
 * Pause the clock for a specific side.
 * If that side is the active side, it also switches the clock to the opponent.
 */
function pauseClock(roomId, side) {
    const clock = clocks.get(roomId);
    if (!clock) return;

    // If the pausing side is the active side, switch to opponent
    if (clock.activeSide === side) {
        switchClockInternal(clock);
    }

    console.log(`[Clock] ${roomId} paused for ${side}`);
}

/**
 * Resume the clock for a specific side.
 */
function resumeClock(roomId, side) {
    const clock = clocks.get(roomId);
    if (!clock) return;

    // Resume: set this side as active and restart interval
    if (!clock.intervalId) {
        clock.lastTick = Date.now();
        clock.intervalId = setInterval(() => {
            tickClock(roomId);
        }, 1000);
    }
    clock.activeSide = side;
    console.log(`[Clock] ${roomId} resumed for ${side}`);
}

/**
 * Pause both sides (when both disconnect).
 */
function pauseAllClock(roomId) {
    const clock = clocks.get(roomId);
    if (!clock) return;
    if (clock.intervalId) {
        clearInterval(clock.intervalId);
        clock.intervalId = null;
    }
    clock.activeSide = null;
    console.log(`[Clock] ${roomId} all paused`);
}

/**
 * Switch clock to opponent side. Records time spent.
 * @returns {{ timeSpent: number }}
 */
function switchClock(roomId) {
    const clock = clocks.get(roomId);
    if (!clock) return { timeSpent: 0 };

    const now = Date.now();
    const elapsed = (now - (clock.lastTick || now)) / 1000;
    const timeSpent = elapsed;

    if (clock.activeSide === 'white') {
        clock.whiteTimeLeft = Math.max(0, clock.whiteTimeLeft - elapsed);
        clock.activeSide = 'black';
    } else {
        clock.blackTimeLeft = Math.max(0, clock.blackTimeLeft - elapsed);
        clock.activeSide = 'white';
    }
    clock.lastTick = now;

    console.log(`[Clock] ${roomId} switched to ${clock.activeSide}, spent ${timeSpent}s`);
    return { timeSpent };
}

/**
 * Internal switch without returning time spent.
 */
function switchClockInternal(clock) {
    if (clock.activeSide === 'white') {
        clock.activeSide = 'black';
    } else {
        clock.activeSide = 'white';
    }
    clock.lastTick = Date.now();
}

/**
 * Get current times.
 */
function getTimes(roomId) {
    const clock = clocks.get(roomId);
    if (!clock) return { whiteTime: 0, blackTime: 0 };
    return {
        whiteTime: clock.whiteTimeLeft,
        blackTime: clock.blackTimeLeft,
    };
}

/**
 * Get active side.
 */
function getActiveSide(roomId) {
    const clock = clocks.get(roomId);
    return clock ? clock.activeSide : null;
}

/**
 * Stop and clean up clock.
 */
function stopClock(roomId) {
    const clock = clocks.get(roomId);
    if (!clock) return;
    if (clock.intervalId) {
        clearInterval(clock.intervalId);
        clock.intervalId = null;
    }
    clock.activeSide = null;
    console.log(`[Clock] ${roomId} stopped`);
}

/**
 * Reset clock to initial time.
 */
function resetClock(roomId) {
    const clock = clocks.get(roomId);
    if (!clock) return;
    if (clock.intervalId) {
        clearInterval(clock.intervalId);
        clock.intervalId = null;
    }
    clock.whiteTimeLeft = clock.whiteTimeLeft; // keep current values, will be set by roomManager
    clock.blackTimeLeft = clock.blackTimeLeft;
    clock.activeSide = null;
    console.log(`[Clock] ${roomId} reset`);
}

/**
 * Set specific times (used for reset).
 */
function setTimes(roomId, whiteTime, blackTime) {
    const clock = clocks.get(roomId);
    if (!clock) return;
    clock.whiteTimeLeft = whiteTime;
    clock.blackTimeLeft = blackTime;
}

/**
 * Delete clock state.
 */
function deleteClock(roomId) {
    const clock = clocks.get(roomId);
    if (clock && clock.intervalId) {
        clearInterval(clock.intervalId);
    }
    clocks.delete(roomId);
}

module.exports = {
    initClock,
    setTimeoutCallback,
    startClock,
    pauseClock,
    resumeClock,
    pauseAllClock,
    switchClock,
    getTimes,
    getActiveSide,
    stopClock,
    resetClock,
    setTimes,
    deleteClock,
    parseTimeControl,
};
