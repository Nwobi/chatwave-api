# ChatWave API

A real-time chat API built with TypeScript, Express, and Socket.io. Users register, create rooms, and exchange messages that are delivered instantly via WebSockets and persisted to SQLite so history survives restarts.

## Stack

- **Express 5** + **TypeScript** (strict mode)
- **Socket.io 4** for real-time bidirectional communication
- **node:sqlite** — Node 22's built-in SQLite module (no native bindings)
- **JWT** authentication (works for both REST and WebSocket connections)
- **Zod** for request validation
- **Vitest** + **Supertest** + **socket.io-client** for testing

## Getting started

Requires **Node 22.5+**.

```bash
npm install
cp .env.example .env
npm run dev
```

Server starts on `http://localhost:3000`. REST and WebSocket share the same port.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run with hot reload |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run compiled build |
| `npm test` | Run all 31 tests |
| `npm run test:watch` | Watch mode |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

## REST API

```
POST  /api/auth/register      { username, email, password }
POST  /api/auth/login         { email, password }
GET   /api/auth/me

POST  /api/rooms              { name, description? }   — create a room
GET   /api/rooms              — list all rooms (includes is_member flag)
POST  /api/rooms/:id/join     — join a room
POST  /api/rooms/:id/leave    — leave a room
GET   /api/rooms/:id/messages ?limit=50&before=<msgId>  — message history
GET   /api/rooms/:id/members  — list current members
GET   /health
```

All `/api/rooms` routes require `Authorization: Bearer <token>`.

## WebSocket events

Connect to the server and pass your JWT in the `auth` object:

```js
import { io } from "socket.io-client";

const socket = io("http://localhost:3000", {
  auth: { token: "your-jwt-here" }
});
```

### Client → Server

| Event | Payload | Description |
|---|---|---|
| `room:join` | `roomId: number` | Subscribe to real-time events for a room (must have REST-joined first) |
| `room:leave` | `roomId: number` | Unsubscribe from room events |
| `message:send` | `{ roomId: number, content: string }` | Send a message |
| `typing:start` | `roomId: number` | Signal you started typing |
| `typing:stop` | `roomId: number` | Signal you stopped typing |

### Server → Client

| Event | Payload | Description |
|---|---|---|
| `message:new` | `MessageWithUser` | A new message was sent in a room |
| `room:user_joined` | `{ roomId, userId, username }` | Someone joined the room channel |
| `room:user_left` | `{ roomId, userId, username }` | Someone left the room channel |
| `typing:update` | `{ roomId, users: string[] }` | Current list of users typing |
| `error` | `{ message: string }` | Something went wrong |

### Typical flow

```
1. POST /api/auth/register       → get JWT
2. POST /api/rooms               → create a room, get roomId
3. POST /api/rooms/:id/join      → join the room (REST)
4. socket.emit("room:join", id)  → subscribe to real-time events
5. socket.emit("message:send", { roomId: id, content: "Hello!" })
6. All connected members receive "message:new"
```

## Architecture

```
src/
  app.ts               Express app factory
  server.ts             Entry point — HTTP server + Socket.io on same port
  config/env.ts          Validated env config
  db/
    database.ts          node:sqlite connection + migration runner
    migrations/
  middleware/
    index.ts             requireAuth, validate, parseIdParam
    errorHandler.ts       Central error → JSON
  modules/
    auth/index.ts         register/login/me (schema + service + controller + routes)
    rooms/index.ts        Room CRUD, join/leave, history (schema + service + controller + routes)
    rooms/room.repository.ts
    messages/message.repository.ts
    users/user.repository.ts
  socket/gateway.ts      Socket.io gateway — auth handshake, event handlers
  utils/                 ApiError, auth (JWT+bcrypt), asyncHandler, logger
tests/
  unit/                  auth utils, room service logic
  integration/           HTTP (auth, rooms) + real WebSocket tests
```

## Authorization

The Socket.io gateway enforces membership — you can't subscribe to room events without having first joined via REST (`POST /api/rooms/:id/join`). This keeps the two layers consistent and prevents clients from bypassing membership checks by going straight to WebSockets.

## Message history pagination

`GET /api/rooms/:id/messages` supports cursor-based pagination via the `before` query param. Pass the id of the oldest message you have to load the next page of older messages — avoids the off-by-one problems of offset pagination and works correctly even when new messages arrive while you're paginating.

## Docker

```bash
docker build -t chatwave-api .
docker run -p 3000:3000 -e JWT_SECRET=some-long-random-string chatwave-api
```
