"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface User {
    id: string;
    name: string;
    email: string;
}

export default function Home() {
  const [roomId, setRoomId] = useState<string>("");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    
    if (!token || !userData) {
      router.push("/auth");
      return;
    }

    try {
      const user = JSON.parse(userData);
      setUser(user);
    } catch (error) {
      console.error("Error parsing user data:", error);
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      router.push("/auth");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/auth");
  };

  const [isConnecting, setIsConnecting] = useState(false);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);

  const handleJoinRoom = async () => {
    if (!roomId.trim()) {
      alert("Please enter a room name");
      return;
    }

    const token = localStorage.getItem("token");
    if (!token) {
      alert("Please login first");
      router.push("/auth");
      return;
    }

    setIsConnecting(true);

    try {
      // Connect to WebSocket
      const ws = new WebSocket(`ws://localhost:8080?token=${token}`);
      
      ws.onopen = () => {
        console.log("WebSocket connected from home page");
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
          router.push(`/room/${roomId.trim()}`);
        } else if (data.type === "error") {
          alert(`Error: ${data.message}`);
          setIsConnecting(false);
          ws.close();
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        alert("Failed to connect to chat server");
        setIsConnecting(false);
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        setWsConnection(null);
        setIsConnecting(false);
      };

    } catch (error) {
      console.error("Error connecting to WebSocket:", error);
      alert("Failed to connect to chat server");
      setIsConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Chat Rooms</h1>
            <div className="flex items-center gap-4">
              {user && (
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">{user.name}</div>
                  <div className="text-xs text-gray-500">{user.email}</div>
                </div>
              )}
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Join a Room</h2>
          <div className="flex gap-4">
            <input
              type="text"
              placeholder="Enter room name"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyPress={(e) => e.key === "Enter" && handleJoinRoom()}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleJoinRoom}
              disabled={!roomId.trim() || isConnecting}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isConnecting ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Connecting...</span>
                </div>
              ) : (
                "Join Room"
              )}
            </button>
          </div>
          <p className="mt-2 text-sm text-gray-600">
            Enter a room name to join or create a new room. If the room doesn't exist, it will be created automatically.
          </p>
        </div>
      </div>
    </div>
  );
}
