import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage } from "http";
import { URL } from "url";

import jwt from "jsonwebtoken";
import { prisma } from "@repo/db/client";

interface User{
    ws:WebSocket;
    rooms:string[];
    userId:string;
}

interface DrawingAction {
    id: string;
    type: string;
    points: any[];
    color: string;
    strokeWidth: number;
    userId: string;
    userName: string;
    roomName: string;
    timestamp: string;
}

const users:User[]=[];
const drawingActions: DrawingAction[] = [];

// Helper functions to manage drawing actions
function addDrawingAction(action: DrawingAction) {
    drawingActions.push(action);
}

function getDrawingActionsForRoom(roomName: string): DrawingAction[] {
    return drawingActions.filter(action => action.roomName === roomName);
}

function clearDrawingActionsForRoom(roomName: string) {
    const index = drawingActions.findIndex(action => action.roomName === roomName);
    if (index !== -1) {
        drawingActions.splice(index, 1);
    }
}

// Token verification function (replace with your actual JWT verification logic)

function verifyToken(token: string): boolean {
    try {
        const decoded = jwt.verify(token, "secret") as any;
        console.log("Token verified for email:", decoded.email);
        return !!decoded.email; // Return true if email exists (any valid user)
    } catch (error) {
        console.log("Token verification failed:", error);
        return false;
    }
}

const wss = new WebSocketServer({ 
  port: 8080,
  // Optional: Add verifyClient to reject connections before they're established
  
});

console.log("WebSocket Server is running on port 8080");

// Store authenticated connections with their tokens
const authenticatedConnections = new Map<WebSocket, string>();

