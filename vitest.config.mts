import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// server-only throws outside a React server build; tests import server modules directly.
const alias = {
  "@": fileURLToPath(new URL("./", import.meta.url)),
  "server-only": fileURLToPath(new URL("./node_modules/server-only/empty.js", import.meta.url)),
}

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "node",
          include: ["**/*.test.ts"],
          exclude: ["node_modules/**", "tests/rls/**", "e2e/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "rls",
          environment: "node",
          include: ["tests/rls/**/*.test.ts"],
          globalSetup: ["tests/rls/global-setup.ts"],
          // RLS suites share one local database; run files one at a time.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
