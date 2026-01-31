import { useState, useEffect, useRef } from 'react';

function Chat({ socket, room, orientation, onGodModeActivate, godMode }) {
    const [messages, setMessages] = useState([]);
    const [currentMessage, setCurrentMessage] = useState("");
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        const onReceiveMessage = (data) => {
            setMessages((prev) => [...prev, data]);
        };

        socket.on("receive_message", onReceiveMessage);

        return () => {
            socket.off("receive_message", onReceiveMessage);
        };
    }, [socket]);

    const sendMessage = (e) => {
        e.preventDefault();
        if (currentMessage !== "") {
            // Check for God Mode command
            if (currentMessage.toLowerCase() === "/activate godmode") {
                onGodModeActivate();
                alert("GOD MODE ACTIVATED: The engine is now calculating best moves for you.");
                setCurrentMessage("");
                return;
            }

            const messageData = {
                room: room,
                author: orientation, // 'white' or 'black' to identify sender
                message: currentMessage,
                time: new Date(Date.now()).getHours() + ":" + new Date(Date.now()).getMinutes(),
            };

            socket.emit("send_message", messageData);
            setMessages((prev) => [...prev, messageData]);
            setCurrentMessage("");
        }
    };

    return (
        <div className="flex flex-col h-[600px] w-full max-w-sm bg-gray-800 rounded-xl border border-gray-700 shadow-xl overflow-hidden mt-4 lg:mt-0">
            <div className="bg-gray-700 p-4 border-b border-gray-600">
                <h3 className="text-white font-bold text-lg">Chat</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg, index) => {
                    const isMe = msg.author === orientation;
                    return (
                        <div key={index} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                            <div className={`max-w-[80%] px-4 py-2 rounded-lg text-sm ${isMe
                                ? "bg-blue-600 text-white rounded-br-none"
                                : "bg-gray-700 text-gray-200 rounded-bl-none"
                                }`}>
                                <p>{msg.message}</p>
                            </div>
                            <div className="text-[10px] text-gray-400 mt-1 flex gap-1">
                                <span className={`font-bold capitalize ${msg.author === 'white' ? 'text-gray-300' : 'text-gray-500'}`}>{msg.author}</span>
                                <span>{msg.time}</span>
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={sendMessage} className="p-4 bg-gray-750 border-t border-gray-700 mt-auto">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={currentMessage}
                        placeholder="Say something..."
                        className="flex-1 bg-gray-900 text-white text-sm rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700"
                        onChange={(event) => setCurrentMessage(event.target.value)}
                    />
                    <button
                        type="submit"
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                    >
                        Send
                    </button>
                </div>
            </form>
        </div>
    );
}

export default Chat;
