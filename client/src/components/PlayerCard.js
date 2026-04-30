import { Box, Typography, Avatar, Paper } from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';

function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
}

export default function PlayerCard({ name, time, isActive, color, isPaused }) {
    const clockColor = isActive ? '#ff9800' : isPaused ? '#888' : '#e0e0e0';
    const isWhite = color === 'white';

    return (
        <Paper sx={{
            p: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: isActive ? '#1a2942' : '#16213e',
            borderRadius: 1,
            mb: 1,
            mt: 1,
            borderLeft: isActive ? '4px solid #ff9800' : '4px solid transparent',
            transition: 'all 0.2s',
            width: 480, // Match the board width
            boxSizing: 'border-box'
        }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ bgcolor: isWhite ? '#e0e0e0' : '#424242', color: isWhite ? '#424242' : '#e0e0e0', width: 40, height: 40 }}>
                    <PersonIcon />
                </Avatar>
                <Box>
                    <Typography variant="subtitle1" sx={{ color: '#eee', fontWeight: 'bold', lineHeight: 1.2 }}>
                        {name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#aaa' }}>
                        {isWhite ? 'Trắng' : 'Đen'}
                    </Typography>
                </Box>
            </Box>

            <Box sx={{
                background: isActive ? '#251b12' : '#111827',
                px: 2,
                py: 0.5,
                borderRadius: 1,
                minWidth: 90,
                textAlign: 'center',
                boxShadow: 'inset 0 0 5px rgba(0,0,0,0.5)'
            }}>
                <Typography
                    variant="h5"
                    sx={{
                        fontFamily: 'monospace',
                        color: clockColor,
                        fontWeight: 'bold',
                        lineHeight: 1.2
                    }}
                >
                    {formatTime(time)}
                </Typography>
                {isActive && <Typography variant="caption" sx={{ color: '#ff9800', display: 'block', fontSize: '0.65rem' }}>Đang chạy</Typography>}
            </Box>
        </Paper>
    );
}
