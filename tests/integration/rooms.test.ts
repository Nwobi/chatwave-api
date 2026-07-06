import { describe, it, expect } from "vitest";
import request from "supertest";
import { app, registerUser } from "../helpers";

describe("Rooms API", () => {
  it("creates a room", async () => {
    const user = await registerUser();
    const res = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "general", description: "General chat" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("general");
  });

  it("rejects duplicate room name with 409", async () => {
    const user = await registerUser();
    await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "lobby" });
    const res = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "lobby" });
    expect(res.status).toBe(409);
  });

  it("lists rooms with is_member flag", async () => {
    const user = await registerUser();
    const user2 = await registerUser();

    await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "room-a" });
    await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${user2.token}`)
      .send({ name: "room-b" });

    const res = await request(app).get("/api/rooms").set("Authorization", `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);

    const roomA = res.body.find((r: { name: string }) => r.name === "room-a");
    const roomB = res.body.find((r: { name: string }) => r.name === "room-b");
    expect(roomA.is_member).toBe(1);
    expect(roomB.is_member).toBe(0);
  });

  it("lets a user join and leave a room", async () => {
    const owner = await registerUser();
    const joiner = await registerUser();

    const created = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "hangout" });

    const join = await request(app)
      .post(`/api/rooms/${created.body.id}/join`)
      .set("Authorization", `Bearer ${joiner.token}`);
    expect(join.status).toBe(200);
    expect(join.body.members.length).toBe(2);

    const leave = await request(app)
      .post(`/api/rooms/${created.body.id}/leave`)
      .set("Authorization", `Bearer ${joiner.token}`);
    expect(leave.status).toBe(204);

    const members = await request(app)
      .get(`/api/rooms/${created.body.id}/members`)
      .set("Authorization", `Bearer ${joiner.token}`);
    expect(members.body.length).toBe(1);
  });

  it("returns message history for a room member", async () => {
    const user = await registerUser();
    const created = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ name: "history-room" });

    // Seed a message directly via the message repository
    const { messageRepository } = await import("../../src/modules/messages/message.repository");
    messageRepository.create(created.body.id, user.userId, "Hello world");

    const res = await request(app)
      .get(`/api/rooms/${created.body.id}/messages`)
      .set("Authorization", `Bearer ${user.token}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].content).toBe("Hello world");
    expect(res.body[0].username).toBe(user.username);
  });

  it("forbids message history for non-members", async () => {
    const owner = await registerUser();
    const outsider = await registerUser();

    const created = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "private-room" });

    const res = await request(app)
      .get(`/api/rooms/${created.body.id}/messages`)
      .set("Authorization", `Bearer ${outsider.token}`);

    expect(res.status).toBe(403);
  });
});
