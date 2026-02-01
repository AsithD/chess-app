import { useState, useEffect, useCallback, useRef } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import Chat from "./Chat";
import { aiMove } from "js-chess-engine";
import { db } from "../utils/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

function Game({ room, socket, orientation, initialData, user }) {
    const [fen, setFen] = useState(() => initialData?.fen || new Chess().fen());
    const [waiting, setWaiting] = useState(() => initialData?.waiting ?? true);
    // Use a ref to keep track of fen without triggering re-renders in effects that only need *current* value
    const fenRef = useRef(fen);

    useEffect(() => {
        fenRef.current = fen;
    }, [fen]);

    useEffect(() => {
        const onReceiveMove = (move) => {
            console.log("Received move:", move);
            setFen((prevFen) => {
                try {
                    const game = new Chess(prevFen);
                    const result = game.move(move);
                    if (result) {
                        return game.fen();
                    }
                } catch (e) {
                    console.error("Invalid move received:", move, e);
                }
                return prevFen;
            });
        };

        const onUserJoined = (id) => {
            console.log("User joined:", id);
            setWaiting(false);
            // Send the current FEN from the ref (most up to date) to ensure sync
            socket.emit("sync_board", { room, fen: fenRef.current });
        };

        const onSetBoard = (newFen) => {
            console.log("Syncing board to:", newFen);
            setFen(newFen);
            setWaiting(false);
        };

        const onGameStart = ({ fen: startFen, players }) => {
            if (startFen) setFen(startFen);
            if (players && players.length >= 2) setWaiting(false);
        };

        socket.on("receive_move", onReceiveMove);
        socket.on("user_joined", onUserJoined);
        socket.on("set_board", onSetBoard);
        socket.on("game_start", onGameStart);

        return () => {
            socket.off("receive_move", onReceiveMove);
            socket.off("user_joined", onUserJoined);
            socket.off("set_board", onSetBoard);
            socket.off("game_start", onGameStart);
        };
    }, [socket, room]);

    function onDrop(sourceSquare, targetSquare, piece) {
        if (waiting) return false; // Don't allow moves if waiting for opponent

        try {
            const game = new Chess(fen);
            let result = null;

            try {
                // Validate turn logic
                if (game.turn() === 'w' && orientation === 'black') return false;
                if (game.turn() === 'b' && orientation === 'white') return false;

                // Try simple move
                const moveConfig = { from: sourceSquare, to: targetSquare };
                result = game.move(moveConfig);
            } catch (e) {
                // If failed, try with promotion
                try {
                    const promotionConfig = { from: sourceSquare, to: targetSquare, promotion: 'q' };
                    result = game.move(promotionConfig);
                } catch (e2) {
                    return false;
                }
            }

            if (result) {
                const newFen = game.fen();
                setFen(newFen);
                socket.emit("send_move", {
                    move: {
                        from: result.from,
                        to: result.to,
                        promotion: result.promotion
                    },
                    newFen, // Sync FEN with server
                    room
                });
                return true;
            }
        } catch (error) {
            console.error("Critical onDrop error:", error);
            return false;
        }
        return false;
    }

    const saveMatch = async (resultTitle, resultMessage) => {
        if (!user || user.isGuest) return;
        try {
            await addDoc(collection(db, "matches"), {
                uid: user.uid,
                username: user.name,
                room,
                result: resultTitle,
                message: resultMessage,
                timestamp: serverTimestamp(),
                color: orientation,
                fen: fenRef.current
            });
            console.log("Match saved successfully");
        } catch (e) {
            console.error("Error saving match:", e);
        }
    };

    // Helper to get game status text
    const getGameStatus = () => {
        try {
            const game = new Chess(fen);
            if (game.isCheckmate()) {
                const winner = game.turn() === 'w' ? 'Black' : 'White';
                if (!gameResult) {
                    const title = winner === orientation.charAt(0).toUpperCase() + orientation.slice(1) ? "You Won!" : "You Lost!";
                    setGameResult({ title, message: `Checkmate by ${winner}` });
                    saveMatch(title, `Checkmate by ${winner}`);
                }
                return "Checkmate!";
            }
            if (game.isDraw()) {
                if (!gameResult) {
                    setGameResult({ title: "Draw", message: "Game drawn." });
                    saveMatch("Draw", "Game drawn.");
                }
                return "Draw";
            }
            return game.turn() === 'w' ? "White's Turn" : "Black's Turn";
        } catch (e) {
            return "Start Game";
        }
    };

    const [gameResult, setGameResult] = useState(null); // { title, message }
    const [godMode, setGodMode] = useState(false);
    const [bestMoveHint, setBestMoveHint] = useState(null);

    // Calculate best move when FEN changes if God Mode is active and it's my turn
    useEffect(() => {
        if (!godMode) return;

        try {
            const game = new Chess(fen);
            if (game.turn() === orientation[0]) {
                // It's my turn, calculate move
                const result = aiMove(fen, 1); // Depth 1 is fast
                // Result format: { "E2": "E4" }
                const from = Object.keys(result)[0];
                const to = result[from];
                setBestMoveHint(`${from} -> ${to}`);
            } else {
                setBestMoveHint(null);
            }
        } catch (e) {
            console.error("Engine error:", e);
        }
    }, [fen, godMode, orientation]);

    // Game Control handlers
    useEffect(() => {
        socket.on("opponent_resigned", () => {
            setGameResult({ title: "You Won!", message: "Opponent resigned." });
            saveMatch("You Won!", "Opponent resigned.");
        });

        socket.on("draw_offered", () => {
            const accept = window.confirm("Opponent offered a draw. Accept?");
            if (accept) {
                socket.emit("draw_response", { room, accepted: true });
            } else {
                socket.emit("draw_response", { room, accepted: false });
            }
        });

        socket.on("draw_rejected", () => {
            alert("Draw offer rejected.");
        });

        socket.on("game_draw", () => {
            setGameResult({ title: "It's a Draw!", message: "Game ended by agreement." });
            saveMatch("It's a Draw!", "Game ended by agreement.");
        });

        socket.on("rematch_requested", () => {
            setGameResult((prev) => ({
                ...prev,
                message: "Opponent wants a rematch!",
                isRematchRequest: true
            }));
        });

        return () => {
            socket.off("opponent_resigned");
            socket.off("draw_offered");
            socket.off("draw_rejected");
            socket.off("game_draw");
            socket.off("rematch_requested");
        };
    }, [socket, room]);

    const handleResign = () => {
        if (window.confirm("Are you sure you want to resign?")) {
            socket.emit("resign", { room });
            setGameResult({ title: "Game Over", message: "You resigned." });
            saveMatch("Game Over", "You resigned.");
        }
    };

    const handleDrawOffer = () => {
        socket.emit("draw_offer", { room });
        alert("Draw offer sent.");
    };

    const handleRematchRequest = () => {
        socket.emit("rematch_request", { room });
        setGameResult((prev) => ({ ...prev, message: "Waiting for opponent..." }));
    };

    const handleRematchAccept = () => {
        socket.emit("rematch_accept", { room });
    };

    return (
        <div className="flex flex-col lg:flex-row items-start justify-center gap-8 w-full max-w-7xl mx-auto p-4">
            <div className="flex flex-col items-center gap-8 w-full max-w-2xl">
                <div className="w-full flex justify-between items-center bg-gray-800 p-4 rounded-xl border border-gray-700 shadow-lg">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                            <h2 className="text-sm font-black text-gray-500 uppercase tracking-widest">Room: <span className="text-blue-400">{room}</span></h2>
                            <h3 className="text-lg font-bold text-white">{user?.name || "Player"} <span className="text-xs text-gray-500 font-normal">({orientation})</span></h3>
                        </div>
                    </div>
                    <div className="text-gray-400 font-semibold">
                        {getGameStatus()}
                    </div>
                </div>

                {godMode && (
                    <div className="w-full flex flex-col gap-2 animate-in fade-in slide-in-from-top-4">
                        {bestMoveHint && (
                            <div className="w-full bg-yellow-900/50 border border-yellow-500 text-yellow-200 px-4 py-2 rounded-lg text-center font-mono font-bold animate-pulse">
                                Best Move: {bestMoveHint}
                            </div>
                        )}
                        <button
                            onClick={() => {
                                setGodMode(false);
                                setBestMoveHint(null);
                            }}
                            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-2 rounded text-xs uppercase tracking-widest transition-colors"
                        >
                            GOD OFF
                        </button>
                    </div>
                )}

                <div className="w-full aspect-square shadow-2xl rounded-lg border-4 border-gray-700 relative">
                    <Chessboard
                        position={fen}
                        onPieceDrop={onDrop}
                        boardOrientation={orientation}
                        customDarkSquareStyle={{ backgroundColor: "#779556" }}
                        customLightSquareStyle={{ backgroundColor: "#ebecd0" }}
                        animationDuration={200}
                    />

                    {/* Waiting Overlay */}
                    {waiting && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-40 rounded-lg animate-in fade-in duration-500">
                            <div className="bg-gray-800 p-6 rounded-2xl border border-gray-700 shadow-2xl flex flex-col items-center gap-4">
                                <div className="flex gap-2">
                                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                    <div className="w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
                                </div>
                                <h3 className="text-xl font-bold text-white uppercase tracking-wider">Waiting for Opponent</h3>
                                <p className="text-gray-400 text-sm">Share room name: <span className="text-blue-400 font-mono font-bold">{room}</span></p>
                            </div>
                        </div>
                    )}

                    {/* Game Over Overlay */}
                    {gameResult && (
                        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 animate-in fade-in duration-300">
                            <h2 className="text-4xl font-bold text-white mb-2">{gameResult.title}</h2>
                            <p className="text-gray-300 text-lg mb-6">{gameResult.message}</p>

                            <div className="flex gap-4">
                                {gameResult.isRematchRequest ? (
                                    <button
                                        onClick={handleRematchAccept}
                                        className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition"
                                    >
                                        Accept Rematch
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleRematchRequest}
                                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
                                    >
                                        Play Again
                                    </button>
                                )}

                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition"
                                >
                                    Leave Room
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex gap-4 w-full">
                    <button
                        onClick={handleResign}
                        className="flex-1 py-3 bg-red-900/50 border border-red-700 text-red-200 hover:bg-red-800/50 rounded-lg font-bold transition"
                    >
                        Resign Flag
                    </button>
                    <button
                        onClick={handleDrawOffer}
                        className="flex-1 py-3 bg-gray-700 border border-gray-600 text-gray-300 hover:bg-gray-600 rounded-lg font-bold transition"
                    >
                        Offer Draw
                    </button>
                </div>
            </div>

            {/* Chat Sidebar */}
            <Chat
                socket={socket}
                room={room}
                orientation={orientation}
                onGodModeActivate={() => setGodMode(true)}
            />
        </div >
    );
}

export default Game;
