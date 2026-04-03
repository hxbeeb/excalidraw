"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "../../../components/ProtectedRoute";

interface Point {
  x: number;
  y: number;
}

interface DrawingAction {
  type: "start" | "draw" | "end";
  points: Point[];
  color: string;
  strokeWidth: number;
  userId: string;
  userName: string;
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface Message {
  id: string;
  text: string;
  userId: string;
  userName: string;
  timestamp: string;
}

export default function CanvasRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentColor, setCurrentColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [connectedUsers, setConnectedUsers] = useState<User[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [drawingHistoryFetched, setDrawingHistoryFetched] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [canvasInitRetryCount, setCanvasInitRetryCount] = useState(0);
  const currentPathRef = useRef<Point[]>([]);
  const [canvasState, setCanvasState] = useState<ImageData | null>(null);
     const [messages, setMessages] = useState<Message[]>([]);
   const [chatInput, setChatInput] = useState("");
   const chatContainerRef = useRef<HTMLDivElement>(null);
   const [isRoomAdmin, setIsRoomAdmin] = useState(false);
   const [mobilePanel, setMobilePanel] = useState<"none" | "users" | "chat">("none");
   const [wsError, setWsError] = useState("");

  // Function to save canvas state
  const saveCanvasState = () => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (canvas && context) {
      try {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        setCanvasState(imageData);
        console.log("Canvas state saved");
      } catch (error) {
        console.error("Error saving canvas state:", error);
      }
    }
  };

