import { describe, it, expect, beforeEach } from "vitest";
import { roomService } from "../../src/modules/rooms/index";
import { userRepository } from "../../src/modules/users/user.repository";
import { ApiError } from "../../src/utils/ApiError";

let userId1: number;
let userId2: number;

beforeEach(() => {
  userId1 = userRepository.create("alice", "alice@example.com", "hash").id;
  userId2 = userRepository.create("bob", "bob@example.com", "hash").id;
});

describe("roomService", () => {
  it("creates a room and auto-adds creator as member", () => {
    const room = roomService.create(userId1, "general");
    const members = roomService.getMembers(room.id) as { id: number }[];
    expect(members.some((m) => m.id === userId1)).toBe(true);
  });

  it("rejects duplicate room names", () => {
    roomService.create(userId1, "lobby");
    expect(() => roomService.create(userId2, "lobby")).toThrow(ApiError);
  });

  it("allows another user to join a room", () => {
    const room = roomService.create(userId1, "open");
    roomService.join(userId2, room.id);
    const members = roomService.getMembers(room.id) as { id: number }[];
    expect(members.length).toBe(2);
  });

  it("throws 404 when joining a non-existent room", () => {
    expect(() => roomService.join(userId1, 99999)).toThrow(ApiError);
  });

  it("forbids non-members from viewing message history", () => {
    const room = roomService.create(userId1, "private");
    expect(() => roomService.getHistory(userId2, room.id, 50)).toThrow(ApiError);
  });

  it("allows members to view message history", () => {
    const room = roomService.create(userId1, "shared");
    const messages = roomService.getHistory(userId1, room.id, 50);
    expect(Array.isArray(messages)).toBe(true);
  });
});
