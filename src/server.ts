import http from "node:http";
import { createApp } from "./app";
import { attachSocketGateway } from "./socket/gateway";
import { env } from "./config/env";
import { logger } from "./utils/logger";

const app = createApp();
const httpServer = http.createServer(app);
const io = attachSocketGateway(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info(`ChatWave API listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  logger.info("WebSocket gateway active — connect with a JWT in socket auth.token");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  io.close(() => {
    httpServer.close(() => process.exit(0));
  });
});
