"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "../../components/ProtectedRoute";

interface User {
    id: string;
    name: string;
    email: string;
}

export default function CanvasPage() {
    const [roomId, setRoomId] = useState("");
    const [error, setError] = useState("");
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [isConnecting, setIsConnecting] = useState(false);
    const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
    const router = useRouter();

    useEffect(() => {
        // Check if user is authenticated
        const token = localStorage.getItem("token");
        const userData = localStorage.getItem("user");
        
        if (!token || !userData) {
            router.push("/signin");
            return;
        }

        try {
            const user = JSON.parse(userData);
            setUser(user);
        } catch (error) {
            console.error("Error parsing user data:", error);
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            router.push("/signin");
        } finally {
            setLoading(false);
        }
    }, [router]);

    // Auto-rejoin last room on page load
    useEffect(() => {
        if (!loading && user) {
            const lastRoom = localStorage.getItem("currentRoom");
            if (lastRoom) {
                console.log("Auto-rejoining last room:", lastRoom);
                setRoomId(lastRoom);
                // Auto-join after a short delay
                setTimeout(() => {
                    handleJoinRoom();
                }, 500);
            }
        }
    }, [loading, user]);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        router.push("/signin");
    };

    const handleJoinRoom = async () => {
        if (!roomId.trim()) {
            setError("Please enter a room name");
            return;
        }

        const token = localStorage.getItem("token");
        if (!token) {
            alert("Please login first");
            router.push("/signin");
            return;
        }

        setIsConnecting(true);
        setError("");

        try {
            // Connect to WebSocket
            const ws = new WebSocket(`wss://excalidraw-ws.habeebsaleh.dev?token=${token}`);
            
            ws.onopen = () => {
                console.log("WebSocket connected from canvas page");
                setWsConnection(ws);
                
                // Store connection globally for room page to use
                (window as any).__wsConnection = ws;
                
                // Don't send join message here - wait for welcome message first
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                console.log("Received message:", data);

                if (data.type === "welcome") {
                    console.log("Welcome message received, joining room...");
                    // After welcome message, send join room request
                    const joinMessage = {
                        type: "join-room",
                        roomName: roomId.trim()
                    };
                    ws.send(JSON.stringify(joinMessage));
                } else if (data.type === "response" && data.message === "Room joined successfully") {
                    console.log("Successfully joined room:", roomId.trim());
                    setIsConnecting(false);
                    // Navigate to room page after successful join
                    router.push(`/canvas/${roomId.trim()}`);
                } else if (data.type === "error") {
                    setError(`Error: ${data.message}`);
                    setIsConnecting(false);
                    ws.close();
                }
            };

            ws.onerror = (error) => {
                console.error("WebSocket error:", error);
                setError("Failed to connect to drawing server");
                setIsConnecting(false);
            };

            ws.onclose = () => {
                console.log("WebSocket disconnected");
                setWsConnection(null);
                setIsConnecting(false);
            };

        } catch (error) {
            console.error("Error connecting to WebSocket:", error);
            setError("Failed to connect to drawing server");
            setIsConnecting(false);
        }
    };

    const handleCreateRandomRoom = () => {
        // Generate a random room ID
        const randomId = Math.random().toString(36).substring(2, 8);
        setRoomId(randomId);
    };

    if (loading) {
        return (
            <ProtectedRoute>
                <div className="min-h-screen bg-background flex items-center justify-center">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                        <p className="text-foreground">Loading...</p>
                    </div>
                </div>
            </ProtectedRoute>
        );
    }

    return (
        <ProtectedRoute>
            <div className="min-h-screen bg-background">
                {/* Header */}
                <div className="bg-card border-b border-border p-4">
                    <div className="max-w-7xl mx-auto flex items-center justify-between">
                        <h1 className="text-2xl font-bold text-foreground">Drawing Rooms</h1>
                        <div className="flex items-center gap-4">
                            {user && (
                                <div className="text-right">
                                    <div className="text-sm font-medium text-foreground">{user.name}</div>
                                    <div className="text-xs text-muted-foreground">{user.email}</div>
                                </div>
                            )}
                            <button
                                onClick={handleLogout}
                                className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                            >
                                Logout
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main Content */}
                <div className="max-w-4xl mx-auto px-4 py-8">
                    <div className="bg-card rounded-lg shadow-sm border border-border p-6">
                        <h2 className="text-lg font-semibold text-foreground mb-4">Join a Drawing Room</h2>
                        
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm mb-4">
                                {error}
                            </div>
                        )}

                        {/* Continue in last room button */}
                        {localStorage.getItem("currentRoom") && (
                            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm text-blue-800">
                                            Continue in your last room: <strong>{localStorage.getItem("currentRoom")}</strong>
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const lastRoom = localStorage.getItem("currentRoom");
                                            if (lastRoom) {
                                                setRoomId(lastRoom);
                                                setTimeout(() => handleJoinRoom(), 100);
                                            }
                                        }}
                                        disabled={isConnecting}
                                        className="px-4 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Continue
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-4 mb-4">
                            <input
                                type="text"
                                placeholder="Enter room name"
                                value={roomId}
                                onChange={(e) => {
                                    setRoomId(e.target.value);
                                    setError("");
                                }}
                                onKeyPress={(e) => e.key === "Enter" && handleJoinRoom()}
                                className="flex-1 px-3 py-2 border border-border rounded-md bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                            />
                            <button
                                onClick={handleJoinRoom}
                                disabled={!roomId.trim() || isConnecting}
                                className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-muted disabled:cursor-not-allowed"
                            >
                                {isConnecting ? (
                                    <div className="flex items-center gap-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                                        <span>Connecting...</span>
                                    </div>
                                ) : (
                                    "Join Room"
                                )}
                            </button>
                        </div>

                        <div className="flex gap-2 mb-4">
                            <button
                                onClick={handleCreateRandomRoom}
                                disabled={isConnecting}
                                className="px-4 py-2 border border-border rounded-md text-foreground bg-background hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Create Random Room
                            </button>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            Enter a room name to join or create a new drawing room. If the room doesn't exist, it will be created automatically.
                        </p>
                    </div>

                    {/* Quick Join Examples */}
                    <div className="mt-8">
                        <h3 className="text-sm font-medium text-foreground mb-3">Quick Join Examples:</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {["meeting-room", "brainstorm", "design-session", "team-notes"].map((exampleRoom) => (
                                <button
                                    key={exampleRoom}
                                    onClick={() => {
                                        setRoomId(exampleRoom);
                                        setTimeout(() => handleJoinRoom(), 100);
                                    }}
                                    disabled={isConnecting}
                                    className="px-3 py-2 text-sm border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {exampleRoom}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </ProtectedRoute>
    );
}
