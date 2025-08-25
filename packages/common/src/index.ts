import { z } from "zod";

export const createRoomSchema = z.object({
    roomName: z.string().min(1),

});
export const createUserSchema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(8),
});
export const signinUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});
export type CreateRoomSchema = z.infer<typeof createRoomSchema>;
export type CreateUserSchema = z.infer<typeof createUserSchema>;
export type SigninUserSchema = z.infer<typeof signinUserSchema>;