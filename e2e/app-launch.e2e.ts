import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Smoke test: the packaged main process starts, opens its window, and the
 * first-run onboarding renders without renderer errors.
 *
 * A fresh userData folder per run: the app pins userData under
 * appData/dontbemichael (src/main/index.ts), and appData derives from HOME on
 * macOS/Linux and APPDATA on Windows. Pointing those at a temp dir means the
 * test never sees, or touches, a real office on the machine.
 */
let app: ElectronApplication;
let page: Page;
let scratch: string;
const rendererErrors: string[] = [];

test.beforeAll(async () => {
    scratch = mkdtempSync(path.join(tmpdir(), 'dbm-e2e-'));
    const roaming = path.join(scratch, 'AppData', 'Roaming');
    const local = path.join(scratch, 'AppData', 'Local');
    mkdirSync(roaming, { recursive: true });
    mkdirSync(local, { recursive: true });
  app = await electron.launch({
    args: [path.join(__dirname, '..', 'out', 'main', 'index.js')],
    env: {
      ...process.env,
      HOME: scratch,
      USERPROFILE: scratch,
      APPDATA: roaming,
      LOCALAPPDATA: local,
      ELECTRON_ENABLE_LOGGING: '1'
    }
  });
  page = await app.firstWindow();
  page.on('console', (msg) => { if (msg.type() === 'error') rendererErrors.push(msg.text()); });
  page.on('pageerror', (err) => rendererErrors.push(err.message));
});

test.afterAll(async () => {
  await app?.close();
  rmSync(scratch, { recursive: true, force: true });
});

const windowIsVisible = () =>
    app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false);
  
test('main window opens with the app title', async () => {
    await expect(page).toHaveTitle("Don't Be Michael");
    await expect.poll(windowIsVisible).toBe(true);
  });

test('first run shows the onboarding wizard', async () => {
  // Strings come from src/renderer/src/i18n/locales/en.json (onboarding.*).
  await expect(page.getByRole('list', { name: 'Setup steps' })).toBeVisible();
  await expect(page.getByRole('region')).toBeVisible();
  await expect(page.getByText(/^Hi, I'm /)).toBeVisible();
  await expect(page.getByLabel('Business name')).toBeVisible();
});

test('renderer logged no errors during boot', async () => {
  expect(rendererErrors).toEqual([]);
});