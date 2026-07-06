import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../helpers";

describe("Auth API", () => {
  it("registers a new user and returns a token", async () => {
    const res = await request(app).post("/api/auth/register").send({
      username: "alice",
      email: "alice@example.com",
      password: "password123",
    });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeTypeOf("string");
    expect(res.body.user.username).toBe("alice");
    expect(res.body.user.password_hash).toBeUndefined();
  });

  it("rejects a duplicate email with 409", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "bob", email: "bob@example.com", password: "password123" });
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "bob2", email: "bob@example.com", password: "password123" });
    expect(res.status).toBe(409);
  });

  it("rejects a duplicate username with 409", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "carol", email: "carol@example.com", password: "password123" });
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "carol", email: "carol2@example.com", password: "password123" });
    expect(res.status).toBe(409);
  });

  it("rejects invalid username characters with 400", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ username: "bad name!", email: "x@x.com", password: "password123" });
    expect(res.status).toBe(400);
  });

  it("logs in with correct credentials", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "dave", email: "dave@example.com", password: "password123" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "dave@example.com", password: "password123" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf("string");
  });

  it("rejects wrong password with 401", async () => {
    await request(app)
      .post("/api/auth/register")
      .send({ username: "erin", email: "erin@example.com", password: "password123" });
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "erin@example.com", password: "wrongpassword" });
    expect(res.status).toBe(401);
  });

  it("returns current user on GET /me", async () => {
    const reg = await request(app)
      .post("/api/auth/register")
      .send({ username: "frank", email: "frank@example.com", password: "password123" });
    const me = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${reg.body.token}`);
    expect(me.status).toBe(200);
    expect(me.body.username).toBe("frank");
  });

  it("rejects /me with no token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });
});
