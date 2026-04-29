/**
 * GameClock.js — Server-synced chess clock display
 * Props:
 *   whiteTime: number (seconds)
 *   blackTime: number (seconds)
 *   activeSide: 'white' | 'black' | null
 *   myColor: 'white' | 'black'
 *   opponentDisconnected: boolean
 */
import { Box, Typography } from '@mui/material';

function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

function ClockDisplay({ time, isActive, isPaused, isMe }) {
    const color = isActive ? '#ff9800' : isPaused ? '#888' : '#f44336';
    return (
        <Box sx={{
            p: 2,
            borderRadius: 1,
            background: '#16213e',
            border: isMe ? '2px solid #4caf50' : '2px solid transparent',
            minWidth: 120,
            textAlign: 'center',
        }}>
            <Typography variant="caption" sx={{ color: '#888', display: 'block' }}>
                {isMe ? 'Bạn' : 'Doi thu'}
            </Typography>
            <Typography
                variant="h4"
                sx={{
                    fontFamily: 'monospace',
                    color,
                    fontWeight: 'bold',
                    animation: isActive ? 'pulse 1s infinite' : 'none',
                }}
            >
                {formatTime(time)}
            </Typography>
            {isActive && <Typography variant="caption" sx={{ color: '#ff9800' }}>Dang chay</Typography>}
            {isPaused && <Typography variant="caption" sx={{ color: '#888' }}>Tam dung</Typography>}
        </Box>
    );
}

export default function GameClock({ whiteTime, blackTime, activeSide, myColor, opponentDisconnected }) {
    const whiteActive = activeSide === 'white';
    const blackActive = activeSide === 'black';

    const whitePaused = opponentDisconnected && !whiteActive;
    const blackPaused = opponentDisconnected && !blackActive;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <ClockDisplay
                time={blackTime}
                isActive={blackActive}
                isPaused={blackPaused}
                isMe={myColor === 'black'}
            />
            <ClockDisplay
                time={whiteTime}
                isActive={whiteActive}
                isPaused={whitePaused}
                isMe={myColor === 'white'}
            />
        </Box>
    );
}
