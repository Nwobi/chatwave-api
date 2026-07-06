import { z } from "zod";
import { Router } from "express";
import type { Request, Response } from "express";
import { roomRepository } from "./room.repository";
import { messageRepository } from "../messages/message.repository";
import { ApiError } from "../../utils/ApiError";
import { requireAuth, validate, parseIdParam } from "../../middleware/index";

// ─── Schemas ────────────────────────────────────────────────────────────────

const createRoomSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(1)
      .max(80)
      .regex(
        /^[a-zA-Z0-9-_]+$/,
        "Room name may only contain letters, numbers, hyphens, and underscores"
      ),
    description: z.string().max(300).optional(),
  }),
});

const historySchema = z.object({
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    before: z.coerce.number().int().positive().optional(),
  }),
});

// ─── Service ────────────────────────────────────────────────────────────────

export const roomService = {
  create(userId: number, name: string, description?: string) {
    if (roomRepository.findByName(name)) {
      throw ApiError.conflict(`Room "${name}" already exists`);
    }
    return roomRepository.create(name, description ?? null, userId);
  },

  list(userId: number) {
    return roomRepository.list(userId);
  },

  join(userId: number, roomId: number) {
    if (!roomRepository.findById(roomId)) throw ApiError.notFound("Room not found");
    roomRepository.addMember(roomId, userId);
    return roomRepository.getMembers(roomId);
  },

  leave(userId: number, roomId: number) {
    if (!roomRepository.findById(roomId)) throw ApiError.notFound("Room not found");
    roomRepository.removeMember(roomId, userId);
  },

  getHistory(userId: number, roomId: number, limit: number, before?: number) {
    if (!roomRepository.findById(roomId)) throw ApiError.notFound("Room not found");
    if (!roomRepository.isMember(roomId, userId)) {
      throw ApiError.forbidden("Join this room to view message history");
    }
    return messageRepository.listForRoom(roomId, limit, before);
  },

  getMembers(roomId: number) {
    if (!roomRepository.findById(roomId)) throw ApiError.notFound("Room not found");
    return roomRepository.getMembers(roomId);
  },
};

// ─── Controller ─────────────────────────────────────────────────────────────

function userId(req: Request) {
  return Number(req.user!.sub);
}

const roomController = {
  create(req: Request, res: Response) {
    const room = roomService.create(userId(req), req.body.name, req.body.description);
    res.status(201).json(room);
  },

  list(req: Request, res: Response) {
    res.json(roomService.list(userId(req)));
  },

  join(req: Request, res: Response) {
    const id = parseIdParam(req.params.id);
    const members = roomService.join(userId(req), id);
    res.json({ message: "Joined room", members });
  },

  leave(req: Request, res: Response) {
    const id = parseIdParam(req.params.id);
    roomService.leave(userId(req), id);
    res.status(204).send();
  },

  history(req: Request, res: Response) {
    const id = parseIdParam(req.params.id);
    const q = req.validatedQuery as { limit: number; before?: number };
    const messages = roomService.getHistory(userId(req), id, q.limit, q.before);
    res.json(messages);
  },

  members(req: Request, res: Response) {
    const id = parseIdParam(req.params.id);
    res.json(roomService.getMembers(id));
  },
};

// ─── Routes ─────────────────────────────────────────────────────────────────

export const roomRouter = Router();
roomRouter.use(requireAuth);

roomRouter.post("/", validate(createRoomSchema), roomController.create);
roomRouter.get("/", roomController.list);
roomRouter.post("/:id/join", roomController.join);
roomRouter.post("/:id/leave", roomController.leave);
roomRouter.get("/:id/messages", validate(historySchema), roomController.history);
roomRouter.get("/:id/members", roomController.members);
