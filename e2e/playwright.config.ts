import { defineConfig } from '@playwright/test';

// End-to-end smoke tests launch the built Electron app (out/main/index.js).
// Run `npm run build` first. Separate from the node:test unit suite in test/,
// which tools/run-tests.cjs picks up by the .test.cjs suffix.
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { trace: 'retain-on-failure' }
});