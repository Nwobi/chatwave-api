import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import request from "supertest";
import { app, getHttpServer, registerUser } from "../helpers";
import { EVENTS } from "../../src/socket/gateway";

let port: number;

beforeAll(async () => {
  const server = getHttpServer();
  await new Promise<void>((resolve) => server.listen(0, () => resolve()));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  const server = getHttpServer();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function connectSocket(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = ioc(`http://localhost:${port}`, {
      auth: { token },
      transports: ["websocket"],
    });
    socket.on("connect", () => resolve(socket));
    socket.on("connect_error", reject);
  });
}

function waitForEvent(socket: ClientSocket, event: string): Promise<unknown> {
  return new Promise((resolve) => socket.once(event, resolve));
}

describe("Socket.io Gateway", () => {
  it("rejects connection with no token", async () => {
    const socket = ioc(`http://localhost:${port}`, { transports: ["websocket"] });
    await new Promise<void>((resolve) => {
      socket.on("connect_error", (err) => {
        expect(err.message).toContain("Authentication failed");
        socket.disconnect();
        resolve();
      });
    });
  });

  it("rejects connection with an invalid token", async () => {
    const socket = ioc(`http://localhost:${port}`, {
      auth: { token: "not.a.valid.jwt" },
      transports: ["websocket"],
    });
    await new Promise<void>((resolve) => {
      socket.on("connect_error", (err) => {
        expect(err.message).toContain("Authentication failed");
        socket.disconnect();
        resolve();
      });
    });
  });

  it("connects with a valid JWT", async () => {
    const user = await registerUser();
    const socket = await connectSocket(user.token);
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  it("emits an error when joining a non-existent room", async () => {
    const user = await registerUser();
    const socket = await connectSocket(user.token);

    socket.emit(EVENTS.JOIN_ROOM, 999999);
    const err = (await waitForEvent(socket, EVENTS.ERROR)) as { message: string };
    expect(err.message).toContain("Room not found");
    socket.disconnect();
  });

  it("emits an error when joining a room the user hasn't REST-joined yet", async () => {
    const owner = await registerUser();
    const outsider = await registerUser();

    const room = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ name: "socket-test-room" });

    const socket = await connectSocket(outsider.token);
    socket.emit(EVENTS.JOIN_ROOM, room.body.id);
    const err = (await waitForEvent(socket, EVENTS.ERROR)) as { message: string };
    expect(err.message).toContain("Join the room via REST first");
    socket.disconnect();
  });

  it("delivers a real-time message to all room members", async () => {
    const sender = await registerUser();
    const receiver = await registerUser();

    // Both join the room via REST
    const room = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${sender.token}`)
      .send({ name: "delivery-test-room" });

    await request(app)
      .post(`/api/rooms/${room.body.id}/join`)
      .set("Authorization", `Bearer ${receiver.token}`);

    // Connect both sockets
    const senderSocket = await connectSocket(sender.token);
    const receiverSocket = await connectSocket(receiver.token);

    // Both subscribe to the room channel
    senderSocket.emit(EVENTS.JOIN_ROOM, room.body.id);
    receiverSocket.emit(EVENTS.JOIN_ROOM, room.body.id);
    await new Promise((r) => setTimeout(r, 100)); // wait for joins

    // Receiver waits for the message
    const messagePromise = waitForEvent(receiverSocket, EVENTS.MESSAGE);

    senderSocket.emit(EVENTS.SEND_MESSAGE, { roomId: room.body.id, content: "Hey there!" });

    const msg = (await messagePromise) as { content: string; username: string };
    expect(msg.content).toBe("Hey there!");
    expect(msg.username).toBe(sender.username);

    senderSocket.disconnect();
    receiverSocket.disconnect();
  });

  it("broadcasts typing indicators to other room members", async () => {
    const typer = await registerUser();
    const watcher = await registerUser();

    const room = await request(app)
      .post("/api/rooms")
      .set("Authorization", `Bearer ${typer.token}`)
      .send({ name: "typing-test-room" });

    await request(app)
      .post(`/api/rooms/${room.body.id}/join`)
      .set("Authorization", `Bearer ${watcher.token}`);

    const typerSocket = await connectSocket(typer.token);
    const watcherSocket = await connectSocket(watcher.token);

    typerSocket.emit(EVENTS.JOIN_ROOM, room.body.id);
    watcherSocket.emit(EVENTS.JOIN_ROOM, room.body.id);
    await new Promise((r) => setTimeout(r, 100));

    const typingPromise = waitForEvent(watcherSocket, EVENTS.TYPING);
    typerSocket.emit(EVENTS.TYPING_START, room.body.id);

    const typing = (await typingPromise) as { users: string[] };
    expect(typing.users).toContain(typer.username);

    typerSocket.disconnect();
    watcherSocket.disconnect();
  });
});
