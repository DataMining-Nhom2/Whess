/**
 * aiClient.js — HTTP client gọi AI Engine Server
 */
const AI_ENGINE_URL = process.env.AI_ENGINE_URL || 'http://localhost:8000';

const DEFAULT_TIMEOUT = 30000; // 30 seconds

/**
 * Gọi AI Engine để phân tích ván cờ.
 * @param {object} room - Room object với moves, clockTimes, result
 * @returns {Promise<object|null>} AI result hoặc null nếu lỗi
 */
async function requestELOPrediction(room) {
    const { buildPGN } = require('./gameLogic');
    const pgn = buildPGN(room.moves || []);
    const timeControl = `${Math.round((room.timeControl?.initial || 900) / 60)}+${room.timeControl?.increment || 0}`;

    const payload = {
        pgn,
        clock_times: room.clockTimes || [],
        result: room.result || '1/2-1/2',
        time_control: timeControl,
    };

    console.log('[AI] Request:', JSON.stringify(payload));

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

        const response = await fetch(`${AI_ENGINE_URL}/api/predict-elo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const data = await response.json();
        console.log('[AI] Response:', JSON.stringify(data));

        if (data.success && data.data) {
            return data.data;
        } else {
            console.error('[AI] Error from AI Engine:', data.error);
            return null;
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('[AI] Request timeout after', DEFAULT_TIMEOUT, 'ms');
        } else {
            console.error('[AI] Connection failed:', error.message);
        }
        return null;
    }
}

module.exports = {
    requestELOPrediction,
};
