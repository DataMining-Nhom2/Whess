import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Button, TextField, Typography, Paper,
    Stack, Alert
} from '@mui/material';
import socket from '../socket';

export default function Lobby() {
    const navigate = useNavigate();
    const [roomInput, setRoomInput] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleCreateRoom = () => {
        setLoading(true);
        socket.emit('create_room', ({ roomId }) => {
            navigate(`/room/${roomId}`);
        });
    };

    const handleJoinRoom = () => {
        if (!roomInput.trim()) return;
        setLoading(true);
        setError('');
        socket.emit('join_room', { roomId: roomInput.trim() }, (res) => {
            setLoading(false);
            if (res.error) {
                setError(res.message || 'Không thể vào phòng');
            } else {
                navigate(`/room/${roomInput.trim()}`);
            }
        });
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#1a1a2e',
            }}
        >
            <Paper sx={{ p: 4, minWidth: 360, textAlign: 'center' }}>
                <Typography variant="h3" sx={{ mb: 4, color: '#eee', fontWeight: 'bold' }}>
                    Chess Realm
                </Typography>

                <Stack spacing={2}>
                    <Button
                        variant="contained"
                        size="large"
                        onClick={handleCreateRoom}
                        disabled={loading}
                        sx={{ py: 1.5, fontSize: '1.1rem' }}
                    >
                        Tạo Phòng Mới
                    </Button>

                    <Typography variant="body2" sx={{ color: '#888' }}>
                        — hoặc —
                    </Typography>

                    <TextField
                        label="Nhập mã phòng"
                        value={roomInput}
                        onChange={(e) => {
                            setRoomInput(e.target.value);
                            setError('');
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                        fullWidth
                        disabled={loading}
                    />

                    {error && <Alert severity="error" sx={{ textAlign: 'left' }}>{error}</Alert>}

                    <Button
                        variant="outlined"
                        onClick={handleJoinRoom}
                        disabled={loading || !roomInput.trim()}
                    >
                        Vào Phòng
                    </Button>
                </Stack>
            </Paper>
        </Box>
    );
}
