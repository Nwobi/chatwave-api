import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    env: {
      NODE_ENV: "test",
      DB_PATH: ":memory:",
      JWT_SECRET: "test-secret-key-for-vitest",
      LOG_LEVEL: "silent",
    },
    setupFiles: ["./tests/setup.ts"],
    fileParallelism: false,
  },
});
