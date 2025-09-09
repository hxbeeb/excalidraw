import express from "express";
import jwt from "jsonwebtoken";
import cors from "cors";
import { NextFunction, Request, Response } from "express";
import { prisma } from "@repo/db/client";
import bcrypt from "bcrypt";
import { createRoomSchema } from "@repo/common/types";






const app = express();
app.use(express.json());
app.use(cors());


async function AuthenticatorAssertionResponse(req: Request, res: Response,next:NextFunction){
    try{
        console.log("Auth middleware - Headers:", {
            authorization: req.headers.authorization,
            token: req.headers.token,
            'content-type': req.headers['content-type']
        });
        
        let token = null;
        
        // Check Authorization header first (Bearer token)
        if (req.headers.authorization) {
            token = req.headers.authorization.replace('Bearer ', '');
            console.log("Token from Authorization header:", token);
        }
        
        // Fallback to token header
        if (!token && req.headers.token) {
            token = req.headers.token as string;
            console.log("Token from token header:", token);
        }
        
        if(!token){
            console.log("No token found in headers");
            return res.status(401).json({ message: "Unauthorized - No token provided" });
        }
        
        //@ts-ignore
        const decoded = jwt.verify(token, "secret") as any;
        console.log("Decoded token:", decoded);
        
        // Initialize req.body if it doesn't exist (for GET requests)
        if (!req.body) {
            req.body = {};
        }
        
        req.body.email = decoded.email;
        const user = await prisma.user.findUnique({
            where: {
                email: decoded.email
            }
        });
        req.body.user = user;
        console.log("Authentication successful for user:", user?.email);
        next();
    }catch(error){
        console.error("Authentication error:", error);
        res.status(401).json({ message: "Unauthorized - Invalid token" });
    }
}

app.post("/signup", async (req, res) => {
    console.log("Signup request received");
    try{
    const { email, password,name } = req.body;
    const existingUser = await prisma.user.findUnique({
        where: {
            email
        }
    });
    if(existingUser){
        return res.status(400).json({ message: "User already exists" });
    }
    const hashedPassword = await bcrypt.hash(password,10);
        const user = await prisma.user.create({
        data: {
            email,
            password:hashedPassword,
            name
        }
    });
    res.status(200).json({ user });
    }catch(error){
        console.error(error);
        res.status(500).send("Internal server error");
    }
});


app.post("/login", async (req, res) => {
    try{
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({
        where: {
            email
        }
    });
    if(!user){
        return res.status(400).json({ message: "User not found" });
    }
    const isPasswordValid = await bcrypt.compare(password,user.password);
    if(!isPasswordValid){
        return res.status(400).json({ message: "Invalid password" });
    }
    const token = jwt.sign({ 
        email: user.email, 
        id: user.id, 
        name: user.name 
    }, "secret");
    res.status(200).json({ 
        token, 
        user: {
            id: user.id,
            name: user.name,
            email: user.email
        }
    });
    }catch(error){
        console.error(error);
        res.status(500).send("Internal server error");
    }
});


app.post("/room",AuthenticatorAssertionResponse, async (req, res) => {
    try{
        console.log(req.body);
        const data=createRoomSchema.safeParse(req.body);

        if(!data.success){      
            return res.status(400).json({ message: "Invalid request body", errors: data.error });
        }
        const { roomName } = data.data;
        const existingRoom = await prisma.room.findUnique({
            where: {
                slug: roomName
            }
        });
        if(existingRoom){
            return res.status(400).json({ message: "Room already exists" });
        }
        const room = await prisma.room.create({
            data: {
                slug: roomName,
                adminId: req.body.user.id // Use the user ID from the middleware
            }
        });
        console.log("Room created successfully");
        res.status(200).json({ room });
    }catch(error){
        console.error(error);
        res.status(500).send("Internal server error");
    }
});


app.get("/chats/:roomName",AuthenticatorAssertionResponse, async (req, res) => {
    try{
        const { roomName } = req.params;
        const room = await prisma.room.findUnique({
            where: { slug: roomName }
        });
        if(!room){
            return res.status(400).json({ message: "Room not found" });
        }
        const chats = await prisma.chat.findMany({
            where: { roomId: room.id },
            orderBy: { id: 'desc' },
            take: 50
        });
        res.status(200).json({ chats });
    }catch(error){
        console.error(error);
        res.status(500).send("Internal server error");
    }
});


app.get("/room/:slug",AuthenticatorAssertionResponse, async (req, res) => {
    try{
        const { slug } = req.params;
        const room = await prisma.room.findUnique({
            where: { slug }
        });
        if(!room){
            return res.status(400).json({ message: "Room not found" });
        }
        res.status(200).json({ room });
    }catch(error){
        console.error(error);
        res.status(500).send("Internal server error");
    }
});

app.get("/drawings/:roomSlug", AuthenticatorAssertionResponse, async (req, res) => {
  try {
    const { roomSlug } = req.params;
    
    if (!roomSlug) {
      return res.status(400).json({ message: "Room slug is required" });
    }

    // First get the room by slug
    const room = await prisma.room.findUnique({
      where: { slug: roomSlug }
    });

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    // Then get drawing actions for this room using direct SQL
    const drawingActions = await prisma.$queryRaw`
      SELECT da.*, u.id as "userId", u.name as "userName", u.email as "userEmail"
      FROM "DrawingAction" da
      JOIN "User" u ON da."userId" = u.id
      WHERE da."roomId" = ${room.id}
      ORDER BY da."createdAt" ASC
    `;

    res.json(drawingActions);
  } catch (error) {
    console.error("Error fetching drawing actions:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});








app.listen(3000, () => {
    console.log("HTTP Server is running on port 3000");
});






