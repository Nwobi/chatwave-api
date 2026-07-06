import http from "node:http";
import request from "supertest";
import { createApp } from "../src/app";
import { attachSocketGateway } from "../src/socket/gateway";

export const app = createApp();

let _httpServer: http.Server | null = null;

export function getHttpServer(): http.Server {
  if (!_httpServer) {
    _httpServer = http.createServer(app);
    attachSocketGateway(_httpServer);
  }
  return _httpServer;
}

let counter = 0;

export async function registerUser(
  overrides: { username?: string; email?: string; password?: string } = {}
) {
  counter += 1;
  const username = overrides.username ?? `user${counter}`;
  const email = overrides.email ?? `user${counter}@example.com`;
  const password = overrides.password ?? "password123";

  const res = await request(app).post("/api/auth/register").send({ username, email, password });
  return { token: res.body.token as string, userId: res.body.user.id as number, username };
}
