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
    // 15s глобальный timeout: тесты с buildApp (invitations,
    // company-settings, awaiting-verification, complete-endpoint
    // и т.д.) загружают весь server/routes.ts (~5-7s parse +
    // middleware register). Default 5000 ms был flaky под нагрузкой.
    testTimeout: 15_000,
    hookTimeout: 15_000,
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
