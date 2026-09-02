import { chromium } from 'playwright-core';

/** P1 smoke: dev server up, home base → New Run → tutorial overworld; tap a
 *  fairway hex → the party walks there (state read via window.__hexlinks);
 *  drag pans the camera; wheel zooms; zero console errors. Run:
 *  `npm run dev` in one shell, then `SCRATCH=<dir> node scripts/e2e-smoke.mjs`
 *  (CHROMIUM overrides the browser path). Screenshots go to SCRATCH. */

const scratch = process.env.SCRATCH ?? '.';
const base = process.env.BASE_URL ?? 'http://localhost:5173/';
const executablePath =
  process.env.CHROMIUM ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 }); // iPhone-ish
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto(base, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const title = await page.textContent('.overlay h1');
console.log('home base title:', title);
await page.screenshot({ path: `${scratch}/p1-home.png` });

await page.click('[data-action="new-run"]');
await page.waitForTimeout(800);

const state = () => page.evaluate(() => window.__hexlinks.manager.top.debugState);
const s0 = await state();
console.log('overworld entered, party at', s0.key, 'cleared', s0.cleared);
await page.screenshot({ path: `${scratch}/p1-overworld.png` });

// Tap the hex two rows up from the party (a row is 1.5·42·0.56·zoom px).
const canvas = page.locator('#game');
const box = await canvas.boundingBox();
const rowPx = 1.5 * 42 * 0.56 * s0.zoom;
const cx = box.x + s0.partyScreen.x;
const cy = box.y + s0.partyScreen.y;
await page.mouse.click(cx, cy - 2 * rowPx);
await page.waitForTimeout(400);
await page.screenshot({ path: `${scratch}/p1-walking.png` });
await page.waitForTimeout(1200);
const s1 = await state();
console.log('after tap, party at', s1.key, 'walking', s1.walking);
await page.screenshot({ path: `${scratch}/p1-walked.png` });
if (s1.party.r !== s0.party.r - 2) errors.push(`expected to walk 2 rows up, got ${s0.key} → ${s1.key}`);
if (s1.walking) errors.push('still walking after 1.6 s');

// Drag → pan (camera center moves).
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 40, cy + 120, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(200);
const s2 = await state();
console.log('after drag, center', s2.center);
if (Math.abs(s2.center.y - s1.center.y) < 20) errors.push('drag did not pan');

// Wheel → zoom.
await page.mouse.wheel(0, -300);
await page.waitForTimeout(200);
const s3 = await state();
console.log('after wheel, zoom', s3.zoom);
if (!(s3.zoom > s2.zoom)) errors.push('wheel did not zoom in');
await page.screenshot({ path: `${scratch}/p1-panned.png` });

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