  // Function to restore canvas state
  const restoreCanvasState = () => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (canvas && context && canvasState) {
      try {
        context.putImageData(canvasState, 0, 0);
        console.log("Canvas state restored");
      } catch (error) {
        console.error("Error restoring canvas state:", error);
      }
    }
  };

  // Fixed internal canvas resolution — same on all devices
  const CANVAS_WIDTH = 1920;
  const CANVAS_HEIGHT = 1080;

  // Resize only re-applies context properties (internal size never changes)
  const debouncedResize = useCallback(() => {
    const context = contextRef.current;
    if (!context) return;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = currentColor;
    context.lineWidth = strokeWidth;
  }, [currentColor, strokeWidth]);

  // Function to fetch drawing history from HTTP backend
  const fetchDrawingHistory = async (roomSlug: string) => {
    // Prevent repeated calls
    if (drawingHistoryFetched) {
      console.log("Drawing history already fetched, skipping...");
      return;
    }

    // Prevent infinite retries
    if (retryCount > 50) {
      console.error("Too many retries, giving up on fetching drawing history");
      return;
    }

    try {
      console.log("Fetching drawing history for room:", roomSlug);
      console.log("Token being sent:", token);
      console.log("Token length:", token.length);
      
      const httpHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
      const response = await fetch(`http://${httpHost}:3000/drawings/${roomSlug}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      console.log("Response status:", response.status);
      console.log("Response headers:", Object.fromEntries(response.headers.entries()));

      if (response.ok) {
        const drawingActions = await response.json();
        console.log("Fetched drawing history from database:", drawingActions);
        
        // Wait for canvas context to be ready
        if (!contextRef.current) {
          console.log("Canvas context not ready, waiting... (retry count:", retryCount + 1, ")");
          setRetryCount(prev => prev + 1);
          setTimeout(() => fetchDrawingHistory(roomSlug), 100);
          return;
        }
        
        // Mark as fetched to prevent repeated calls
        setDrawingHistoryFetched(true);
        
        // Replay all saved strokes
        drawingActions.forEach((action: any) => {
          let points = action.points;
          if (typeof points === 'string') {
            try { points = JSON.parse(points); } catch { points = []; }
          }
          replayStroke({
            points: points || [],
            color: action.color || "#000000",
            strokeWidth: action.strokeWidth || 2,
          });
        });
      } else {
        const errorText = await response.text();
        console.error("Failed to fetch drawing history:", response.status, errorText);
      }
    } catch (error) {
      console.error("Error fetching drawing history:", error);
    }
  };

  // Initialize canvas
  useEffect(() => {
    console.log("Canvas initialization useEffect running");
    
    // Add a small delay to ensure the canvas element is rendered
    const initCanvas = () => {
      console.log("Canvas ref current:", canvasRef.current);
      
      // Prevent infinite retries
      if (canvasInitRetryCount > 50) {
        console.error("Too many canvas initialization retries, giving up");
        return;
      }
      
      const canvas = canvasRef.current;
      if (!canvas) {
        console.log("Canvas ref is null, will retry in 100ms (retry count:", canvasInitRetryCount + 1, ")");
        setCanvasInitRetryCount(prev => prev + 1);
        setTimeout(initCanvas, 100);
        return;
      }

      console.log("Initializing canvas");

      // Fixed internal resolution — CSS scales it to fit
      canvas.width = CANVAS_WIDTH;
      canvas.height = CANVAS_HEIGHT;
      
      // Use debounced resize handler for window resize events
      let resizeTimeout: NodeJS.Timeout;
      const handleWindowResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(debouncedResize, 100);
      };
      
      window.addEventListener('resize', handleWindowResize);

      const context = canvas.getContext("2d");
      if (!context) {
        console.log("Could not get 2D context");
        return;
      }

      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "#000000";
      context.lineWidth = 2;
      contextRef.current = context;

      return () => {
        window.removeEventListener('resize', handleWindowResize);
      };
    };

    // Start the initialization process
    initCanvas();
  }, []); // Remove dependencies to ensure it runs only once

  // Update canvas context when color or stroke width changes
  useEffect(() => {
    const context = contextRef.current;
    const canvas = canvasRef.current;
    if (context && canvas) {
      context.strokeStyle = currentColor;
      // Use a fixed stroke width that looks good at any scale
      const baseStrokeWidth = Math.max(1, strokeWidth); // Ensure minimum width of 1
      context.lineWidth = baseStrokeWidth;
      console.log("Updated context - Color:", currentColor, "Stroke width:", baseStrokeWidth);
    }
  }, [currentColor, strokeWidth]);

  // Fetch drawing history when canvas context is ready
  useEffect(() => {
    if (contextRef.current && isJoined && !drawingHistoryFetched) {
      console.log("Canvas context ready, fetching drawing history");
      fetchDrawingHistory(roomId);
    }
  }, [contextRef.current, isJoined, drawingHistoryFetched]);

     // Fetch chat history when joined to room
   useEffect(() => {
     if (isJoined && messages.length === 0) {
       console.log("Joined room, fetching chat history");
       fetchChatHistory();
     }
   }, [isJoined, messages.length]);

   // Auto-scroll to bottom when new messages arrive
   useEffect(() => {
     if (chatContainerRef.current) {
       chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
     }
   }, [messages]);

  // Periodic canvas state save
  useEffect(() => {
    if (!contextRef.current) return;

    const interval = setInterval(() => {
      saveCanvasState();
    }, 2000); // Save every 2 seconds

    return () => clearInterval(interval);
  }, [contextRef.current]);

  // Get token and user from localStorage on component mount
  useEffect(() => {
    const storedToken = localStorage.getItem("token");
    const userData = localStorage.getItem("user");
    
    if (!storedToken || !userData) {
      alert("Please login first");
      window.location.href = "/signin";
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
      window.location.href = "/signin";
    } finally {
      setLoading(false);
    }
  }, []);

  // Store current room in localStorage
  useEffect(() => {
    if (roomId) {
      localStorage.setItem("currentRoom", roomId);
      console.log("Stored current room in localStorage:", roomId);
    }
  }, [roomId]);

  // No redirect to stored room — respect the URL the user navigated to

  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // Connect to WebSocket with auto-reconnect
  const connectWebSocket = useCallback(() => {
    if (!token) {
      alert("Please login first");
      return;
    }

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    // Use the same hostname the page was loaded from, so mobile works without cross-origin issues
    const wsHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
    const wsUrl = `ws://${wsHost}:8080?token=${token}`;
    console.log("Connecting to WebSocket:", wsUrl);
    setWsError("");

    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to create WebSocket:", msg);
      setWsError(`Failed to connect: ${msg}`);
      scheduleReconnect();
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "welcome":
          // Auto-join room after welcome
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "join-room",
              roomName: roomId
            }));
          }
          break;
        case "response":
          if (data.message === "Room joined successfully") {
            setIsJoined(true);
            if (data.isAdmin !== undefined) {
              setIsRoomAdmin(data.isAdmin);
            }
            if (data.chatHistory && Array.isArray(data.chatHistory)) {
              const historyMessages = data.chatHistory.map((msg: any) => ({
                id: msg.id,
                text: msg.message,
                userId: msg.user.id,
                userName: msg.user.name,
                timestamp: msg.createdAt
              }));
              setMessages(historyMessages);
            }
          }
          break;
        case "user-joined":
          setConnectedUsers(prev => {
            const userExists = prev.some(u => u.id === data.user.id);
            if (!userExists) {
              return [...prev, data.user];
            }
            return prev;
          });
          break;
        case "user-left":
          setConnectedUsers(prev => prev.filter(u => u.id !== data.userId));
          break;
        case "drawing-action":
          handleRemoteDrawing(data.action);
          break;
        case "clear-canvas":
          handleRemoteClearCanvas();
          break;
        case "clear-all":
          handleRemoteClearAll();
          break;
        case "clear-messages":
          handleRemoteClearMessages();
          break;
        case "room-users":
          const uniqueUsers = data.users.filter((u: User, i: number, self: User[]) =>
            i === self.findIndex(x => x.id === u.id)
          );
          setConnectedUsers(uniqueUsers);
          break;
        case "message":
          setMessages(prev => [...prev, {
            id: data.messageId || Date.now().toString(),
            text: data.message,
            userId: data.userId,
            userName: data.userName,
            timestamp: data.timestamp
          }]);
          break;
        case "chat-history":
          if (data.messages && Array.isArray(data.messages)) {
            const historyMessages = data.messages.map((msg: any) => ({
              id: msg.id,
              text: msg.message,
              userId: msg.user.id,
              userName: msg.user.name,
              timestamp: msg.createdAt
            }));
            setMessages(historyMessages);
          }
          break;
        case "error":
          console.error("WS error:", data.message);
          break;
      }
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      setIsConnected(false);
      setIsJoined(false);
      scheduleReconnect();
    };

    ws.onerror = () => {
      console.error("WebSocket error — target URL:", wsUrl);
      setWsError(`Cannot reach ws://${typeof window !== "undefined" ? window.location.hostname : "localhost"}:8080`);
    };
  }, [token, roomId]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current) return; // already scheduled
    const attempts = reconnectAttemptsRef.current;
    if (attempts >= 10) {
      console.log("Max reconnect attempts reached");
      return;
    }
    const delay = Math.min(1000 * Math.pow(2, attempts), 10000); // 1s, 2s, 4s... up to 10s
    console.log(`Reconnecting in ${delay}ms (attempt ${attempts + 1})`);
    reconnectAttemptsRef.current = attempts + 1;
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connectWebSocket();
    }, delay);
  }, [connectWebSocket]);

  // Reconnect on visibility change (phone locks/unlocks, tab switch)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && !wsRef.current?.OPEN) {
        // Check if actually disconnected
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log("Page became visible, reconnecting...");
          reconnectAttemptsRef.current = 0;
          connectWebSocket();
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [connectWebSocket]);

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
    
    // Send user joined notification after a short delay
    setTimeout(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const userJoinedMessage = {
          type: "user-joined",
          roomName: roomId
        };
        wsRef.current.send(JSON.stringify(userJoinedMessage));
      }
    }, 500);
  };

  // Connect to WebSocket once when token becomes available
  const hasConnectedRef = useRef(false);
  useEffect(() => {
    if (token && !hasConnectedRef.current) {
      hasConnectedRef.current = true;
      connectWebSocket();
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional unmount
        wsRef.current.close();
      }
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    };
  }, [token]);

  const handleRemoteDrawing = (action: DrawingAction) => {
    const context = contextRef.current;
    if (!context) return;

    // Save current local drawing state
    const prevColor = context.strokeStyle;
    const prevWidth = context.lineWidth;

    context.strokeStyle = action.color;
    context.lineWidth = action.strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";

    if (action.points && action.points.length >= 2) {
      // Draw a self-contained path segment — doesn't interfere with local drawing
      context.beginPath();
      context.moveTo(action.points[0].x, action.points[0].y);
      for (let i = 1; i < action.points.length; i++) {
        context.lineTo(action.points[i].x, action.points[i].y);
      }
      context.stroke();
    }

    // Restore local drawing state
    context.strokeStyle = prevColor;
    context.lineWidth = prevWidth;
  };

  // Replay a complete stroke (from DB history)
  const replayStroke = (action: { points: Point[]; color: string; strokeWidth: number }) => {
    const context = contextRef.current;
    if (!context || !action.points || action.points.length < 2) return;

    const prevColor = context.strokeStyle;
    const prevWidth = context.lineWidth;

    context.strokeStyle = action.color;
    context.lineWidth = action.strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";

    context.beginPath();
    context.moveTo(action.points[0].x, action.points[0].y);
    for (let i = 1; i < action.points.length; i++) {
      context.lineTo(action.points[i].x, action.points[i].y);
    }
    context.stroke();

    context.strokeStyle = prevColor;
    context.lineWidth = prevWidth;
  };

     const handleRemoteClearCanvas = () => {
     const canvas = canvasRef.current;
     const context = contextRef.current;
     if (!canvas || !context) return;

     context.clearRect(0, 0, canvas.width, canvas.height);
   };

   const handleRemoteClearAll = () => {
     // Clear canvas
     const canvas = canvasRef.current;
     const context = contextRef.current;
     if (canvas && context) {
       context.clearRect(0, 0, canvas.width, canvas.height);
     }

     // Clear messages
     setMessages([]);
   };

   const handleRemoteClearMessages = () => {
     // Clear messages only
     setMessages([]);
   };

  const startDrawing = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!contextRef.current) return;

    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;

    currentPathRef.current = [{ x: canvasX, y: canvasY }];

    contextRef.current.beginPath();
    contextRef.current.moveTo(canvasX, canvasY);
  }, []);

  const draw = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !contextRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = (event.clientX - rect.left) * scaleX;
    const canvasY = (event.clientY - rect.top) * scaleY;

    currentPathRef.current.push({ x: canvasX, y: canvasY });

    contextRef.current.lineTo(canvasX, canvasY);
    contextRef.current.stroke();
  }, [isDrawing]);

  const stopDrawing = useCallback(() => {
    if (!isDrawing) return;
    setIsDrawing(false);

    // Send the complete stroke to other users (and DB)
    const path = currentPathRef.current;
    if (wsRef.current?.readyState === WebSocket.OPEN && path.length > 1 && user) {
      wsRef.current.send(JSON.stringify({
        type: "drawing-action",
        roomName: roomId,
        action: {
          type: "end",
          points: path,
          color: currentColor,
          strokeWidth: strokeWidth,
          userId: user.id,
          userName: user.name
        }
      }));
    }

    currentPathRef.current = [];
  }, [isDrawing, currentColor, strokeWidth, user, roomId]);

  // Touch event handlers
  const getCanvasPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!contextRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const point = getCanvasPoint(touch.clientX, touch.clientY);
    if (!point) return;

    setIsDrawing(true);
    currentPathRef.current = [point];
    contextRef.current.beginPath();
    contextRef.current.moveTo(point.x, point.y);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isDrawing || !contextRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const point = getCanvasPoint(touch.clientX, touch.clientY);
    if (!point) return;

    currentPathRef.current.push(point);
    contextRef.current.lineTo(point.x, point.y);
    contextRef.current.stroke();
  }, [isDrawing]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    stopDrawing();
  }, [stopDrawing]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    
    // Send clear action to other users
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "clear-canvas",
        roomName: roomId,
        userId: user?.id
      }));
    }
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement("a");
    link.download = `canvas-${roomId}.png`;
    link.href = canvas.toDataURL();
    link.click();
  };

  const sendChatMessage = () => {
    if (!chatInput.trim() || !wsRef.current || !user) return;

    // Send chat message to other users
    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "send-message",
        roomName: roomId,
        message: chatInput.trim()
      }));
    }

    // Clear the input (don't add to local state - wait for backend response)
    setChatInput("");
  };

  const leaveRoom = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "leave-room",
        roomName: roomId
      }));
      wsRef.current.onclose = null; // prevent reconnect
      wsRef.current.close();
    }
    localStorage.removeItem("currentRoom");
    localStorage.removeItem("inRoom");
    document.cookie = "inRoom=; path=/; max-age=0";
    window.location.href = "/canvas";
  };

  // Mark that user is in a room (cookie for middleware, localStorage for client)
  useEffect(() => {
    localStorage.setItem("inRoom", roomId);
    document.cookie = `inRoom=${roomId}; path=/; SameSite=Lax`;
  }, [roomId]);

  const fetchChatHistory = () => {
    if (!wsRef.current || !user) return;

    // Request chat history from WebSocket backend
    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "get-chat-history",
        roomName: roomId,
        limit: 50
      }));
    }
  };

  // Debug function to check canvas state
  const debugCanvas = () => {
    console.log("Canvas Debug Info:");
    console.log("- Canvas ref:", canvasRef.current);
    console.log("- Context ref:", contextRef.current);
    console.log("- Is drawing:", isDrawing);
    console.log("- Is connected:", isConnected);
    console.log("- Is joined:", isJoined);
    console.log("- WebSocket state:", wsRef.current?.readyState);
    console.log("- User:", user);
    console.log("- Current color:", currentColor);
    console.log("- Stroke width:", strokeWidth);
    
    // Test drawing on canvas
    const context = contextRef.current;
    if (context) {
      console.log("Testing canvas drawing...");
      context.strokeStyle = "#ff0000";
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(50, 50);
      context.lineTo(150, 150);
      context.stroke();
      console.log("Test line drawn!");
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-900">Loading...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="flex flex-col h-[100dvh] bg-gray-100 overflow-hidden">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-3 py-2 md:px-4 md:py-3 shrink-0">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <h1 className="text-sm md:text-xl font-semibold text-gray-900 truncate">Room: {roomId}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-xs text-gray-500">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-4 shrink-0">
              {/* Mobile panel toggles */}
              <button
                onClick={() => setMobilePanel(mobilePanel === "users" ? "none" : "users")}
                className="md:hidden px-2 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-700"
              >
                Users ({connectedUsers.length})
              </button>
              <button
                onClick={() => setMobilePanel(mobilePanel === "chat" ? "none" : "chat")}
                className="md:hidden px-2 py-1 text-xs border border-gray-300 rounded-md bg-white text-gray-700"
              >
                Chat
              </button>

              <span className="hidden md:inline text-sm text-gray-500">
                {connectedUsers.length} online
              </span>
              <button
                onClick={leaveRoom}
                className="px-2 py-1 text-xs md:px-3 md:text-sm bg-gray-700 text-white rounded-md hover:bg-gray-800 transition-colors"
              >
                Leave
              </button>
              <button
                onClick={clearCanvas}
                className="px-2 py-1 text-xs md:px-3 md:text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
              >
                Clear
              </button>
              <button
                onClick={downloadCanvas}
                className="hidden md:inline-block px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
              >
                Download
              </button>
              {user && (
                <div className="hidden md:block text-right">
                  <div className="text-sm font-medium text-gray-900">{user.name}</div>
                  <div className="text-xs text-gray-500">{user.email}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 overflow-hidden flex relative">
          {/* Connected Users Sidebar — hidden on mobile, overlay when toggled */}
          <div className={`
            ${mobilePanel === "users" ? "absolute inset-0 z-20" : "hidden"}
            md:relative md:block md:w-64 md:z-auto
            bg-white border-r border-gray-200 p-4 overflow-y-auto
          `}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Connected Users</h3>
              <button onClick={() => setMobilePanel("none")} className="md:hidden text-xs text-gray-500">Close</button>
            </div>
            <div className="space-y-2">
              {connectedUsers.map((u) => (
                <div key={u.id} className="flex items-center space-x-2 p-2 bg-gray-50 rounded-md">
                  <div className="w-2 h-2 bg-green-500 rounded-full shrink-0"></div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{u.name}</div>
                    <div className="text-xs text-gray-500 truncate">{u.email}</div>
                  </div>
                </div>
              ))}
              {connectedUsers.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-4">No users connected</div>
              )}
            </div>
          </div>

          {/* Canvas Area */}
          <div className="flex-1 bg-white border border-gray-200">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              className="w-full h-full cursor-crosshair block"
              style={{ touchAction: 'none' }}
            />
          </div>

          {/* Chat Sidebar — hidden on mobile, overlay when toggled */}
          <div className={`
            ${mobilePanel === "chat" ? "absolute inset-0 z-20" : "hidden"}
            md:relative md:flex md:w-80 md:z-auto
            bg-white border-l border-gray-200 flex-col
          `} style={{ display: mobilePanel === "chat" ? "flex" : undefined }}>
            <div className="p-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Chat</h3>
              <button onClick={() => setMobilePanel("none")} className="md:hidden text-xs text-gray-500">Close</button>
            </div>

            <div ref={chatContainerRef} className="flex-1 p-3 overflow-y-auto space-y-3">
              {messages.map((message) => (
                <div key={message.id} className={`flex flex-col ${message.userId === user?.id ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-[85%] px-3 py-2 rounded-lg ${
                    message.userId === user?.id
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}>
                    <div className="text-xs font-medium mb-1">{message.userName}</div>
                    <div className="text-sm">{message.text}</div>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="text-sm text-gray-500 text-center py-4">No messages yet. Start the conversation!</div>
              )}
            </div>

            <div className="p-3 border-t border-gray-200">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={sendChatMessage}
                  className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Drawing Controls Toolbar */}
        <div className="bg-white border-t border-gray-200 px-3 py-2 md:p-4 shrink-0">
          <div className="flex items-center justify-center gap-4 md:gap-8">
            <div className="flex items-center gap-2">
              <label className="text-xs md:text-sm text-gray-700">Color:</label>
              <input
                type="color"
                value={currentColor}
                onChange={(e) => setCurrentColor(e.target.value)}
                className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs md:text-sm text-gray-700">Stroke:</label>
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="w-16 md:w-20"
              />
              <span className="text-xs md:text-sm text-gray-500 w-6">{strokeWidth}</span>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
