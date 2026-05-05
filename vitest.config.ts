import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Fake MYSQL_* / SESSION_SECRET env vars до import'а server модулей.
    // Без этого 27 тестов с buildApp падали на db.ts:11. См. tests/setup-env.ts.
    setupFiles: ["./tests/setup-env.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
});
