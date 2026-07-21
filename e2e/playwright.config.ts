import { defineConfig, devices } from '@playwright/test'

// how-much is a real-time, multi-client app. These tests drive the *real* stack
// (Vite frontend + FastAPI backend over WebSocket), which unit tests can't cover.
//
// Targets:
//   FRONTEND — the SPA. baseURL for page.goto('/').
//   API      — the backend, for HTTP-level checks (capacity) via the `request` fixture.
//
// By default we reuse the already-running dev stack (docker compose up →
// :5173/:8000). If nothing is listening, the webServer block below spins the
// whole stack up via docker compose, so CI can run the suite from cold.
const FRONTEND_URL = process.env.HOWMUCH_FRONTEND_URL ?? 'http://localhost:5173'
const API_URL = process.env.HOWMUCH_API_URL ?? 'http://localhost:8000'

export default defineConfig({
  testDir: './tests',
  // Multi-context real-time flows have inter-client timing; give them room but
  // keep it bounded so a genuine hang fails rather than blocks forever.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: FRONTEND_URL,
    // API base for the `request` fixture (capacity spec talks HTTP directly).
    extraHTTPHeaders: {},
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  // Surface the API base to specs without importing config everywhere.
  metadata: { apiURL: API_URL },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Cold-start fallback: only runs `docker compose up` when :5173 isn't already
  // served. reuseExistingServer keeps the running dev stack untouched locally.
  webServer: {
    command: 'docker compose -f ../docker-compose.yml up',
    url: FRONTEND_URL,
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
