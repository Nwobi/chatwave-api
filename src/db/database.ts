import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";
import { logger } from "../utils/logger";

let db: DatabaseSync | null = null;

function ensureDir(filePath: string): void {
  if (filePath === ":memory:") return;
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function runMigrations(database: DatabaseSync): void {
  const dir = path.join(__dirname, "migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    database.exec(fs.readFileSync(path.join(dir, file), "utf-8"));
  }
  logger.info(`Applied ${files.length} migration(s)`);
}

export function getDb(): DatabaseSync {
  if (!db) {
    ensureDir(env.DB_PATH);
    db = new DatabaseSync(env.DB_PATH);
    db.exec("PRAGMA foreign_keys = ON;");
    runMigrations(db);
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
