import { useState, useEffect } from 'react';
import Game from './components/Game';
import socket from './utils/socket';
import './index.css';

function App() {
  const [room, setRoom] = useState("");
  const [isInGame, setIsInGame] = useState(false);
  const [playerColor, setPlayerColor] = useState(null);
  const [mode, setMode] = useState("create"); // 'create' | 'join'
  const [selectedColor, setSelectedColor] = useState("white");
  const [error, setError] = useState("");

  const handleCreateRequest = () => {
    if (!room) return;
    socket.emit("create_room", { room, color: selectedColor });
  };

  const handleJoinRequest = () => {
    if (!room) return;
    socket.emit("join_room", { room });
  };

  useEffect(() => {
    socket.on("room_created", ({ room, color }) => {
      setIsInGame(true);
      setPlayerColor(color);
      setError("");
    });

    socket.on("room_joined", ({ room, color }) => {
      setIsInGame(true);
      setPlayerColor(color);
      setError("");
    });

    socket.on("room_error", (msg) => {
      setError(msg);
      setTimeout(() => setError(""), 3000);
    });

    socket.on("game_reset", ({ colors }) => {
      setPlayerColor(colors[socket.id]);
      setGameKey(prev => prev + 1); // Force re-render of Game component
    });

    return () => {
      socket.off("room_created");
      socket.off("room_joined");
      socket.off("room_error");
      socket.off("game_reset");
    }
  }, []);

  // Key to force re-render of Game component on rematch
  const [gameKey, setGameKey] = useState(0);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
      {!isInGame ? (
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700">
          <h1 className="text-4xl font-bold text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Chess Duel
          </h1>

          {/* Mode Switcher */}
          <div className="flex mb-6 bg-gray-700 rounded-lg p-1">
            <button
              className={`flex-1 py-2 rounded-md transition-all ${mode === 'create' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setMode('create')}
            >
              Create Room
            </button>
            <button
              className={`flex-1 py-2 rounded-md transition-all ${mode === 'join' ? 'bg-purple-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              onClick={() => setMode('join')}
            >
              Join Room
            </button>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-gray-400 text-sm font-bold mb-2">Room Name</label>
              <input
                className="input-field"
                placeholder="Enter Room Name..."
                value={room}
                onChange={(event) => setRoom(event.target.value)}
              />
            </div>

            {mode === 'create' && (
              <div>
                <label className="block text-gray-400 text-sm font-bold mb-2">Play As</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setSelectedColor('white')}
                    className={`flex-1 py-3 rounded border-2 transition-all ${selectedColor === 'white' ? 'border-blue-500 bg-gray-700 text-white' : 'border-gray-600 text-gray-500 hover:border-gray-500'}`}
                  >
                    White
                  </button>
                  <button
                    onClick={() => setSelectedColor('black')}
                    className={`flex-1 py-3 rounded border-2 transition-all ${selectedColor === 'black' ? 'border-purple-500 bg-gray-700 text-white' : 'border-gray-600 text-gray-500 hover:border-gray-500'}`}
                  >
                    Black
                  </button>
                  <button
                    onClick={() => setSelectedColor('random')}
                    className={`flex-1 py-3 rounded border-2 transition-all ${selectedColor === 'random' ? 'border-green-500 bg-gray-700 text-white' : 'border-gray-600 text-gray-500 hover:border-gray-500'}`}
                  >
                    Random
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-900/50 border border-red-500 rounded text-red-200 text-sm text-center animate-pulse">
                {error}
              </div>
            )}

            <button
              className={`btn-primary w-full ${mode === 'join' ? 'bg-purple-600 hover:bg-purple-700' : ''}`}
              onClick={mode === 'create' ? handleCreateRequest : handleJoinRequest}
            >
              {mode === 'create' ? 'Create Game' : 'Join Game'}
            </button>
          </div>
        </div>
      ) : (
        <Game key={gameKey} room={room} socket={socket} orientation={playerColor} />
      )}
    </div>
  );
}

export default App;
