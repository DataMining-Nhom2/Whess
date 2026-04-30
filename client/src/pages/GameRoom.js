import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';
import {
    Box, Typography, Paper, Stack, Button, Chip,
} from '@mui/material';
import socket from '../socket';
import PlayerCard from '../components/PlayerCard';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

function getCheckSquareStyles(fen) {
    const chess = new Chess(fen);
    if (!chess.inCheck()) return {};

    const turn = chess.turn(); // side in check
    let kingSquare = null;

    // Find king position
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
        for (let f = 0; f < 8; f++) {
            const piece = board[r][f];
            if (piece && piece.type === 'k' && piece.color === turn) {
                kingSquare = FILES[f] + RANKS[r];
                break;
            }
        }
        if (kingSquare) break;
    }

    if (!kingSquare) return {};

    return {
        [kingSquare]: { backgroundColor: 'rgba(255, 0, 0, 0.4)' },
    };
}

export default function GameRoom() {
    const { roomId } = useParams();
    const navigate = useNavigate();

    // ─── State ──────────────────────────────────────────────────────
    const [color, setColor] = useState(null);           // 'white' | 'black'
    const [whiteTime, setWhiteTime] = useState(900);
    const [blackTime, setBlackTime] = useState(900);
    const [activeSide, setActiveSide] = useState('white');
    // eslint-disable-next-line no-unused-vars
    const [sessionToken, setSessionToken] = useState(null);
    const [status, setStatus] = useState('loading');    // 'loading' | 'waiting' | 'playing'
    const [fen, setFen] = useState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    const [moves, setMoves] = useState([]);
    const [myTurn, setMyTurn] = useState(false);
    const [inCheck, setInCheck] = useState(false);
    const [opponentDisconnected, setOpponentDisconnected] = useState(false);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiData, setAiData] = useState(null);
    const [aiError, setAiError] = useState(null);
    const [gameOverData, setGameOverData] = useState(null);
    const [reconnecting, setReconnecting] = useState(false);

    const chessRef = useRef(new Chess());
    const movesEndRef = useRef(null);
    const handleReconnectedRef = useRef(null);
    const joinRoomActiveRef = useRef(false);

    // Keep refs in sync
    handleReconnectedRef.current = handleReconnected;

    // ─── Persistent socket listeners (join_result, room_created) ──────────────────
    useEffect(() => {
        socket.on('room_created', ({ roomId: newId }) => {
            if (joinRoomActiveRef.current) {
                joinRoomActiveRef.current = false;
                navigate(`/room/${newId}`, { replace: true });
            }
        });

        socket.on('join_result', (res) => {
            if (!joinRoomActiveRef.current) return;
            if (res.error) {
                if (res.error.code === 'ROOM_NOT_FOUND') {
                    // Room doesn't exist — create it. Do NOT clear the ref yet;
                    // the 'room_created' listener will handle the redirect.
                    socket.emit('create_room');
                } else {
                    // Other errors → go back to lobby
                    joinRoomActiveRef.current = false;
                    navigate('/');
                }
            } else {
                joinRoomActiveRef.current = false;
                handleJoined(res);
            }
        });

        socket.on('reconnected', (res) => {
            handleReconnectedRef.current(res);
        });

        return () => {
            socket.off('room_created');
            socket.off('join_result');
            socket.off('reconnected');
        };
    }, [navigate]);

    // ─── Local clock interpolation ──────────────────────────────────
    useEffect(() => {
        if (status !== 'playing' || opponentDisconnected || !activeSide) return;
        const interval = setInterval(() => {
            if (activeSide === 'white') {
                setWhiteTime((t) => Math.max(0, t - 1));
            } else {
                setBlackTime((t) => Math.max(0, t - 1));
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [status, opponentDisconnected, activeSide]);

    // ─── Join room on mount ──────────────────────────────────────────
    useEffect(() => {
        // Check for existing session
        const savedToken = localStorage.getItem('chess_session_token');
        const savedRoom = localStorage.getItem('chess_session_room');

        if (savedToken && savedRoom === roomId) {
            // Attempt reconnect
            setReconnecting(true);
            socket.emit('reconnect', { roomId, sessionToken: savedToken });
            socket.once('reconnect_result', (res) => {
                setReconnecting(false);
                if (res.success) {
                    handleReconnected(res);
                } else {
                    localStorage.removeItem('chess_session_token');
                    localStorage.removeItem('chess_session_room');
                    joinRoom();
                }
            });
        } else {
            joinRoom();
        }
    }, [roomId]); // eslint-disable-line

    function joinRoom() {
        joinRoomActiveRef.current = true;
        socket.emit('join_room', { roomId });
    }

    function handleJoined(res) {
        setColor(res.color);
        setSessionToken(res.sessionToken);
        localStorage.setItem('chess_session_token', res.sessionToken);
        localStorage.setItem('chess_session_room', roomId);

        chessRef.current.load(res.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
        setFen(res.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
        setMoves(res.moves || []);
        setStatus(res.status === 'playing' ? 'playing' : 'waiting');
    }

    function handleReconnected(res) {
        setColor(res.color);
        setSessionToken(res.sessionToken);
        localStorage.setItem('chess_session_token', res.sessionToken);
        localStorage.setItem('chess_session_room', roomId);

        chessRef.current.load(res.fen);
        setFen(res.fen);
        setMoves(res.moves || []);
        setWhiteTime(res.whiteTime || 900);
        setBlackTime(res.blackTime || 900);
        setActiveSide(res.activeSide || 'white');
        setStatus('playing');
        setOpponentDisconnected(false);
    }

    useEffect(() => {
        if (!fen) return;
        const chess = new Chess(fen);
        const turn = chess.turn();
        setMyTurn((color === 'white' && turn === 'w') || (color === 'black' && turn === 'b'));
        setInCheck(chess.inCheck());
    }, [color, fen]);

    // ─── Socket events ─────────────────────────────────────────────
    useEffect(() => {
        socket.on('opponent_joined', () => {
            setStatus('playing');
        });

        socket.on('clock_update', ({ whiteTime: wt, blackTime: bt, activeSide: as }) => {
            setWhiteTime(wt);
            setBlackTime(bt);
            setActiveSide(as);
        });

        socket.on('move_made', ({ san, fen: newFen }) => {
            chessRef.current.load(newFen);
            setFen(newFen);
            setMoves((prev) => [...prev, san]);
            // Scroll move history
            setTimeout(() => {
                movesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }, 50);
        });

        socket.on('game_over', ({ result, reason }) => {
            setGameOverData({ result, reason });
        });

        socket.on('ai_loading', () => {
            setAiLoading(true);
        });

        socket.on('ai_result', (data) => {
            setAiLoading(false);
            setAiData(data);
        });

        socket.on('ai_error', ({ message }) => {
            setAiLoading(false);
            setAiError(message);
        });

        socket.on('opponent_disconnected', () => {
            setOpponentDisconnected(true);
        });

        socket.on('opponent_reconnected', () => {
            setOpponentDisconnected(false);
        });

        socket.on('opponent_left', () => {
            setOpponentDisconnected(true);
        });

        socket.on('reset_game', ({ fen: newFen, whiteTime: wt, blackTime: bt, activeSide: as }) => {
            chessRef.current.load(newFen);
            setFen(newFen);
            setMoves([]);
            setWhiteTime(wt);
            setBlackTime(bt);
            setActiveSide(as);
            setGameOverData(null);
            setAiData(null);
            setAiError(null);
            setAiLoading(false);
            setStatus('playing');
        });

        socket.on('reconnected', (res) => {
            handleReconnected(res);
        });

        // Socket.IO reconnect attempts
        socket.io.on('reconnect_attempt', () => {
            setReconnecting(true);
        });
        socket.io.on('reconnect', () => {
            setReconnecting(false);
            // Attempt to restore session
            const savedToken = localStorage.getItem('chess_session_token');
            if (savedToken) {
                socket.emit('reconnect', { roomId, sessionToken: savedToken }, (res) => {
                    if (res.success) {
                        handleReconnected(res);
                    }
                });
            }
        });

        return () => {
            socket.off('opponent_joined');
            socket.off('move_made');
            socket.off('game_over');
            socket.off('ai_loading');
            socket.off('ai_result');
            socket.off('ai_error');
            socket.off('opponent_disconnected');
            socket.off('opponent_reconnected');
            socket.off('opponent_left');
            socket.off('reset_game');
            socket.off('reconnected');
            socket.off('clock_update');
            socket.io.off('reconnect_attempt');
            socket.io.off('reconnect');
        };
    }, [handleReconnectedRef, roomId]);

    // ─── Make a move ───────────────────────────────────────────────
    const onPieceDrop = useCallback((sourceSquare, targetSquare) => {
        if (status !== 'playing') return false;
        if (!myTurn) return false;

        // Auto-promote to queen
        const move = chessRef.current.move({
            from: sourceSquare,
            to: targetSquare,
            promotion: 'q',
        });

        if (!move) return false;

        const newFen = chessRef.current.fen();
        setFen(newFen);
        setMoves((prev) => [...prev, move.san]);

        socket.emit('make_move', {
            room: roomId,
            move: move.from + move.to + (move.promotion || ''),
            san: move.san,
            fen: newFen,
        });

        return true;
    }, [status, myTurn, roomId]); // eslint-disable-line

    // ─── Handlers ───────────────────────────────────────────────────
    const handleResign = () => {
        socket.emit('resign');
    };

    const handleExitRoom = () => {
        localStorage.removeItem('chess_session_token');
        localStorage.removeItem('chess_session_room');
        socket.emit('exit_room');
        navigate('/');
    };

    const handlePlayAgain = () => {
        socket.emit('play_again');
    };

    // ─── Helpers ─────────────────────────────────────────────────────
    const orientation = color === 'black' ? 'black' : 'white';
    const opponentColor = color === 'white' ? 'black' : 'white';
    const myTime = color === 'white' ? whiteTime : blackTime;
    const opponentTime = color === 'white' ? blackTime : whiteTime;

    const resultLabel = gameOverData ? {
        '1-0': color === 'white' ? 'Bạn Thắng!' : 'Bạn Thua!',
        '0-1': color === 'black' ? 'Bạn Thắng!' : 'Bạn Thua!',
        '1/2-1/2': 'Hòa!',
    }[gameOverData.result] : null;

    const resultReasonLabel = {
        checkmate: 'Chiếu bí',
        timeout: 'Hết giờ',
        resign: 'Đối thủ xin thua',
        stalemate: 'Pat',
    }[gameOverData?.reason] || '';

    const squareStyles = useMemo(() => inCheck ? getCheckSquareStyles(fen) : {}, [inCheck, fen]);
    const boardStyle = useMemo(() => ({ borderRadius: '4px' }), []);

    // ─── Render ─────────────────────────────────────────────────────

    if (status === 'loading' || reconnecting) {
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a2e' }}>
                <Typography sx={{ color: '#aaa', mb: 2 }}>
                    {reconnecting ? 'Đang kết nối lại...' : 'Đang kết nối...'}
                </Typography>
            </Box>
        );
    }

    if (status === 'waiting') {
        const shareLink = `${window.location.origin}/room/${roomId}`;
        return (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1a1a2e' }}>
                <Paper sx={{ p: 4, textAlign: 'center', minWidth: 400, background: '#16213e' }}>
                    <Typography variant="h5" sx={{ mb: 1, color: '#eee' }}>
                        Phòng: <strong>{roomId}</strong>
                    </Typography>
                    <Chip
                        label={color === 'white' ? 'Trắng ♔' : 'Đen ♚'}
                        sx={{ mb: 2, background: color === 'white' ? '#f5f5f5' : '#333', color: color === 'white' ? '#000' : '#fff' }}
                    />
                    <Typography sx={{ mb: 1, color: '#aaa' }}>
                        Đang chờ đối thủ...
                    </Typography>
                    <Button
                        variant="outlined"
                        onClick={() => navigator.clipboard.writeText(shareLink)}
                        sx={{ mb: 1 }}
                    >
                        Copy Link Mời
                    </Button>
                    <Typography variant="body2" sx={{ color: '#666', mb: 2 }}>
                        Mã phòng: <strong>{roomId}</strong>
                    </Typography>
                    <Button
                        color="error"
                        size="small"
                        onClick={handleExitRoom}
                    >
                        Thoát Phòng
                    </Button>
                </Paper>
            </Box>
        );
    }

    return (
        <Box sx={{ background: '#1a1a2e', minHeight: '100vh', p: 2 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 2, gap: 2 }}>
                <Typography variant="h6" sx={{ color: '#eee' }}>
                    Phòng: <strong>{roomId}</strong>
                </Typography>
                <Chip
                    label={color === 'white' ? 'Trắng ♔' : 'Đen ♚'}
                    size="small"
                    sx={{ background: color === 'white' ? '#f5f5f5' : '#333', color: color === 'white' ? '#000' : '#fff' }}
                />
                {opponentDisconnected && (
                    <Chip label="Đối thủ disconnect" color="warning" size="small" />
                )}
                {myTurn && status === 'playing' && (
                    <Chip label="Lượt của bạn" color="success" size="small" />
                )}
            </Box>

            {/* Opponent Disconnected Banner */}
            {opponentDisconnected && (
                <Box sx={{ textAlign: 'center', mb: 2 }}>
                    <Typography sx={{ color: '#ff9800', fontWeight: 'bold' }}>
                        ⚠ Đối thủ đã disconnect. Clock đang tạm dừng.
                    </Typography>
                </Box>
            )}

            {/* AI Loading Overlay */}
            {aiLoading && (
                <Box sx={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 999
                }}>
                    <Typography sx={{ color: '#fff', fontSize: '1.2rem', mb: 2 }}>
                        Đang phân tích ELO bằng AI...
                    </Typography>
                </Box>
            )}

            {/* Result Modal */}
            {(gameOverData || aiData || aiError) && (
                <Box sx={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <Paper sx={{ p: 4, maxWidth: 500, width: '100%', mx: 2, textAlign: 'center' }}>
                        <Typography variant="h4" sx={{ mb: 1 }}>
                            {resultLabel}
                        </Typography>
                        {resultReasonLabel && (
                            <Typography sx={{ color: '#888', mb: 3 }}>
                                {resultReasonLabel}
                            </Typography>
                        )}

                        {aiData ? (
                            <>
                                {/* ELO Display */}
                                <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mb: 3 }}>
                                    <Box sx={{ textAlign: 'center' }}>
                                        <Typography variant="caption" sx={{ color: '#aaa' }}>Trắng ELO</Typography>
                                        <Typography variant="h3">{aiData.white_elo}</Typography>
                                    </Box>
                                    <Box sx={{ textAlign: 'center' }}>
                                        <Typography variant="caption" sx={{ color: '#aaa' }}>Đen ELO</Typography>
                                        <Typography variant="h3">{aiData.black_elo}</Typography>
                                    </Box>
                                </Box>

                                {/* Stats */}
                                {aiData.eco && (
                                    <Typography sx={{ mb: 1 }}>
                                        Khai cuộc: <strong>{aiData.eco.code} — {aiData.eco.name}</strong>
                                    </Typography>
                                )}
                                {aiData.stats && (
                                    <Typography sx={{ mb: 1 }}>
                                        CPL Trắng: {aiData.stats.white_avg_cpl} | CPL Đen: {aiData.stats.black_avg_cpl}
                                    </Typography>
                                )}
                                {aiData.stats && (
                                    <Typography sx={{ mb: 2 }}>
                                        Blunders: Trắng {aiData.stats.white_blunders} | Đen {aiData.stats.black_blunders}
                                    </Typography>
                                )}

                                {/* Explanation */}
                                {aiData.explanation && (
                                    <Paper sx={{ p: 2, textAlign: 'left', mb: 2, background: '#f5f5f5', maxHeight: 150, overflowY: 'auto' }}>
                                        <Typography variant="body2">
                                            🤖 <strong>AI Nhận xét:</strong><br />
                                            {aiData.explanation}
                                        </Typography>
                                    </Paper>
                                )}
                            </>
                        ) : aiError ? (
                            <Box sx={{ mb: 2 }}>
                                <Typography sx={{ color: '#f44336', mb: 1 }}>
                                    ⚠ {aiError}
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#888' }}>
                                    Kết quả: {resultLabel} ({resultReasonLabel})
                                </Typography>
                            </Box>
                        ) : null}

                        <Button variant="contained" onClick={handlePlayAgain} sx={{ mt: 2 }}>
                            Chơi Lại
                        </Button>
                    </Paper>
                </Box>
            )}

            {/* Game Layout */}
            <Box sx={{ display: 'flex', justifyContent: 'center', gap: 4, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                
                {/* Left Column: Board and Player Cards */}
                <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                    {/* Opponent Card (Top) */}
                    <PlayerCard
                        name="Đối thủ"
                        time={opponentTime}
                        isActive={activeSide === opponentColor}
                        color={opponentColor}
                        isPaused={opponentDisconnected && activeSide !== opponentColor}
                    />

                    {/* Chess Board */}
                    <Box sx={{ my: 0.5 }}>
                        <Chessboard
                            boardWidth={480}
                            position={fen}
                            onPieceDrop={onPieceDrop}
                            boardOrientation={orientation}
                            customBoardStyle={boardStyle}
                            customSquareStyles={squareStyles}
                        />
                    </Box>

                    {/* My Card (Bottom) */}
                    <PlayerCard
                        name="Bạn"
                        time={myTime}
                        isActive={activeSide === color}
                        color={color}
                        isPaused={opponentDisconnected && activeSide !== color}
                    />
                </Box>

                {/* Right Column: Side Panel */}
                <Box sx={{ width: 300, display: 'flex', flexDirection: 'column' }}>
                    {/* Move History */}
                    <Paper sx={{ p: 2, mb: 2, background: '#16213e', height: 440, overflowY: 'auto' }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, color: '#aaa' }}>
                            Lịch sử nước đi
                        </Typography>
                        {moves.length === 0 ? (
                            <Typography variant="body2" sx={{ color: '#555' }}>
                                Chưa có nước đi
                            </Typography>
                        ) : (
                            <Box>
                                {Array.from({ length: Math.ceil(moves.length / 2) }).map((_, i) => (
                                    <Box key={i} sx={{ display: 'flex', gap: 1, mb: 0.5, p: 0.5, borderRadius: 1, '&:hover': { background: '#1a2942' } }}>
                                        <Typography variant="body2" sx={{ color: '#555', width: 24 }}>
                                            {i + 1}.
                                        </Typography>
                                        <Typography variant="body2" sx={{ fontFamily: 'monospace', width: 80, fontWeight: 'bold' }}>
                                            {moves[i * 2] || ''}
                                        </Typography>
                                        <Typography variant="body2" sx={{ fontFamily: 'monospace', width: 80, fontWeight: 'bold' }}>
                                            {moves[i * 2 + 1] || ''}
                                        </Typography>
                                    </Box>
                                ))}
                                <div ref={movesEndRef} />
                            </Box>
                        )}
                    </Paper>

                    {/* Action Buttons */}
                    <Stack spacing={2} direction="row">
                        <Button variant="outlined" color="error" onClick={handleResign} fullWidth>
                            Xin Thua
                        </Button>
                        <Button variant="outlined" color="inherit" onClick={handleExitRoom} fullWidth>
                            Thoát Phòng
                        </Button>
                    </Stack>
                </Box>
            </Box>
        </Box>
    );
}
