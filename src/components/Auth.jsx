import { useState } from "react";

function Auth({ onAuthSuccess }) {
    const [isGuest, setIsGuest] = useState(false);
    const [guestName, setGuestName] = useState("");

    const handleGuestLogin = () => {
        if (!guestName.trim()) return;
        onAuthSuccess({
            name: guestName.trim(),
            isGuest: true,
            uid: `guest_${Math.random().toString(36).substr(2, 9)}`
        });
    };

    const handleGoogleLogin = () => {
        // This will be implemented once Firebase config is provided
        alert("Google Login will be active soon! Please use Guest for now.");
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
                        className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-900 font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95"
                    >
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/action/google.svg" alt="G" className="w-5 h-5" />
                        Continue with Google
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
