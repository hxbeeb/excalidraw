"use client";

import { useState, use, useEffect, useRef } from "react";

interface ChatMessage {
    id: number;
    message: string;
    userId: string;
    userName: string;
    userEmail: string;
    timestamp: string;
}

interface User {
    id: string;
    name: string;
    email: string;
}

export default function RoomPage({params}:{params:Promise<{roomId:string}>}){ 
    const [room, setRoom] = useState<string>("");
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState<string>("");
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [isJoined, setIsJoined] = useState<boolean>(false);
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string>("");
    const wsRef = useRef<WebSocket | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const {roomId} = use(params);

    // Auto-scroll to bottom when new messages arrive
    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Get token from localStorage on component mount
    useEffect(() => {
        const storedToken = localStorage.getItem("token");
        const userData = localStorage.getItem("user");
        
        if (!storedToken || !userData) {
            alert("Please login first");
            window.location.href = "/auth";
            return;
        }

        setToken(storedToken);
        
        try {
            const user = JSON.parse(userData);
            setUser(user);
        } catch (error) {
            console.error("Error parsing user data:", error);
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            window.location.href = "/auth";
        }
    }, []);

    // Connect to WebSocket
    const connectWebSocket = () => {
        if (!token) {
            alert("Please login first");
            return;
        }

        const ws = new WebSocket(`wss://excalidraw-ws.habeebsaleh.dev?token=${token}`);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("WebSocket connected");
            setIsConnected(true);
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log("Received message:", data);

            switch (data.type) {
                case "welcome":
                    console.log("Welcome message:", data.message);
                    break;
                case "response":
                    if (data.message === "Room joined successfully") {
                        setIsJoined(true);
                        if (data.chatHistory) {
                            setMessages(data.chatHistory);
                        }
                    }
                    break;
                case "message":
                    setMessages(prev => [...prev, {
                        id: data.messageId,
                        message: data.message,
                        userId: data.userId,
                        userName: data.userName,
                        userEmail: data.userEmail,
                        timestamp: data.timestamp
                    }]);
                    break;
                case "chat-history":
                    setMessages(data.messages);
                    break;
                case "error":
                    alert(`Error: ${data.message}`);
                    break;
                default:
                    console.log("Unknown message type:", data.type);
            }
        };

        ws.onclose = () => {
            console.log("WebSocket disconnected");
            setIsConnected(false);
            setIsJoined(false);
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            setIsConnected(false);
        };
    };

    // Join room
    const joinRoom = () => {
        if (!wsRef.current || !isConnected) {
            alert("WebSocket not connected");
            return;
        }

        const joinMessage = {
            type: "join-room",
            roomName: roomId
        };

        wsRef.current.send(JSON.stringify(joinMessage));
    };

    // Send message
    const sendMessage = () => {
        if (!newMessage.trim() || !wsRef.current || !isConnected || !isJoined) {
            return;
        }

        const messageData = {
            type: "send-message",
            message: newMessage.trim(),
            roomName: roomId
        };

        wsRef.current.send(JSON.stringify(messageData));
        setNewMessage("");
    };

    // Handle Enter key press
    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Connect to WebSocket when token is available
    useEffect(() => {
        if (token && !isConnected) {
            // Check if there's already a WebSocket connection from home page
            const existingWs = (window as any).__wsConnection;
            if (existingWs && existingWs.readyState === WebSocket.OPEN) {
                console.log("Using existing WebSocket connection");
                wsRef.current = existingWs;
                setIsConnected(true);
                
                // Set up message handler for existing connection
                const handleMessage = (event: MessageEvent) => {
                    const data = JSON.parse(event.data);
                    console.log("Received message in room page:", data);

                    switch (data.type) {
                        case "welcome":
                            console.log("Welcome message:", data.message);
                            break;
                        case "response":
                            if (data.message === "Room joined successfully") {
                                setIsJoined(true);
                                if (data.chatHistory) {
                                    setMessages(data.chatHistory);
                                }
                            }
                            break;
                        case "message":
                            setMessages(prev => [...prev, {
                                id: data.messageId,
                                message: data.message,
                                userId: data.userId,
                                userName: data.userName,
                                userEmail: data.userEmail,
                                timestamp: data.timestamp
                            }]);
                            break;
                        case "chat-history":
                            setMessages(data.messages);
                            break;
                        case "error":
                            alert(`Error: ${data.message}`);
                            break;
                        default:
                            console.log("Unknown message type:", data.type);
                    }
                };

                existingWs.addEventListener('message', handleMessage);
                
                // Remove the global reference
                delete (window as any).__wsConnection;
                
                // If we don't get a join response within 3 seconds, assume we're already joined
                setTimeout(() => {
                    if (!isJoined) {
                        console.log("No join response received, assuming already joined");
                        setIsJoined(true);
                    }
                }, 3000);
            } else {
                connectWebSocket();
            }
        }
    }, [token]);

    // Join room when connected (only if not using existing connection)
    useEffect(() => {
        if (isConnected && !isJoined) {
            // Check if we're using an existing connection that was already joined
            const existingWs = (window as any).__wsConnection;
            if (!existingWs) {
                // Only join if we created a new connection
                joinRoom();
            }
        }
    }, [isConnected]);

    return (
        <div className="flex flex-col h-screen bg-gray-100">
            {/* Header */}
            <div className="bg-white shadow-sm border-b p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-semibold">Room: {roomId}</h1>
                        <div className="flex items-center gap-2 mt-1">
                            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                            <span className="text-sm text-gray-600">
                                {isConnected ? 'Connected' : 'Disconnected'}
                            </span>
                            {isJoined && (
                                <>
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                    <span className="text-sm text-gray-600">Joined</span>
                                </>
                            )}
                        </div>
                    </div>
                    {user && (
                        <div className="text-right">
                            <div className="text-sm font-medium">{user.name}</div>
                            <div className="text-xs text-gray-500">{user.email}</div>
                        </div>
                    )}
                </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="text-center text-gray-500 mt-8">
                        {isJoined ? "No messages yet. Start the conversation!" : "Join the room to see messages."}
                    </div>
                ) : (
                    messages.map((msg) => (
                        <div key={msg.id} className={`flex ${msg.userId === user?.id ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                                msg.userId === user?.id 
                                    ? 'bg-blue-500 text-white' 
                                    : 'bg-white text-gray-800'
                            }`}>
                                <div className="text-xs opacity-75 mb-1">
                                    {msg.userName} • {new Date(msg.timestamp).toLocaleTimeString()}
                                </div>
                                <div>{msg.message}</div>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-white border-t p-4">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyPress={handleKeyPress}
                        placeholder={isJoined ? "Type your message..." : "Join the room to send messages"}
                        disabled={!isJoined}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                    <button
                        onClick={sendMessage}
                        disabled={!isJoined || !newMessage.trim()}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}


