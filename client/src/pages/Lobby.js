import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Button, TextField, Typography, Paper,
    Stack, Alert, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import socket from '../socket';

export default function Lobby() {
    const navigate = useNavigate();
    const [roomInput, setRoomInput] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [durationMinutes, setDurationMinutes] = useState(15);

    const roomInputRef = useRef('');
    const createRoomActiveRef = useRef(false);

    // ─── Persistent socket listeners ─────────────────────────────────────────────
    useEffect(() => {
        socket.on('room_created', ({ roomId }) => {
            if (createRoomActiveRef.current) {
                createRoomActiveRef.current = false;
                navigate(`/room/${roomId}`);
            }
        });

        socket.on('join_result', (res) => {
            setLoading(false);
            if (res.error) {
                setError(res.error.message || 'Không thể vào phòng');
            } else {
                navigate(`/room/${roomInputRef.current}`);
            }
        });

        return () => {
            socket.off('room_created');
            socket.off('join_result');
        };
    }, [navigate]);

    const handleCreateRoom = () => {
        setLoading(true);
        createRoomActiveRef.current = true;
        socket.emit('create_room', { durationMinutes });
    };

    const handleJoinRoom = () => {
        if (!roomInput.trim()) return;
        roomInputRef.current = roomInput.trim();
        setLoading(true);
        setError('');
        socket.emit('join_room', { roomId: roomInput.trim() });
    };

    const handleInputChange = (e) => {
        setRoomInput(e.target.value);
        roomInputRef.current = e.target.value;
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
                    <FormControl fullWidth>
                        <InputLabel id="time-control-label">Thời gian thi đấu</InputLabel>
                        <Select
                            labelId="time-control-label"
                            value={durationMinutes}
                            label="Thời gian thi đấu"
                            onChange={(e) => setDurationMinutes(e.target.value)}
                            disabled={loading}
                            sx={{ textAlign: 'left' }}
                        >
                            <MenuItem value={3}>3 phút</MenuItem>
                            <MenuItem value={5}>5 phút</MenuItem>
                            <MenuItem value={10}>10 phút</MenuItem>
                            <MenuItem value={15}>15 phút</MenuItem>
                            <MenuItem value={30}>30 phút</MenuItem>
                        </Select>
                    </FormControl>

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
                            handleInputChange(e);
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
