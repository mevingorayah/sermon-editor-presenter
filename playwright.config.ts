import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser (Chromium) E2E tests. Not part of `npm test` because it needs a
 * browser + production build. Run with `npm run test:e2e`
 * (first time: `npx playwright install chromium`).
 *
 * By default this builds and starts the app (`next build && next start`) on
 * E2E_PORT (3322). Set E2E_BASE_URL to test an already-running deployment
 * (e.g. staging) instead; the web server is then skipped.
 */
const port = Number(process.env.E2E_PORT ?? 3322);
const externalBaseURL = process.env.E2E_BASE_URL;
const baseURL = externalBaseURL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: externalBaseURL
    ? undefined
    : {
        command: `npm run build && npx next start -p ${port} -H 127.0.0.1`,
        url: `${baseURL}/edit`,
        timeout: 300_000,
        reuseExistingServer: !process.env.CI,
        stdout: "ignore",
        stderr: "pipe",
      },
});
