import { beforeEach } from "vitest";
import { closeDatabase, getDb } from "../src/db/database";

beforeEach(() => {
  closeDatabase();
  getDb();
});
