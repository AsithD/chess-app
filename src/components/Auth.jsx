import { useState } from "react";
import { loginWithGoogle } from "../utils/firebase";

function Auth({ onAuthSuccess }) {
    const [isGuest, setIsGuest] = useState(false);
    const [guestName, setGuestName] = useState("");
    const [loading, setLoading] = useState(false);

    const handleGuestLogin = () => {
        if (!guestName.trim()) return;
        onAuthSuccess({
            name: guestName.trim(),
            isGuest: true,
            uid: `guest_${Math.random().toString(36).substr(2, 9)}`
        });
    };

    const handleGoogleLogin = async () => {
        setLoading(true);
        try {
            const user = await loginWithGoogle();
            onAuthSuccess({
                name: user.displayName,
                uid: user.uid,
                photoURL: user.photoURL,
                email: user.email,
                isGuest: false
            });
        } catch (error) {
            console.error("Full Login Error:", error);
            alert(`Login failed: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700 animate-in fade-in zoom-in duration-300">
            <h1 className="text-4xl font-bold text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
                Chess Duel
            </h1>
            <p className="text-gray-400 text-center mb-8 text-sm uppercase tracking-widest">Master your moves</p>

            {!isGuest ? (
                <div className="space-y-4">
                    <button
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 disabled:opacity-50 text-gray-900 font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path
                                fill="#4285F4"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                                fill="#34A853"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                                fill="#FBBC05"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                            />
                            <path
                                fill="#EA4335"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                        </svg>
                        {loading ? "Establishing Link..." : "Continue with Google"}
                    </button>

                    <div className="relative flex py-3 items-center">
                        <div className="flex-grow border-t border-gray-700"></div>
                        <span className="flex-shrink mx-4 text-gray-500 text-sm">OR</span>
                        <div className="flex-grow border-t border-gray-700"></div>
                    </div>

                    <button
                        onClick={() => setIsGuest(true)}
                        className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 rounded-xl transition-all shadow-md active:scale-95"
                    >
                        Play as Guest
                    </button>

                    <p className="text-gray-500 text-xs text-center mt-6">
                        Guest accounts don't track history or friends.
                    </p>
                </div>
            ) : (
                <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                    <div>
                        <label className="block text-gray-400 text-sm font-bold mb-2 uppercase tracking-wide">Enter Nickname</label>
                        <input
                            autoFocus
                            className="w-full bg-gray-900 border-2 border-gray-700 focus:border-blue-500 text-white px-4 py-3 rounded-xl outline-none transition-all font-mono"
                            placeholder="e.g. GrandMaster..."
                            value={guestName}
                            onChange={(e) => setGuestName(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleGuestLogin()}
                        />
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => setIsGuest(false)}
                            className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-3 rounded-xl transition-all"
                        >
                            Back
                        </button>
                        <button
                            onClick={handleGuestLogin}
                            disabled={!guestName.trim()}
                            className="flex-[2] bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                        >
                            Start Playing
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Auth;