wss.on("connection", async (ws, req) => {
    console.log("New WebSocket connection attempt");
    
    try {
        // Handle URL parsing more safely
        let token = null;
        
        if (req.url) {
            try {
                const url = new URL(req.url, `ws://localhost:8080`);
                token = url.searchParams.get("token");
                console.log("Token from URL:", token ? "Present" : "Missing");
            } catch (urlError) {
                console.log("URL parsing error:", urlError);
            }
        }
        
        // If no token in URL, check headers
        if (!token && req.headers.authorization) {
            token = req.headers.authorization.replace('Bearer ', '');
            console.log("Token from headers:", token ? "Present" : "Missing");
        }
        
        if (!token) {
            console.log("No token provided, closing connection");
            ws.close(1008, "No token provided");
            return;
        }
        
        if (verifyToken(token)) {
            authenticatedConnections.set(ws, token);
            
            // Get user info from token and add to users array
            const decoded = jwt.verify(token, "secret") as any;
            const user = await prisma.user.findUnique({
                where: { email: decoded.email }
            });
            
            if (user) {
                // Check if user already exists in the users array
                const existingUserIndex = users.findIndex(u => u.userId === user.id);
                if (existingUserIndex !== -1) {
                    // Update existing user's WebSocket connection
                    const existingUser = users[existingUserIndex];
                    if (existingUser) {
                        existingUser.ws = ws;
                        console.log("Updated existing user's WebSocket connection:", user.email);
                    }
                } else {
                    // Add new user to the users array
                    users.push({
                        ws: ws,
                        rooms: [],
                        userId: user.id
                    });
                    console.log("User added to WebSocket users:", user.email);
                }
            }
            
            console.log("Client authenticated successfully");
        } else {
            console.log("Invalid token, closing connection");
            ws.close(1008, "Invalid token");
            return;
        }
    } catch (error) {
        console.error("Connection error:", error);
        ws.close(1011, "Internal server error");
        return;
    }
   
  
  console.log("Client connected successfully");
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: "welcome",
    message: "Connected to WebSocket server",
    timestamp: new Date().toISOString()
  }));
  
  // Get token from the connection (already verified in verifyClient)

  
  ws.on("message", async (message) => {
    console.log("Received message:", message.toString());
    
    // Check if connection is authenticated
    if (!authenticatedConnections.has(ws)) {
      ws.send(JSON.stringify({ 
        error: "Authentication required",
        message: "Please provide a valid token" 
      }));
      return;
    }
    
    // Handle different message types
    try {
      const parsedMessage = JSON.parse(message.toString());
             if(parsedMessage.type==="join-room"){
        try {
          // Get the current user from the WebSocket connection
          const currentUser = users.find(user => user.ws === ws);
          
          if (!currentUser) {
            ws.send(JSON.stringify({
              type: "error",
              message: "User not found in WebSocket session",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Check if room exists in database
          const room = await prisma.room.findUnique({
            where: { slug: parsedMessage.roomName }
          });
          
          if (!room) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Room not found",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Add room to user's rooms list if not already there
          if (!currentUser.rooms.includes(parsedMessage.roomName)) {
            currentUser.rooms.push(parsedMessage.roomName);
          }
          
                     // Get chat history for the room
           const chatHistory = await prisma.chat.findMany({
             where: { roomId: room.id },
             include: {
               user: {
                 select: {
                   id: true,
                   name: true,
                   email: true
                 }
               }
             },
             orderBy: { createdAt: 'asc' },
             take: 50 // Limit to last 50 messages
           });
           
                       // Check if current user is the room admin
            const isAdmin = room.adminId === currentUser.userId;
            
            ws.send(JSON.stringify({
              type: "response",
              message: "Room joined successfully",
              room: room,
              chatHistory: chatHistory,
              isAdmin: isAdmin,
              timestamp: new Date().toISOString()
            }));
          
          console.log("User joined room:", parsedMessage.roomName, "user:", currentUser.userId);
          
          // Send current room users to the new user
          const roomUsers = users
            .filter(u => u.rooms.includes(parsedMessage.roomName))
            .map(async (u) => {
              const userInfo = await prisma.user.findUnique({
                where: { id: u.userId }
              });
              return userInfo ? {
                id: userInfo.id,
                name: userInfo.name,
                email: userInfo.email
              } : null;
            });
          
          const resolvedUsers = await Promise.all(roomUsers);
          const validUsers = resolvedUsers.filter(u => u !== null);
          
          ws.send(JSON.stringify({
            type: "room-users",
            roomName: parsedMessage.roomName,
            users: validUsers,
            timestamp: new Date().toISOString()
          }));
          
        } catch (error) {
          console.error("Error joining room:", error);
          ws.send(JSON.stringify({
            type: "error",
            message: "Failed to join room",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString()
          }));
        }
       }

      else if(parsedMessage.type==="leave-room"){
        const room=users.find(user=>user.userId===parsedMessage.userId);
        if(room){
          room.rooms=room.rooms.filter(room=>room!==parsedMessage.roomName);
        }
      }
             else if(parsedMessage.type==="send-message"){
         try {
           // Get the current user from the WebSocket connection
           const currentUser = users.find(user => user.ws === ws);
           
           if (!currentUser) {
             ws.send(JSON.stringify({
               type: "error",
               message: "User not found in WebSocket session",
               timestamp: new Date().toISOString()
             }));
             return;
           }
           
           // Validate message
           if (!parsedMessage.message || typeof parsedMessage.message !== 'string') {
             ws.send(JSON.stringify({
               type: "error",
               message: "Invalid message provided",
               timestamp: new Date().toISOString()
             }));
             return;
           }
           
           // Validate room
           if (!parsedMessage.roomName || typeof parsedMessage.roomName !== 'string') {
             ws.send(JSON.stringify({
               type: "error",
               message: "Invalid room name provided",
               timestamp: new Date().toISOString()
             }));
             return;
           }
           
           // Check if user is in the room
           if (!currentUser.rooms.includes(parsedMessage.roomName)) {
             ws.send(JSON.stringify({
               type: "error",
               message: "You are not in this room",
               timestamp: new Date().toISOString()
             }));
             return;
           }
           
                       // Get room from database
            const room = await prisma.room.findUnique({
              where: { slug: parsedMessage.roomName }
            });
            
            if (!room) {
              ws.send(JSON.stringify({
                type: "error",
                message: "Room not found in database",
                timestamp: new Date().toISOString()
              }));
              return;
            }
            
            // Save message to database
            const chatMessage = await prisma.chat.create({
              data: {
                message: parsedMessage.message,
                userId: currentUser.userId,
                roomId: room.id
              },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            });
            
            // Broadcast message to all users in the same room
            const messageToSend = JSON.stringify({
              type: "message",
              roomName: parsedMessage.roomName,
              message: parsedMessage.message,
              userId: currentUser.userId,
              userName: chatMessage.user.name,
              userEmail: chatMessage.user.email,
              messageId: chatMessage.id,
              timestamp: new Date().toISOString()
            });
            
            let messageSent = false;
            
            // Send to all users who are in the same room
            users.forEach(user => {
              if (user.rooms.includes(parsedMessage.roomName)) {
                user.ws.send(messageToSend);
                messageSent = true;
              }
            });
            
            if (messageSent) {
              console.log(`Message saved and broadcasted to room: ${parsedMessage.roomName} by user: ${currentUser.userId}`);
            } else {
              console.log(`Message saved but no users found in room: ${parsedMessage.roomName}`);
            }
           
         } catch (error) {
           console.error("Error sending message:", error);
           ws.send(JSON.stringify({
             type: "error",
             message: "Failed to send message",
             error: error instanceof Error ? error.message : "Unknown error",
             timestamp: new Date().toISOString()
           }));
         }
       }
             else if(parsedMessage.type==="create-room"){
         try {
           // Get the current user from the WebSocket connection
           const currentUser = users.find(user => user.ws === ws);
           
           if (!currentUser) {
             ws.send(JSON.stringify({
               type: "error",
               message: "User not found in WebSocket session",
               timestamp: new Date().toISOString()
             }));
             return;
           }
           
           // Validate roomName
           if (!parsedMessage.roomName || typeof parsedMessage.roomName !== 'string') {
             ws.send(JSON.stringify({
               type: "error",
               message: "Invalid room name provided",
               timestamp: new Date().toISOString()
             }));
             return;
           }
           
           console.log("Creating room with data:", {
             slug: parsedMessage.roomName,
             adminId: currentUser.userId
           });
           
           // Create room in database
           const room = await prisma.room.create({
             data: {
               slug: parsedMessage.roomName,
               adminId: currentUser.userId
             }
           });
          
          // Add room to user's rooms list
          currentUser.rooms.push(parsedMessage.roomName);
          
          ws.send(JSON.stringify({
            type: "response",
            message: "Room created successfully",
            room: room,
            timestamp: new Date().toISOString()
          }));
          
          console.log("Room created:", parsedMessage.roomName, "by user:", currentUser.userId);
          
        } catch (error) {
          console.error("Error creating room:", error);
          ws.send(JSON.stringify({
            type: "error",
            message: "Failed to create room",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString()
          }));
        }
      }
      else if(parsedMessage.type==="get-chat-history"){
        try {
          // Get the current user from the WebSocket connection
          const currentUser = users.find(user => user.ws === ws);
          
          if (!currentUser) {
            ws.send(JSON.stringify({
              type: "error",
              message: "User not found in WebSocket session",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Validate room
          if (!parsedMessage.roomName || typeof parsedMessage.roomName !== 'string') {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid room name provided",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Check if user is in the room
          if (!currentUser.rooms.includes(parsedMessage.roomName)) {
            ws.send(JSON.stringify({
              type: "error",
              message: "You are not in this room",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Get room from database
          const room = await prisma.room.findUnique({
            where: { slug: parsedMessage.roomName }
          });
          
          if (!room) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Room not found",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Get chat history
          const chatHistory = await prisma.chat.findMany({
            where: { roomId: room.id },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            },
            orderBy: { createdAt: 'asc' },
            take: parsedMessage.limit || 50 // Default to 50 messages
          });
          
          ws.send(JSON.stringify({
            type: "chat-history",
            roomName: parsedMessage.roomName,
            messages: chatHistory,
            timestamp: new Date().toISOString()
          }));
          
          console.log(`Chat history sent for room: ${parsedMessage.roomName} to user: ${currentUser.userId}`);
          
        } catch (error) {
          console.error("Error getting chat history:", error);
          ws.send(JSON.stringify({
            type: "error",
            message: "Failed to get chat history",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString()
          }));
        }
      }
      // Handle drawing actions
      else if(parsedMessage.type==="drawing-action"){
        try {
          // Get the current user from the WebSocket connection
          const currentUser = users.find(user => user.ws === ws);
          
          if (!currentUser) {
            ws.send(JSON.stringify({
              type: "error",
              message: "User not found in WebSocket session",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Validate room
          if (!parsedMessage.roomName || typeof parsedMessage.roomName !== 'string') {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid room name provided",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Check if user is in the room
          if (!currentUser.rooms.includes(parsedMessage.roomName)) {
            ws.send(JSON.stringify({
              type: "error",
              message: "You are not in this room",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Validate drawing action
          if (!parsedMessage.action || typeof parsedMessage.action !== 'object') {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid drawing action provided",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Get room from database
          const room = await prisma.room.findUnique({
            where: { slug: parsedMessage.roomName }
          });
          
          if (!room) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Room not found in database",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Get user info for the drawing action
          const user = await prisma.user.findUnique({
            where: { id: currentUser.userId }
          });
          
          if (!user) {
            ws.send(JSON.stringify({
              type: "error",
              message: "User not found in database",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Store drawing action in database using direct SQL
          try {
            await prisma.$executeRaw`
              INSERT INTO "DrawingAction" (type, points, color, "strokeWidth", "userId", "roomId", "createdAt")
              VALUES (${parsedMessage.action.type}, ${JSON.stringify(parsedMessage.action.points)}::jsonb, ${parsedMessage.action.color}, ${parsedMessage.action.strokeWidth}, ${currentUser.userId}, ${room.id}, NOW())
            `;
            console.log("Drawing action saved to database");
          } catch (dbError) {
            console.error("Error saving drawing action to database:", dbError);
            // Continue with broadcasting even if database save fails
          }
          
          // Also store in memory for immediate access
          const drawingAction: DrawingAction = {
            id: Date.now().toString(),
            type: parsedMessage.action.type,
            points: parsedMessage.action.points,
            color: parsedMessage.action.color,
            strokeWidth: parsedMessage.action.strokeWidth,
            userId: currentUser.userId,
            userName: user.name,
            roomName: parsedMessage.roomName,
            timestamp: new Date().toISOString()
          };
          
          addDrawingAction(drawingAction);
          
          // Broadcast drawing action to all users in the same room (except sender)
          const drawingMessage = JSON.stringify({
            type: "drawing-action",
            roomName: parsedMessage.roomName,
            action: {
              ...parsedMessage.action,
              userId: currentUser.userId,
              userName: user.name
            },
            timestamp: new Date().toISOString()
          });
          
          let messageSent = false;
          
          // Send to all users who are in the same room (except sender)
          users.forEach(user => {
            if (user.rooms.includes(parsedMessage.roomName) && user.ws !== ws) {
              user.ws.send(drawingMessage);
              messageSent = true;
            }
          });
          
          if (messageSent) {
            console.log(`Drawing action saved and broadcasted to room: ${parsedMessage.roomName} by user: ${currentUser.userId}`);
          } else {
            console.log(`Drawing action saved but no other users found in room: ${parsedMessage.roomName}`);
          }
          
        } catch (error) {
          console.error("Error handling drawing action:", error);
          ws.send(JSON.stringify({
            type: "error",
            message: "Failed to process drawing action",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString()
          }));
        }
      }
      // Handle clear canvas action
      else if(parsedMessage.type==="clear-canvas"){
        try {
          // Get the current user from the WebSocket connection
          const currentUser = users.find(user => user.ws === ws);
          
          if (!currentUser) {
            ws.send(JSON.stringify({
              type: "error",
              message: "User not found in WebSocket session",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Validate room
          if (!parsedMessage.roomName || typeof parsedMessage.roomName !== 'string') {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid room name provided",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Check if user is in the room
          if (!currentUser.rooms.includes(parsedMessage.roomName)) {
            ws.send(JSON.stringify({
              type: "error",
              message: "You are not in this room",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Get room from database
          const room = await prisma.room.findUnique({
            where: { slug: parsedMessage.roomName }
          });
          
          if (!room) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Room not found in database",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Clear drawing actions from database
          try {
            await prisma.$executeRaw`
              DELETE FROM "DrawingAction" WHERE "roomId" = ${room.id}
            `;
            console.log("Drawing actions cleared from database for room:", parsedMessage.roomName);
          } catch (dbError) {
            console.error("Error clearing drawing actions from database:", dbError);
            // Continue with broadcasting even if database clear fails
          }
          
          // Broadcast clear canvas action to all users in the same room (except sender)
          const clearMessage = JSON.stringify({
            type: "clear-canvas",
            roomName: parsedMessage.roomName,
            userId: currentUser.userId,
            timestamp: new Date().toISOString()
          });
          
          // Clear the stored drawing actions for this room
          clearDrawingActionsForRoom(parsedMessage.roomName);
          
          let messageSent = false;
          
          // Send to all users who are in the same room (except sender)
          users.forEach(user => {
            if (user.rooms.includes(parsedMessage.roomName) && user.ws !== ws) {
              user.ws.send(clearMessage);
              messageSent = true;
            }
          });
          
          if (messageSent) {
            console.log(`Clear canvas action broadcasted to room: ${parsedMessage.roomName} by user: ${currentUser.userId}`);
          } else {
            console.log(`Clear canvas action sent but no other users found in room: ${parsedMessage.roomName}`);
          }
          
        } catch (error) {
          console.error("Error handling clear canvas action:", error);
          ws.send(JSON.stringify({
            type: "error",
            message: "Failed to process clear canvas action",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString()
          }));
        }
      }
      // Handle clear all action (admin only)
      else if(parsedMessage.type==="clear-all"){
        try {
          // Get the current user from the WebSocket connection
          const currentUser = users.find(user => user.ws === ws);
          
          if (!currentUser) {
            ws.send(JSON.stringify({
              type: "error",
              message: "User not found in WebSocket session",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Validate room
          if (!parsedMessage.roomName || typeof parsedMessage.roomName !== 'string') {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid room name provided",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Check if user is in the room
          if (!currentUser.rooms.includes(parsedMessage.roomName)) {
            ws.send(JSON.stringify({
              type: "error",
              message: "You are not in this room",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Get room from database and check if user is admin
          const room = await prisma.room.findUnique({
            where: { slug: parsedMessage.roomName }
          });
          
          if (!room) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Room not found in database",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Check if user is the room admin
          if (room.adminId !== currentUser.userId) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Only room admin can clear all content",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Clear drawing actions from database
          try {
            await prisma.$executeRaw`
              DELETE FROM "DrawingAction" WHERE "roomId" = ${room.id}
            `;
            console.log("Drawing actions cleared from database for room:", parsedMessage.roomName);
          } catch (dbError) {
            console.error("Error clearing drawing actions from database:", dbError);
          }
          
          // Clear chat messages from database
          try {
            await prisma.$executeRaw`
              DELETE FROM "Chat" WHERE "roomId" = ${room.id}
            `;
            console.log("Chat messages cleared from database for room:", parsedMessage.roomName);
          } catch (dbError) {
            console.error("Error clearing chat messages from database:", dbError);
          }
          
          // Broadcast clear all action to all users in the same room
          const clearMessage = JSON.stringify({
            type: "clear-all",
            roomName: parsedMessage.roomName,
            userId: currentUser.userId,
            timestamp: new Date().toISOString()
          });
          
          // Clear the stored drawing actions for this room
          clearDrawingActionsForRoom(parsedMessage.roomName);
          
          // Send to all users who are in the same room
          users.forEach(user => {
            if (user.rooms.includes(parsedMessage.roomName)) {
              user.ws.send(clearMessage);
            }
          });
          
          console.log(`Clear all action broadcasted to room: ${parsedMessage.roomName} by admin: ${currentUser.userId}`);
          
        } catch (error) {
          console.error("Error handling clear all action:", error);
          ws.send(JSON.stringify({
            type: "error",
            message: "Failed to process clear all action",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString()
          }));
        }
      }
      // Handle clear messages action (admin only)
      else if(parsedMessage.type==="clear-messages"){
        try {
          // Get the current user from the WebSocket connection
          const currentUser = users.find(user => user.ws === ws);
          
          if (!currentUser) {
            ws.send(JSON.stringify({
              type: "error",
              message: "User not found in WebSocket session",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Validate room
          if (!parsedMessage.roomName || typeof parsedMessage.roomName !== 'string') {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid room name provided",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Check if user is in the room
          if (!currentUser.rooms.includes(parsedMessage.roomName)) {
            ws.send(JSON.stringify({
              type: "error",
              message: "You are not in this room",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Get room from database and check if user is admin
          const room = await prisma.room.findUnique({
            where: { slug: parsedMessage.roomName }
          });
          
          if (!room) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Room not found in database",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Check if user is the room admin
          if (room.adminId !== currentUser.userId) {
            ws.send(JSON.stringify({
              type: "error",
              message: "Only room admin can clear messages",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Clear chat messages from database
          try {
            await prisma.$executeRaw`
              DELETE FROM "Chat" WHERE "roomId" = ${room.id}
            `;
            console.log("Chat messages cleared from database for room:", parsedMessage.roomName);
          } catch (dbError) {
            console.error("Error clearing chat messages from database:", dbError);
          }
          
          // Broadcast clear messages action to all users in the same room
          const clearMessage = JSON.stringify({
            type: "clear-messages",
            roomName: parsedMessage.roomName,
            userId: currentUser.userId,
            timestamp: new Date().toISOString()
          });
          
          // Send to all users who are in the same room
          users.forEach(user => {
            if (user.rooms.includes(parsedMessage.roomName)) {
              user.ws.send(clearMessage);
            }
          });
          
          console.log(`Clear messages action broadcasted to room: ${parsedMessage.roomName} by admin: ${currentUser.userId}`);
          
        } catch (error) {
          console.error("Error handling clear messages action:", error);
          ws.send(JSON.stringify({
            type: "error",
            message: "Failed to process clear messages action",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString()
          }));
        }
      }
      // Handle user joined notification
      else if(parsedMessage.type==="user-joined"){
        try {
          // Get the current user from the WebSocket connection
          const currentUser = users.find(user => user.ws === ws);
          
          if (!currentUser) {
            ws.send(JSON.stringify({
              type: "error",
              message: "User not found in WebSocket session",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Validate room
          if (!parsedMessage.roomName || typeof parsedMessage.roomName !== 'string') {
            ws.send(JSON.stringify({
              type: "error",
              message: "Invalid room name provided",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Get user info
          const user = await prisma.user.findUnique({
            where: { id: currentUser.userId }
          });
          
          if (!user) {
            ws.send(JSON.stringify({
              type: "error",
              message: "User not found in database",
              timestamp: new Date().toISOString()
            }));
            return;
          }
          
          // Broadcast user joined to all users in the same room (except sender)
          const userJoinedMessage = JSON.stringify({
            type: "user-joined",
            roomName: parsedMessage.roomName,
            user: {
              id: user.id,
              name: user.name,
              email: user.email
            },
            timestamp: new Date().toISOString()
          });
          
          // Send to all users who are in the same room (except sender)
          users.forEach(user => {
            if (user.rooms.includes(parsedMessage.roomName) && user.ws !== ws) {
              user.ws.send(userJoinedMessage);
            }
          });
          
          // Send current room users to the new user
          const roomUsers = users
            .filter(u => u.rooms.includes(parsedMessage.roomName))
            .map(async (u) => {
              const userInfo = await prisma.user.findUnique({
                where: { id: u.userId }
              });
              return userInfo ? {
                id: userInfo.id,
                name: userInfo.name,
                email: userInfo.email
              } : null;
            });
          
          const resolvedUsers = await Promise.all(roomUsers);
          const validUsers = resolvedUsers.filter(u => u !== null);
          
          ws.send(JSON.stringify({
            type: "room-users",
            roomName: parsedMessage.roomName,
            users: validUsers,
            timestamp: new Date().toISOString()
          }));
          
          console.log(`User joined notification sent for room: ${parsedMessage.roomName}, user: ${currentUser.userId}`);
          
        } catch (error) {
          console.error("Error handling user joined:", error);
          ws.send(JSON.stringify({
            type: "error",
            message: "Failed to process user joined",
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString()
          }));
        }
      }
        
      
      // Handle custom handshake (if token wasn't provided in URL/headers)
    
      // Handle regular messages
      // ws.send(JSON.stringify({
      //   type: "response",
      //   message: "Hello from server",
      //   timestamp: new Date().toISOString()
      // }));
      
    } catch (error) {
      // Handle non-JSON messages
      ws.send(JSON.stringify({
        type: "response",
        message: "Hello from server",
        timestamp: new Date().toISOString()
      }));
    }
  });
  
  ws.on("close", () => {
    console.log("Client disconnected");
    authenticatedConnections.delete(ws);
    // Remove user from the users array
    const index = users.findIndex(user => user.ws === ws);
    if (index !== -1) {
      const removedUser = users[index];
      if (removedUser) {
        users.splice(index, 1);
        console.log("User removed from WebSocket users:", removedUser.userId);
        
        // Notify other users in the same rooms that this user left
        removedUser.rooms.forEach(roomName => {
          const userLeftMessage = JSON.stringify({
            type: "user-left",
            roomName: roomName,
            userId: removedUser.userId,
            timestamp: new Date().toISOString()
          });
          
          users.forEach(user => {
            if (user.rooms.includes(roomName)) {
              user.ws.send(userLeftMessage);
            }
          });
        });
      }
    }
  });
});

wss.on("error", (error) => {
  console.error("WebSocket error:", error);
});

