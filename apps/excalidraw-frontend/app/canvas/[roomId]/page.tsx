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
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [canvasState, setCanvasState] = useState<ImageData | null>(null);
  const [lastCanvasSize, setLastCanvasSize] = useState<{width: number, height: number} | null>(null);
     const [messages, setMessages] = useState<Message[]>([]);
   const [chatInput, setChatInput] = useState("");
   const chatContainerRef = useRef<HTMLDivElement>(null);
   const [isRoomAdmin, setIsRoomAdmin] = useState(false);

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

  // Debounced resize handler
  const debouncedResize = useCallback(() => {
    const canvas = canvasRef.current;
    const context = contextRef.current;
    if (!canvas || !context) return;

    const container = canvas.parentElement;
    if (container) {
      // Calculate available space by subtracting header, toolbar, and sidebars
      const headerHeight = 80; // Approximate header height
      const toolbarHeight = 60; // Approximate toolbar height
      const sidebarWidth = 256; // Left sidebar width (w-64 = 16rem = 256px)
      const chatSidebarWidth = 320; // Right chat sidebar width (w-80 = 20rem = 320px)
      const availableHeight = window.innerHeight - headerHeight - toolbarHeight;
      const availableWidth = window.innerWidth - sidebarWidth - chatSidebarWidth;
      
      // Set fixed internal canvas size (400x400) and scale to fit container
      const internalWidth = 400;
      const internalHeight = 400;
      
      // Calculate scale to fit the available space
      const scaleX = availableWidth / internalWidth;
      const scaleY = availableHeight / internalHeight;
      const scale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1x
      
      // Set canvas internal size
      canvas.width = internalWidth;
      canvas.height = internalHeight;
      
      // Apply CSS transform to scale the canvas
      canvas.style.transform = `scale(${scale})`;
      canvas.style.transformOrigin = 'top left';
      
      // Update last known size
      setLastCanvasSize({ width: availableWidth, height: availableHeight });
      
      // Restore context properties with proper stroke width scaling
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = currentColor;
      // Use a stroke width that looks good on the 400x400 canvas
      const baseStrokeWidth = 2; // Increased from 0.5 to 2 for better proportion on larger canvas
      context.lineWidth = baseStrokeWidth;
      
      console.log("Canvas resized - Internal:", { width: internalWidth, height: internalHeight }, "Scale:", scale, "Available:", { width: availableWidth, height: availableHeight }, "Stroke width:", baseStrokeWidth);
    }
  }, [lastCanvasSize, currentColor]);

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
      
      const response = await fetch(`https://excalidraw-http.habeebsaleh.dev/drawings/${roomSlug}`, {
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
        
        // Replay all drawing actions
        drawingActions.forEach((action: any, index: number) => {
          console.log(`Replaying action ${index}:`, action);
          console.log("Action type:", action.type);
          console.log("Action points:", action.points);
          console.log("Action color:", action.color);
          console.log("Action strokeWidth:", action.strokeWidth);
          
          // Check if points is a string that needs to be parsed
          let points = action.points;
          if (typeof points === 'string') {
            try {
              points = JSON.parse(points);
              console.log("Parsed points from string:", points);
            } catch (e) {
              console.error("Failed to parse points:", e);
              points = [];
            }
          }
          
          handleRemoteDrawing({
            type: action.type,
            points: points || [],
            color: action.color || "#000000",
            strokeWidth: action.strokeWidth || 2,
            userId: action.userId,
            userName: action.userName
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

      // Set canvas size to fill the container
      const resizeCanvas = () => {
        const container = canvas.parentElement;
        if (container) {
          // Calculate available space by subtracting header, toolbar, and sidebars
          const headerHeight = 80; // Approximate header height
          const toolbarHeight = 60; // Approximate toolbar height
          const sidebarWidth = 256; // Left sidebar width (w-64 = 16rem = 256px)
          const chatSidebarWidth = 320; // Right chat sidebar width (w-80 = 20rem = 320px)
          const availableHeight = window.innerHeight - headerHeight - toolbarHeight;
          const availableWidth = window.innerWidth - sidebarWidth - chatSidebarWidth;
          
          // Set fixed internal canvas size (400x400) and scale to fit container
          const internalWidth = 400;
          const internalHeight = 400;
          
          // Calculate scale to fit the available space
          const scaleX = availableWidth / internalWidth;
          const scaleY = availableHeight / internalHeight;
          const scale = Math.min(scaleX, scaleY, 1); // Don't scale up beyond 1x
          
          // Set canvas internal size
          canvas.width = internalWidth;
          canvas.height = internalHeight;
          
          // Apply CSS transform to scale the canvas
          canvas.style.transform = `scale(${scale})`;
          canvas.style.transformOrigin = 'top left';
          
          setLastCanvasSize({ width: availableWidth, height: availableHeight });
          console.log("Canvas initialized - Internal:", { width: internalWidth, height: internalHeight }, "Scale:", scale, "Available:", { width: availableWidth, height: availableHeight });
        }
      };

      resizeCanvas();
      
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
      context.strokeStyle = "#000000"; // Use explicit value instead of state
      // Use a stroke width that looks good on the 400x400 canvas
      const baseStrokeWidth = 2; // Increased from 0.5 to 2 for better proportion on larger canvas
      context.lineWidth = baseStrokeWidth;
      contextRef.current = context;
      console.log("Canvas initialized successfully, context set:", contextRef.current, "Stroke width:", baseStrokeWidth);

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

  // Check if we need to redirect to stored room
  useEffect(() => {
    const storedRoom = localStorage.getItem("currentRoom");
    if (storedRoom && storedRoom !== roomId) {
      console.log("Redirecting to stored room:", storedRoom);
      router.push(`/canvas/${storedRoom}`);
    }
  }, [roomId, router]);

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
            // Set admin status from backend response
            if (data.isAdmin !== undefined) {
              setIsRoomAdmin(data.isAdmin);
              console.log("Admin status set:", data.isAdmin);
            }
            // Handle chat history from room joining
            if (data.chatHistory && Array.isArray(data.chatHistory)) {
              const historyMessages = data.chatHistory.map((msg: any) => ({
                id: msg.id,
                text: msg.message,
                userId: msg.user.id,
                userName: msg.user.name,
                timestamp: msg.createdAt
              }));
              setMessages(historyMessages);
              console.log("Loaded chat history:", historyMessages.length, "messages");
            }
            // fetchDrawingHistory will be called by useEffect when context is ready
          }
          break;
        case "user-joined":
          setConnectedUsers(prev => {
            // Check if user already exists
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
          // Filter out duplicates when setting room users
          const uniqueUsers = data.users.filter((user: User, index: number, self: User[]) => 
            index === self.findIndex(u => u.id === user.id)
          );
          setConnectedUsers(uniqueUsers);
          break;
        case "message":
          // Handle incoming chat messages
          const newMessage = {
            id: data.messageId || Date.now().toString(),
            text: data.message,
            userId: data.userId,
            userName: data.userName,
            timestamp: data.timestamp
          };
          setMessages(prev => [...prev, newMessage]);
          break;
        case "chat-history":
          // Handle chat history from room joining
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

  // Connect to WebSocket when token is available
  useEffect(() => {
    if (token && !isConnected) {
      // Check if there's already a WebSocket connection from canvas page
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
                // Set admin status from backend response
                if (data.isAdmin !== undefined) {
                  setIsRoomAdmin(data.isAdmin);
                  console.log("Admin status set:", data.isAdmin);
                }
                // Handle chat history from room joining
                if (data.chatHistory && Array.isArray(data.chatHistory)) {
                  const historyMessages = data.chatHistory.map((msg: any) => ({
                    id: msg.id,
                    text: msg.message,
                    userId: msg.user.id,
                    userName: msg.user.name,
                    timestamp: msg.createdAt
                  }));
                  setMessages(historyMessages);
                  console.log("Loaded chat history:", historyMessages.length, "messages");
                }
                // fetchDrawingHistory will be called by useEffect when context is ready
              }
              break;
            case "user-joined":
              setConnectedUsers(prev => {
                // Check if user already exists
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
              setConnectedUsers(data.users);
              break;
            case "message":
              // Handle incoming chat messages
              const newMessage = {
                id: data.messageId || Date.now().toString(),
                text: data.message,
                userId: data.userId,
                userName: data.userName,
                timestamp: data.timestamp
              };
              setMessages(prev => [...prev, newMessage]);
              break;
            case "chat-history":
              // Handle chat history from room joining
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

  // Auto-rejoin room on page refresh
  useEffect(() => {
    if (isConnected && !isJoined) {
      // Check if we're using an existing connection that was already joined
      const existingWs = (window as any).__wsConnection;
      if (!existingWs) {
        // Auto-join the room after a short delay to ensure connection is stable
        const autoJoinTimer = setTimeout(() => {
          console.log("Auto-joining room:", roomId);
          joinRoom();
        }, 1000);

        return () => clearTimeout(autoJoinTimer);
      }
    }
  }, [isConnected, isJoined, roomId]);

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

  const handleRemoteDrawing = (action: DrawingAction) => {
    const context = contextRef.current;
    if (!context) {
      console.log("No canvas context available for remote drawing");
      return;
    }

    console.log("Handling remote drawing:", action);

    // Set drawing properties
    context.strokeStyle = action.color;
    context.lineWidth = action.strokeWidth;
    context.lineCap = "round";
    context.lineJoin = "round";

    if (action.type === "start") {
      if (action.points && action.points.length > 0) {
        context.beginPath();
        context.moveTo(action.points[0].x, action.points[0].y);
        console.log("Started path at:", action.points[0]);
      }
    } else if (action.type === "draw") {
      if (action.points && action.points.length > 0) {
        // Draw the complete path
        context.beginPath();
        action.points.forEach((point, index) => {
          if (index === 0) {
            context.moveTo(point.x, point.y);
          } else {
            context.lineTo(point.x, point.y);
          }
        });
        context.stroke();
        console.log("Drew complete path with", action.points.length, "points");
      }
    } else if (action.type === "end") {
      context.closePath();
      console.log("Closed path");
    }
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
    if (!contextRef.current || !wsRef.current || !user) return;

    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Convert screen coordinates to canvas coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = x * scaleX;
    const canvasY = y * scaleY;

    // Start a new path and collect points
    const newPoint = { x: canvasX, y: canvasY };
    setCurrentPath([newPoint]);

    contextRef.current.beginPath();
    contextRef.current.moveTo(canvasX, canvasY);

    // Send drawing start to other users
    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "drawing-action",
        roomName: roomId,
        action: {
          type: "start",
          points: [newPoint],
          color: currentColor,
          strokeWidth: strokeWidth,
          userId: user.id,
          userName: user.name
        }
      }));
    }
  }, [currentColor, strokeWidth, user, roomId]);

  const draw = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !contextRef.current || !wsRef.current || !user) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    // Convert screen coordinates to canvas coordinates
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const canvasX = x * scaleX;
    const canvasY = y * scaleY;

    // Add point to current path
    const newPoint = { x: canvasX, y: canvasY };
    setCurrentPath(prev => [...prev, newPoint]);

    contextRef.current.lineTo(canvasX, canvasY);
    contextRef.current.stroke();

    // Send drawing action to other users with all points in the current path
    if (wsRef.current.readyState === WebSocket.OPEN) {
      const allPoints = [...currentPath, newPoint];
      wsRef.current.send(JSON.stringify({
        type: "drawing-action",
        roomName: roomId,
        action: {
          type: "draw",
          points: allPoints,
          color: currentColor,
          strokeWidth: strokeWidth,
          userId: user.id,
          userName: user.name
        }
      }));
    }
  }, [isDrawing, currentColor, strokeWidth, user, roomId, currentPath]);

  const stopDrawing = useCallback(() => {
    if (!contextRef.current || !wsRef.current || !user) return;

    setIsDrawing(false);
    contextRef.current.closePath();

    // Send drawing end to other users with the complete path
    if (wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "drawing-action",
        roomName: roomId,
        action: {
          type: "end",
          points: currentPath,
          color: currentColor,
          strokeWidth: strokeWidth,
          userId: user.id,
          userName: user.name
        }
      }));
    }

    // Clear the current path
    setCurrentPath([]);
  }, [currentColor, strokeWidth, user, roomId, currentPath]);

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
      <div className="flex flex-col h-screen bg-background">
        {/* Header */}
        <div className="bg-card border-b border-border p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-foreground">Room: {roomId}</h1>
              <div className="flex items-center gap-2 mt-1">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <span className="text-sm text-muted-foreground">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
                {isJoined && (
                  <>
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span className="text-sm text-muted-foreground">Joined</span>
                  </>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-muted-foreground">
                {connectedUsers.length} users online
              </span>
              <button
                onClick={clearCanvas}
                className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
              >
                Clear
              </button>
                             <button
                 onClick={downloadCanvas}
                 className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
               >
                 Download
               </button>
              {user && (
                <div className="text-right">
                  <div className="text-sm font-medium text-foreground">{user.name}</div>
                  <div className="text-xs text-muted-foreground">{user.email}</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 bg-gray-200 overflow-hidden flex">
          {/* Connected Users Sidebar */}
          <div className="w-64 bg-card border-r border-border p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold  mb-4 text-black">Connected Users</h3>
            <div className="space-y-2">
              {connectedUsers.map((user) => (
                <div key={user.id} className="flex items-center space-x-2 p-2 bg-gray-50 rounded-md">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <div>
                    <div className="text-sm font-medium  text-black">{user.name}</div>
                    <div className="text-xs text-muted-foreground text-black">{user.email}</div>
                  </div>
                </div>
              ))}
              {connectedUsers.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No users connected
                </div>
              )}
            </div>
          </div>
          
          {/* Canvas Area */}
          <div className="flex-1 bg-white border border-border">
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className="w-full h-full cursor-crosshair block"
              style={{ touchAction: 'none' }}
            />
          </div>

          {/* Chat Sidebar */}
          <div className="w-80 bg-card border-l border-border flex flex-col">
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-semibold text-black">Chat</h3>
            </div>
            
                         {/* Messages */}
             <div ref={chatContainerRef} className="flex-1 p-4 overflow-y-auto space-y-3">
              {messages.map((message) => (
                <div key={message.id} className={`flex flex-col ${message.userId === user?.id ? 'items-end' : 'items-start'}`}>
                  <div className={`max-w-xs px-3 py-2 rounded-lg ${
                    message.userId === user?.id 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-gray-100 text-black'
                  }`}>
                    <div className="text-xs font-medium mb-1">
                      {message.userName}
                    </div>
                    <div className="text-sm">{message.text}</div>
                  </div>
                  <div className="text-xs text-black mt-1">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
              {messages.length === 0 && (
                <div className="text-sm text-black text-center py-4">
                  No messages yet. Start the conversation!
                </div>
              )}
            </div>
            
            {/* Chat Input */}
            <div className="p-4 border-t border-border">
              <div className="flex space-x-2">
                                 <input
                   type="text"
                   value={chatInput}
                   onChange={(e) => setChatInput(e.target.value)}
                   onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
                   placeholder="Type a message..."
                   className="flex-1 px-3 py-2 border border-border rounded-md text-sm text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                 />
                <button
                  onClick={sendChatMessage}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors text-sm"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Drawing Controls Toolbar */}
        <div className="bg-card border-t border-border p-4">
          <div className="flex items-center justify-center space-x-8">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-foreground">Color:</label>
              <input
                type="color"
                value={currentColor}
                onChange={(e) => setCurrentColor(e.target.value)}
                className="w-8 h-8 border border-border rounded cursor-pointer"
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <label className="text-sm text-foreground">Stroke:</label>
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={strokeWidth}
                onChange={(e) => setStrokeWidth(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground w-8">{strokeWidth}</span>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
