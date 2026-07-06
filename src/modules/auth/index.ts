import { z } from "zod";
import { userRepository } from "../users/user.repository";
import { hashPassword, verifyPassword, signToken } from "../../utils/auth";
import { ApiError } from "../../utils/ApiError";
import { Router } from "express";
import type { Request, Response } from "express";
import { validate, requireAuth } from "../../middleware/index";
import { asyncHandler } from "../../utils/asyncHandler";

// ─── Schemas ────────────────────────────────────────────────────────────────

export const registerSchema = z.object({
  body: z.object({
    username: z
      .string()
      .min(3, "Username must be at least 3 characters")
      .max(30)
      .regex(/^[a-zA-Z0-9_]+$/, "Username may only contain letters, numbers, and underscores"),
    email: z.string().email(),
    password: z.string().min(8, "Password must be at least 8 characters"),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }),
});

// ─── Service ────────────────────────────────────────────────────────────────

function safeUser(user: { id: number; username: string; email: string }) {
  return { id: user.id, username: user.username, email: user.email };
}

export const authService = {
  async register(input: z.infer<typeof registerSchema>["body"]) {
    if (userRepository.findByEmail(input.email)) {
      throw ApiError.conflict("Email already registered");
    }
    if (userRepository.findByUsername(input.username)) {
      throw ApiError.conflict("Username already taken");
    }
    const hash = await hashPassword(input.password);
    const user = userRepository.create(input.username, input.email, hash);
    return {
      token: signToken({ sub: String(user.id), username: user.username }),
      user: safeUser(user),
    };
  },

  async login(input: z.infer<typeof loginSchema>["body"]) {
    const user = userRepository.findByEmail(input.email);
    if (!user || !(await verifyPassword(input.password, user.password_hash))) {
      throw ApiError.unauthorized("Invalid email or password");
    }
    return {
      token: signToken({ sub: String(user.id), username: user.username }),
      user: safeUser(user),
    };
  },
};

// ─── Controller ─────────────────────────────────────────────────────────────

const authController = {
  async register(req: Request, res: Response) {
    res.status(201).json(await authService.register(req.body));
  },
  async login(req: Request, res: Response) {
    res.status(200).json(await authService.login(req.body));
  },
  me(req: Request, res: Response) {
    const user = userRepository.findById(Number(req.user!.sub));
    if (!user) throw ApiError.notFound("User not found");
    res.json({ id: user.id, username: user.username, email: user.email });
  },
};

// ─── Routes ─────────────────────────────────────────────────────────────────

export const authRouter = Router();
authRouter.post("/register", validate(registerSchema), asyncHandler(authController.register));
authRouter.post("/login", validate(loginSchema), asyncHandler(authController.login));
authRouter.get("/me", requireAuth, authController.me);
