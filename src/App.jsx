import { useState, useEffect } from 'react';
import Game from './components/Game';
import Auth from './components/Auth';
import socket from './utils/socket';
import { auth, db, logout as firebaseLogout } from './utils/firebase';
import { collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import './index.css';

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    let unsubscribeHistory;
    const unsubscribeAuth = auth.onAuthStateChanged((firebaseUser) => {
      if (firebaseUser) {
        const userData = {
          name: firebaseUser.displayName,
          uid: firebaseUser.uid,
          photoURL: firebaseUser.photoURL,
          email: firebaseUser.email,
          isGuest: false
        };
        setUser(userData);

        // Fetch History
        const q = query(
          collection(db, "matches"),
          where("uid", "==", firebaseUser.uid),
          orderBy("timestamp", "desc"),
          limit(10)
        );
        unsubscribeHistory = onSnapshot(q, (snapshot) => {
          setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
      }
      setAuthLoading(false);
    });
    return () => {
      unsubscribeAuth();
      if (unsubscribeHistory) unsubscribeHistory();
    };
  }, []);

  const handleLogout = () => {
    firebaseLogout();
    setUser(null);
    setIsInGame(false);
    setShowProfile(false);
  };
  const [room, setRoom] = useState("");
  const [isInGame, setIsInGame] = useState(false);
  const [playerColor, setPlayerColor] = useState(null);
  const [mode, setMode] = useState("create"); // 'create' | 'join'
  const [selectedColor, setSelectedColor] = useState("white");
  const [error, setError] = useState("");
  const [showProfile, setShowProfile] = useState(false);

  const handleCreateRequest = () => {
    socket.emit("create_room", { room, color: selectedColor });
  };

  const handleJoinRequest = () => {
    if (!room) return;
    socket.emit("join_room", { room });
  };

  const [initialData, setInitialData] = useState({});

  useEffect(() => {
    socket.on("room_created", ({ room, color }) => {
      setIsInGame(true);
      setRoom(room); // Update room if it was randomly generated
      setPlayerColor(color);
      setInitialData({ waiting: true });
      setError("");
    });

    socket.on("room_joined", ({ room, color, fen }) => {
      setIsInGame(true);
      setRoom(room);
      setPlayerColor(color);
      setInitialData({ waiting: false, fen });
      setError("");
    });

    socket.on("room_error", (msg) => {
      setError(msg);
      setTimeout(() => setError(""), 3000);
    });

    socket.on("game_reset", ({ colors, fen }) => {
      setPlayerColor(colors[socket.id]);
      setInitialData({ waiting: false, fen });
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

  if (authLoading) return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
      <p className="text-gray-500 font-mono text-xs uppercase tracking-[0.3em]">Synching Neural Link...</p>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-900 text-white font-sans selection:bg-blue-500/30">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-gray-900/50 backdrop-blur-md border-b border-gray-800 z-50 flex items-center justify-between px-6 shadow-xl">
        <h1 className="text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500 tracking-tighter uppercase transition-all hover:scale-105 cursor-pointer" onClick={() => !isInGame && setUser(null)}>
          Chess Duel
        </h1>

        {user && (
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-sm font-bold text-gray-200">{user.name}</span>
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">{user.isGuest ? 'Guest' : 'Member'}</span>
            </div>
            <button
              onClick={() => setShowProfile(!showProfile)}
              className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 border-2 border-gray-700 hover:border-blue-400 transition-all shadow-lg active:scale-90 flex items-center justify-center overflow-hidden"
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="User" />
              ) : (
                <span className="text-lg font-bold uppercase">{user.name[0]}</span>
              )}
            </button>
          </div>
        )}
      </header>

      <main className="flex-grow flex items-center justify-center p-4 mt-16 overflow-hidden">
        {!user ? (
          <Auth onAuthSuccess={setUser} />
        ) : !isInGame ? (
          <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold mb-6 text-gray-100 flex items-center gap-3">
              <span className="text-blue-500">⚔️</span> Find a Match
            </h2>

            {/* Mode Switcher */}
            <div className="grid grid-cols-2 gap-2 mb-8 bg-gray-900/50 p-1 rounded-xl border border-gray-700">
              <button
                className={`py-2 px-4 rounded-lg font-bold text-sm transition-all ${mode === 'create' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-gray-500 hover:text-gray-300'}`}
                onClick={() => setMode('create')}
              >
                Create Room
              </button>
              <button
                className={`py-2 px-4 rounded-lg font-bold text-sm transition-all ${mode === 'join' ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40' : 'text-gray-500 hover:text-gray-300'}`}
                onClick={() => setMode('join')}
              >
                Join Room
              </button>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-gray-400 text-xs font-bold mb-2 uppercase tracking-widest">
                  {mode === 'create' ? 'Optional Room Name' : 'Required Room Name'}
                </label>
                <input
                  className="w-full bg-gray-900 border-2 border-gray-700 focus:border-blue-500 text-white px-4 py-3 rounded-xl outline-none transition-all font-mono"
                  placeholder={mode === 'create' ? "Generate randomly..." : "Enter code here..."}
                  value={room}
                  onChange={(event) => setRoom(event.target.value)}
                />
              </div>

              {mode === 'create' && (
                <div>
                  <label className="block text-gray-400 text-xs font-bold mb-2 uppercase tracking-widest">Orientation</label>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setSelectedColor('white')}
                      className={`flex-1 py-3 rounded-xl border-2 transition-all font-bold ${selectedColor === 'white' ? 'border-blue-500 bg-blue-500/10 text-white shadow-lg' : 'border-gray-700 text-gray-500 hover:border-gray-600'}`}
                    >
                      White
                    </button>
                    <button
                      onClick={() => setSelectedColor('black')}
                      className={`flex-1 py-3 rounded-xl border-2 transition-all font-bold ${selectedColor === 'black' ? 'border-purple-500 bg-purple-500/10 text-white shadow-lg' : 'border-gray-700 text-gray-500 hover:border-gray-600'}`}
                    >
                      Black
                    </button>
                    <button
                      onClick={() => setSelectedColor('random')}
                      className={`flex-1 py-3 rounded-xl border-2 transition-all font-bold ${selectedColor === 'random' ? 'border-green-500 bg-green-500/10 text-white shadow-lg' : 'border-gray-700 text-gray-500 hover:border-gray-600'}`}
                    >
                      🎲
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-xl text-red-200 text-xs font-medium text-center animate-shake">
                  {error}
                </div>
              )}

              <button
                className={`w-full py-4 rounded-xl font-black uppercase tracking-widest transition-all active:scale-95 shadow-2xl ${mode === 'join' ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-900/30' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-900/30'}`}
                onClick={mode === 'create' ? handleCreateRequest : handleJoinRequest}
              >
                {mode === 'create' ? 'Open Portal' : 'Enter Arena'}
              </button>
            </div>
          </div>
        ) : (
          <Game
            key={gameKey}
            room={room}
            socket={socket}
            orientation={playerColor}
            initialData={initialData}
            user={user}
          />
        )}
      </main>

      {/* Profile Sidebar */}
      {showProfile && (
        <div className="fixed inset-0 z-[100] animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowProfile(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-sm bg-gray-800 border-l border-gray-700 p-8 shadow-2xl animate-in slide-in-from-right duration-500">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-2xl font-black uppercase tracking-tighter">Command Center</h3>
              <button onClick={() => setShowProfile(false)} className="text-gray-500 hover:text-white transition-colors">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>

            <div className="space-y-10">
              {/* User Info */}
              <div className="flex items-center gap-6 p-4 rounded-2xl bg-gray-900/50 border border-gray-700 shadow-inner">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center text-2xl font-black border-2 border-gray-600 shadow-lg">
                  {user.photoURL ? <img src={user.photoURL} className="rounded-xl" /> : user.name[0]}
                </div>
                <div>
                  <h4 className="text-lg font-bold">{user.name}</h4>
                  <p className="text-gray-500 text-xs font-mono uppercase tracking-widest mt-1">ID: {user.uid.slice(0, 8)}</p>
                </div>
              </div>

              {/* Account Section */}
              <div className="space-y-4">
                <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Intel & Assets</h5>

                {!user.isGuest ? (
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-gray-900/30 border border-gray-800 flex justify-between items-center">
                      <span className="text-sm font-bold text-gray-400">Match History</span>
                      <span className="px-2 py-1 rounded bg-blue-900/40 text-blue-400 text-[10px] font-black">ACTIVE</span>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-900/30 border border-gray-800 flex justify-between items-center opacity-50">
                      <span className="text-sm font-bold text-gray-400">Alliance (Friends)</span>
                      <span className="px-2 py-1 rounded bg-gray-800 text-gray-500 text-[10px] font-black italic">COMING SOON</span>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 rounded-2xl bg-blue-900/20 border border-blue-500/30 text-center space-y-4">
                    <p className="text-sm text-blue-200">History and Social Features are reserved for **Registered Agents**.</p>
                    <button
                      onClick={() => { setUser(null); setShowProfile(false); }}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg shadow-blue-900/30 transition-all active:scale-95"
                    >
                      Sign Up Now
                    </button>
                  </div>
                )}
              </div>

              {/* Friends (Mockup) */}
              {!user.isGuest && (
                <div className="space-y-4">
                  <h5 className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">Active Allies</h5>
                  <p className="text-xs text-gray-600 italic px-2">No allies connected. Connect to challenge others.</p>
                </div>
              )}

              <button
                onClick={() => { setUser(null); setShowProfile(false); setIsInGame(false); }}
                className="w-full py-4 border-2 border-red-900/30 text-red-500 hover:bg-red-900/20 rounded-xl font-bold transition-all mt-auto flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
                Terminate Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
