import { defineConfig, devices } from "@playwright/test"

// Smoke tests at 375px wide (iPhone SE class width). Every test runs in light
// mode; dark mode reruns only the tests tagged @a11y, since axe's color
// contrast check is the only thing that depends on the theme.
// Runs against a production build, which is what offline and PWA behavior
// depend on. Needs the local Supabase stack and .env.local (pnpm env:local).
const PORT = 3000
const mobile = { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } }

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "mobile-light", use: { ...mobile, colorScheme: "light" } },
    { name: "mobile-dark", grep: /@a11y/, use: { ...mobile, colorScheme: "dark" } },
  ],
  webServer: {
    command: "pnpm build && pnpm start --hostname 127.0.0.1 --port 3000",
    url: `http://127.0.0.1:${PORT}/sign-in`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
  },
})
