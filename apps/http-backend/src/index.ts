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
        const token = req.headers.token;
        if(!token){
            return res.status(401).send("Unauthorized");
        }
        //@ts-ignore
        const decoded = jwt.verify(token, "secret");
        req.body.email = decoded.email;
        const user = await prisma.user.findUnique({
            where: {
                email: decoded.email
            }
        });
        req.body.user = user;
        next();
    }catch(error){
        console.error(error);
        res.status(500).send("Internal server error");
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








app.listen(3000, () => {
    console.log("HTTP Server is running on port 3000");
});






