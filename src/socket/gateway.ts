import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { verifyToken } from "../utils/auth";
import { roomRepository } from "../modules/rooms/room.repository";
import { messageRepository } from "../modules/messages/message.repository";
import { logger } from "../utils/logger";
import { env } from "../config/env";

// ─── Socket event names (typed) ──────────────────────────────────────────────

export const EVENTS = {
  // Client → Server
  JOIN_ROOM: "room:join",
  LEAVE_ROOM: "room:leave",
  SEND_MESSAGE: "message:send",
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",

  // Server → Client
  MESSAGE: "message:new",
  USER_JOINED: "room:user_joined",
  USER_LEFT: "room:user_left",
  TYPING: "typing:update",
  ERROR: "error",
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function roomKey(roomId: number) {
  return `room:${roomId}`;
}

// Track which users are currently typing per room (in-memory, ephemeral)
const typingUsers = new Map<string, Set<string>>(); // roomKey → Set<username>

function getTyping(roomId: number): string[] {
  return [...(typingUsers.get(roomKey(roomId)) ?? [])];
}

function setTyping(roomId: number, username: string, typing: boolean) {
  const key = roomKey(roomId);
  if (!typingUsers.has(key)) typingUsers.set(key, new Set());
  const set = typingUsers.get(key)!;
  if (typing) set.add(username);
  else set.delete(username);
}

// ─── Auth handshake ──────────────────────────────────────────────────────────

interface AuthenticatedSocket extends Socket {
  userId: number;
  username: string;
}

function authenticate(socket: Socket): AuthenticatedSocket | null {
  try {
    const token =
      (socket.handshake.auth as { token?: string }).token ??
      (socket.handshake.headers.authorization ?? "").replace("Bearer ", "");
    if (!token) return null;
    const payload = verifyToken(token);
    (socket as AuthenticatedSocket).userId = Number(payload.sub);
    (socket as AuthenticatedSocket).username = payload.username;
    return socket as AuthenticatedSocket;
  } catch {
    return null;
  }
}

// ─── Gateway ─────────────────────────────────────────────────────────────────

export function attachSocketGateway(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN, methods: ["GET", "POST"] },
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  // Auth middleware — runs before every connection
  io.use((socket, next) => {
    const authed = authenticate(socket);
    if (!authed) {
      next(new Error("Authentication failed: provide a valid JWT in auth.token"));
      return;
    }
    next();
  });

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as AuthenticatedSocket;
    logger.info({ userId: socket.userId, username: socket.username }, "Socket connected");

    // ── Join a room ──────────────────────────────────────────────────────────
    socket.on(EVENTS.JOIN_ROOM, (roomId: unknown) => {
      const id = Number(roomId);
      if (!Number.isInteger(id) || id <= 0) {
        socket.emit(EVENTS.ERROR, { message: "Invalid roomId" });
        return;
      }
      const room = roomRepository.findById(id);
      if (!room) {
        socket.emit(EVENTS.ERROR, { message: "Room not found" });
        return;
      }
      if (!roomRepository.isMember(id, socket.userId)) {
        socket.emit(EVENTS.ERROR, {
          message: "Join the room via REST first (POST /api/rooms/:id/join)",
        });
        return;
      }
      socket.join(roomKey(id));
      socket.to(roomKey(id)).emit(EVENTS.USER_JOINED, {
        roomId: id,
        userId: socket.userId,
        username: socket.username,
      });
      logger.info({ userId: socket.userId, roomId: id }, "Socket joined room");
    });

    // ── Leave a room ─────────────────────────────────────────────────────────
    socket.on(EVENTS.LEAVE_ROOM, (roomId: unknown) => {
      const id = Number(roomId);
      if (!Number.isInteger(id) || id <= 0) return;
      socket.leave(roomKey(id));
      setTyping(id, socket.username, false);
      socket.to(roomKey(id)).emit(EVENTS.USER_LEFT, {
        roomId: id,
        userId: socket.userId,
        username: socket.username,
      });
      socket.to(roomKey(id)).emit(EVENTS.TYPING, { roomId: id, users: getTyping(id) });
    });

    // ── Send a message ───────────────────────────────────────────────────────
    socket.on(EVENTS.SEND_MESSAGE, (data: unknown) => {
      if (
        typeof data !== "object" ||
        data === null ||
        typeof (data as { roomId?: unknown }).roomId !== "number" ||
        typeof (data as { content?: unknown }).content !== "string"
      ) {
        socket.emit(EVENTS.ERROR, {
          message: "Invalid payload: expected { roomId: number, content: string }",
        });
        return;
      }

      const { roomId, content } = data as { roomId: number; content: string };
      const trimmed = content.trim();

      if (!trimmed || trimmed.length > 2000) {
        socket.emit(EVENTS.ERROR, { message: "Message content must be 1–2000 characters" });
        return;
      }
      if (!roomRepository.isMember(roomId, socket.userId)) {
        socket.emit(EVENTS.ERROR, { message: "You are not a member of this room" });
        return;
      }

      const message = messageRepository.create(roomId, socket.userId, trimmed);

      // Clear typing indicator for this user
      setTyping(roomId, socket.username, false);

      // Broadcast to everyone in the room (including sender)
      io.to(roomKey(roomId)).emit(EVENTS.MESSAGE, message);
      io.to(roomKey(roomId)).emit(EVENTS.TYPING, { roomId, users: getTyping(roomId) });
    });

    // ── Typing indicators ────────────────────────────────────────────────────
    socket.on(EVENTS.TYPING_START, (roomId: unknown) => {
      const id = Number(roomId);
      if (!Number.isInteger(id) || id <= 0) return;
      setTyping(id, socket.username, true);
      socket.to(roomKey(id)).emit(EVENTS.TYPING, { roomId: id, users: getTyping(id) });
    });

    socket.on(EVENTS.TYPING_STOP, (roomId: unknown) => {
      const id = Number(roomId);
      if (!Number.isInteger(id) || id <= 0) return;
      setTyping(id, socket.username, false);
      socket.to(roomKey(id)).emit(EVENTS.TYPING, { roomId: id, users: getTyping(id) });
    });

    // ── Cleanup on disconnect ────────────────────────────────────────────────
    socket.on("disconnect", (reason) => {
      logger.info({ userId: socket.userId, reason }, "Socket disconnected");
      // Clear typing indicators for all rooms this socket was in
      for (const [key, set] of typingUsers.entries()) {
        if (set.has(socket.username)) {
          set.delete(socket.username);
          const roomId = Number(key.replace("room:", ""));
          io.to(key).emit(EVENTS.TYPING, { roomId, users: [...set] });
        }
      }
    });
  });

  return io;
}
