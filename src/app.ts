import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { authRouter } from "./modules/auth/index";
import { roomRouter } from "./modules/rooms/index";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { env } from "./config/env";

export function createApp(): Express {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/rooms", roomRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
