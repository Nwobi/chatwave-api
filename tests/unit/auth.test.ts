import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, signToken, verifyToken } from "../../src/utils/auth";

describe("auth utils", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });

  it("produces a different hash each call (salted)", async () => {
    const a = await hashPassword("secret123");
    const b = await hashPassword("secret123");
    expect(a).not.toBe(b);
  });

  it("signs and verifies a token round-trip", () => {
    const token = signToken({ sub: "99", username: "alice" });
    const payload = verifyToken(token);
    expect(payload.sub).toBe("99");
    expect(payload.username).toBe("alice");
  });

  it("throws on a tampered token", () => {
    const token = signToken({ sub: "1", username: "alice" });
    expect(() => verifyToken(token.slice(0, -3) + "xxx")).toThrow();
  });
});
