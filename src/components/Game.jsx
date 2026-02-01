import { useState, useEffect, useCallback, useRef } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import Chat from "./Chat";
import { aiMove } from "js-chess-engine";
import { db } from "../utils/firebase";
import { collection, addDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";

function Game({ room, socket, orientation, initialData, user }) {
    const [fen, setFen] = useState(() => initialData?.fen || new Chess().fen());
    const [waiting, setWaiting] = useState(() => initialData?.waiting ?? true);
    const [moveHistory, setMoveHistory] = useState(() => initialData?.moveHistory || [initialData?.fen || new Chess().fen()]);
    const [viewingIndex, setViewingIndex] = useState(initialData?.isReview ? 0 : -1);
    const [evaluations, setEvaluations] = useState(() => initialData?.evaluations || []);
    const moveListRef = useRef(null);

    // Analyze move using js-chess-engine
    const analyzeMove = useCallback((prevFen, currentFen, move) => {
        try {
            // Get best move from engine
            const engineResult = aiMove(prevFen, 1); // Depth 1 for speed
            const bestMoveFrom = Object.keys(engineResult)[0];
            const bestMoveTo = engineResult[bestMoveFrom];

            const userMoveStr = (move.from + move.to).toUpperCase();
            const bestMoveStr = (bestMoveFrom + bestMoveTo).toUpperCase();

            if (userMoveStr === bestMoveStr) return "Best";

            const game = new Chess(prevFen);
            const moveResult = game.move(move);
            if (!moveResult) return "Book";

            // If it captures a major piece but engine wanted something else, maybe just "Good"
            if (moveResult.captured && ['q', 'r'].includes(moveResult.captured)) return "Good";

            // Check for obvious blunders (giving away queen)
            const currentBoard = new Chess(currentFen);
            const turn = currentBoard.turn();
            // If it's now opponent's turn, see if they can take our queen
            const moves = currentBoard.moves({ verbose: true });
            for (const m of moves) {
                if (m.captured === 'q') return "Blunder";
            }

            return "Inaccuracy";
        } catch (e) {
            return "Book";
        }
    }, []);

    const getEvalLabel = (index) => {
        if (index <= 0) return "";
        return evaluations[index - 1] || "Book";
    };

    // Helper to get SAN move notation by diffing FENs
    const getMoveSAN = (prevFen, currFen) => {
        try {
            const game1 = new Chess(prevFen);
            const game2 = new Chess(currFen);
            const moves = game1.moves({ verbose: true });
            for (const move of moves) {
                game1.move(move);
                if (game1.fen() === currFen) return move.san;
                game1.undo();
            }
        } catch (e) {
            return "??";
        }
        return "--";
    };

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
                        const newFen = game.fen();
                        const label = analyzeMove(prevFen, newFen, move);
                        setEvaluations(prev => [...prev, label]);
                        setMoveHistory(prev => [...prev.slice(0, viewingIndex === -1 ? prev.length : viewingIndex + 1), newFen]);
                        return newFen;
                    }
                } catch (e) {
                    console.error("Invalid move received:", move, e);
                }
                return prevFen;
            });
        };

        const onUserJoined = (id) => {
            console.log("Opponent joined:", id);
            setWaiting(false);
            // Host sends full state to joiner
            if (orientation === 'white' || initialData?.waiting) {
                socket.emit("sync_board", {
                    room,
                    fen: fenRef.current,
                    moveHistory: moveHistory,
                    evaluations: evaluations
                });
            }
        };

        const onSetBoard = (data) => {
            // Handle both string FEN (legacy) and object payload
            if (typeof data === 'string') {
                console.log("Board synced (FEN only):", data);
                setFen(data);
                setWaiting(false);
                setMoveHistory([data]);
            } else {
                console.log("Board synced (full state):", data);
                setFen(data.fen);
                setWaiting(false);
                if (data.moveHistory) setMoveHistory(data.moveHistory);
                if (data.evaluations) setEvaluations(data.evaluations);
            }
        };

        socket.on("receive_move", onReceiveMove);
        socket.on("user_joined", onUserJoined);
        socket.on("set_board", onSetBoard);

        return () => {
            socket.off("receive_move", onReceiveMove);
            socket.off("user_joined", onUserJoined);
            socket.off("set_board", onSetBoard);
        };
    }, [socket, room]);

    // Bulk analysis for review mode
    useEffect(() => {
        if (initialData?.isReview && moveHistory.length > 1 && evaluations.length === 0) {
            const evals = [];
            for (let i = 1; i < moveHistory.length; i++) {
                const prev = moveHistory[i - 1];
                const curr = moveHistory[i];
                // In review mode, we don't have the move object easily unless we diff FENs
                // For now, let's just label them as "Analyzed" or a simplified label
                evals.push("Book"); // Placeholder for full diff analysis if needed
            }
            setEvaluations(evals);
        }
    }, [initialData, moveHistory]);

    // Auto-scroll move list
    useEffect(() => {
        if (moveListRef.current) {
            moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
        }
    }, [moveHistory]);

    function onDrop(sourceSquare, targetSquare, piece) {
        if (waiting || initialData?.isReview) return false; // Disable moves in review mode

        try {
            const game = new Chess(fen);
            let result = null;
            let moveConfig = { from: sourceSquare, to: targetSquare };

            try {
                // Validate turn logic
                if (game.turn() === 'w' && orientation === 'black') return false;
                if (game.turn() === 'b' && orientation === 'white') return false;

                // Try simple move
                result = game.move(moveConfig);
            } catch (e) {
                // If failed, try with promotion
                try {
                    moveConfig = { from: sourceSquare, to: targetSquare, promotion: 'q' };
                    result = game.move(moveConfig);
                } catch (e2) {
                    return false;
                }
            }

            if (result) {
                const newFen = game.fen();
                const label = analyzeMove(fen, newFen, moveConfig);
                setEvaluations(prev => [...prev, label]);
                setFen(newFen);
                setMoveHistory(prev => [...prev.slice(0, viewingIndex === -1 ? prev.length : viewingIndex + 1), newFen]);
                socket.emit("send_move", {
                    move: {
                        from: result.from,
                        to: result.to,
                        promotion: result.promotion
                    },
                    fen: newFen,
                    room,
                    label
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

        // Emit to server for Elo calculation if it's a rated match
        const isDraw = resultTitle === "Draw" || resultTitle === "It's a Draw!";
        const winnerUid = resultTitle === "You Won!" ? user.uid : (resultTitle === "You Lost!" ? "opponent" : null);

        socket.emit("match_concluded", {
            room,
            winnerUid,
            isDraw
        });

        try {
            await addDoc(collection(db, "matches"), {
                uid: user.uid,
                username: user.name,
                room,
                result: resultTitle,
                message: resultMessage,
                timestamp: serverTimestamp(),
                color: orientation,
                fen: fenRef.current,
                moveHistory: moveHistory // Full move-by-move FENs
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

        socket.on("rating_update", ({ newRating }) => {
            console.log("Rating Update received:", newRating);
            if (user && !user.isGuest) {
                const userRef = doc(db, "users", user.uid);
                setDoc(userRef, { rating: newRating }, { merge: true })
                    .then(() => console.log("Firestore rating updated!"))
                    .catch(e => console.error("Error updating Firestore rating:", e));
            }
        });

        return () => {
            socket.off("opponent_resigned");
            socket.off("draw_offered");
            socket.off("draw_rejected");
            socket.off("game_draw");
            socket.off("rematch_requested");
            socket.off("rating_update");
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
                        position={viewingIndex === -1 ? fen : moveHistory[viewingIndex]}
                        onPieceDrop={onDrop}
                        boardOrientation={orientation}
                        customDarkSquareStyle={{ backgroundColor: "#779556" }}
                        customLightSquareStyle={{ backgroundColor: "#ebecd0" }}
                        customSquareStyles={{
                            ...(new Chess(viewingIndex === -1 ? fen : moveHistory[viewingIndex]).inCheck() ? {
                                [(() => {
                                    const g = new Chess(viewingIndex === -1 ? fen : moveHistory[viewingIndex]);
                                    const turn = g.turn();
                                    // Find king position
                                    for (let r = 0; r < 8; r++) {
                                        for (let c = 0; c < 8; c++) {
                                            const square = String.fromCharCode(97 + c) + (8 - r);
                                            const piece = g.get(square);
                                            if (piece && piece.type === 'k' && piece.color === turn) return square;
                                        }
                                    }
                                })()]: {
                                    background: "radial-gradient(circle, rgba(255,0,0,0.5) 0%, rgba(255,0,0,0) 70%)",
                                    borderRadius: "50%"
                                }
                            } : {})
                        }}
                        animationDuration={200}
                        areArrowsAllowed={true}
                    />

                    {/* Move Navigation Overlay (Only in Review Mode) */}
                    {initialData?.isReview && moveHistory.length > 1 && (
                        <div className="absolute -bottom-14 left-0 right-0 flex justify-center items-center gap-1 bg-gray-900 border border-gray-700 p-1 rounded-xl shadow-xl z-30">
                            <button
                                onClick={() => setViewingIndex(0)}
                                className="px-3 py-1.5 hover:bg-gray-800 text-gray-400 rounded-lg text-xs font-bold transition"
                                title="Start"
                            >
                                |◀
                            </button>
                            <button
                                onClick={() => setViewingIndex(Math.max(0, (viewingIndex === -1 ? moveHistory.length - 1 : viewingIndex) - 1))}
                                className="px-4 py-1.5 hover:bg-gray-800 text-gray-200 rounded-lg text-sm font-bold transition"
                                title="Previous"
                            >
                                ◀
                            </button>
                            {/* Move Quality Label - Floating above navigation (Only in God Mode or Review) */}
                            {(viewingIndex !== 0) && (godMode || initialData?.isReview) && (
                                <div className={`absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all duration-300 animate-bounce ${getEvalLabel(viewingIndex === -1 ? moveHistory.length - 1 : viewingIndex) === 'Best' ? 'bg-green-500/20 text-green-400 border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.3)]' :
                                    getEvalLabel(viewingIndex === -1 ? moveHistory.length - 1 : viewingIndex) === 'Good' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                        getEvalLabel(viewingIndex === -1 ? moveHistory.length - 1 : viewingIndex) === 'Blunder' ? 'bg-red-500/20 text-red-400 border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.3)]' :
                                            'bg-gray-800 text-gray-500 border-gray-700'
                                    }`}>
                                    {getEvalLabel(viewingIndex === -1 ? moveHistory.length - 1 : viewingIndex)}
                                </div>
                            )}

                            <div className="px-4 text-[10px] font-mono font-black text-blue-400 uppercase tracking-widest">
                                {viewingIndex === -1 ? `LIVE (${moveHistory.length - 1})` : `MOVE ${viewingIndex} / ${moveHistory.length - 1}`}
                            </div>
                            <button
                                onClick={() => {
                                    if (viewingIndex !== -1) {
                                        const next = viewingIndex + 1;
                                        if (next >= moveHistory.length - 1) setViewingIndex(-1);
                                        else setViewingIndex(next);
                                    }
                                }}
                                className="px-4 py-1.5 hover:bg-gray-800 text-gray-200 rounded-lg text-sm font-bold transition"
                                title="Next"
                            >
                                ▶
                            </button>
                            <button
                                onClick={() => setViewingIndex(-1)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${viewingIndex === -1 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'hover:bg-gray-800 text-gray-400'}`}
                                title="Live"
                            >
                                ▶|
                            </button>
                        </div>
                    )}

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
                                <button
                                    onClick={() => window.location.reload()}
                                    className="mt-2 text-xs text-red-400 hover:text-red-300 font-black uppercase tracking-widest transition"
                                >
                                    Abort Mission
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Game Over Overlay */}
                    {gameResult && (
                        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 animate-in fade-in zoom-in duration-500 overflow-hidden">
                            <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent animate-pulse"></div>

                            <div className="relative group">
                                <div className="absolute -inset-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                                <h2 className="text-6xl font-black text-white mb-2 tracking-tighter uppercase italic select-none">
                                    {gameResult.title}
                                </h2>
                            </div>

                            <p className="text-gray-400 text-sm font-mono uppercase tracking-[0.3em] mb-8 bg-gray-900/50 px-4 py-1 rounded-full border border-gray-800">
                                {gameResult.message}
                            </p>

                            <div className="flex flex-col gap-3 w-64">
                                {gameResult.isRematchRequest ? (
                                    <button
                                        onClick={handleRematchAccept}
                                        className="w-full py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-black uppercase tracking-widest transition shadow-lg shadow-green-900/40 active:scale-95"
                                    >
                                        Accept Duel
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleRematchRequest}
                                        className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-black uppercase tracking-widest transition shadow-lg shadow-blue-900/40 active:scale-95"
                                    >
                                        Request Rematch
                                    </button>
                                )}

                                <button
                                    onClick={() => window.location.reload()}
                                    className="w-full py-4 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-xl font-black uppercase tracking-widest transition active:scale-95"
                                >
                                    Withdraw
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

            <div className="flex flex-col gap-4 w-full lg:h-[600px]">
                {/* Move List Table (Chess.com Style) */}
                <div className="bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden flex flex-col max-h-[300px] lg:max-h-none lg:flex-1">
                    <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900/50 shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Tactical Log</span>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                            <span className="text-[8px] font-bold text-gray-500 uppercase tracking-tighter">Live Analysis</span>
                        </div>
                    </div>
                    <div className="overflow-y-auto custom-scrollbar flex-1">
                        <table className="w-full text-xs font-mono">
                            <thead className="text-[9px] text-gray-600 uppercase tracking-widest sticky top-0 bg-gray-800 z-10">
                                <tr>
                                    <th className="py-2 pl-2 text-left w-10">#</th>
                                    <th className="py-2 text-center">White</th>
                                    <th className="py-2 text-center">Black</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: Math.ceil((moveHistory.length - 1) / 2) }).map((_, i) => (
                                    <tr key={i} className={`border-b border-gray-700/30 ${viewingIndex === i * 2 + 1 || viewingIndex === i * 2 + 2 ? 'bg-blue-500/10' : ''}`}>
                                        <td className="py-2 pl-2 text-gray-600">{i + 1}.</td>
                                        <td
                                            className={`py-2 text-center cursor-pointer hover:bg-gray-700/50 rounded transition-colors ${viewingIndex === i * 2 + 1 ? 'text-blue-400 font-bold' : 'text-gray-300'}`}
                                            onClick={() => setViewingIndex(i * 2 + 1)}
                                        >
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span>{i * 2 + 1 < moveHistory.length ? getMoveSAN(moveHistory[i * 2], moveHistory[i * 2 + 1]) : ''}</span>
                                                {(godMode || initialData?.isReview) && getEvalLabel(i * 2 + 1) && (
                                                    <span className={`text-[7px] px-1 rounded uppercase font-black ${getEvalLabel(i * 2 + 1) === 'Best' ? 'bg-green-500/20 text-green-400' :
                                                        getEvalLabel(i * 2 + 1) === 'Good' ? 'bg-blue-500/20 text-blue-400' :
                                                            getEvalLabel(i * 2 + 1) === 'Blunder' ? 'bg-red-500/20 text-red-500' : 'bg-gray-700 text-gray-500'
                                                        }`}>
                                                        {getEvalLabel(i * 2 + 1)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td
                                            className={`py-2 text-center cursor-pointer hover:bg-gray-700/50 rounded transition-colors ${viewingIndex === i * 2 + 2 ? 'text-blue-400 font-bold' : 'text-gray-300'}`}
                                            onClick={() => setViewingIndex(i * 2 + 2)}
                                        >
                                            <div className="flex flex-col items-center gap-0.5">
                                                <span>{i * 2 + 2 < moveHistory.length ? getMoveSAN(moveHistory[i * 2 + 1], moveHistory[i * 2 + 2]) : ''}</span>
                                                {(godMode || initialData?.isReview) && getEvalLabel(i * 2 + 2) && (
                                                    <span className={`text-[7px] px-1 rounded uppercase font-black ${getEvalLabel(i * 2 + 2) === 'Best' ? 'bg-green-500/20 text-green-400' :
                                                        getEvalLabel(i * 2 + 2) === 'Good' ? 'bg-blue-500/20 text-blue-400' :
                                                            getEvalLabel(i * 2 + 2) === 'Blunder' ? 'bg-red-500/20 text-red-500' : 'bg-gray-700 text-gray-500'
                                                        }`}>
                                                        {getEvalLabel(i * 2 + 2)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Chat Sidebar */}
                <div className="flex-1 min-h-[300px]">
                    <Chat
                        socket={socket}
                        room={room}
                        orientation={orientation}
                        onGodModeActivate={() => setGodMode(true)}
                    />
                </div>
            </div>
        </div >
    );
}

export default Game;
