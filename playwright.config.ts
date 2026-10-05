import { defineConfig } from '@playwright/test';
const evidence = process.env.EVIDENCE_DIR ?? 'test-results/e2e';
export default defineConfig({
  testDir: './tests/e2e', testMatch: '**/*.pw.ts', workers: 1, fullyParallel: false,
  timeout: 90000, expect: { timeout: 10000 }, retries: 0,
  outputDir: `${evidence}/results`, reporter: [['list'], ['json', { outputFile: `${evidence}/playwright.json` }]],
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', headless: true, serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce', trace: 'retain-on-failure', screenshot: 'only-on-failure', launchOptions: { args: ['--no-sandbox', '--disable-dev-shm-usage'] } },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 30000 },
});
