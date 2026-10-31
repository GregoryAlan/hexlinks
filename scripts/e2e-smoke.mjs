import { chromium } from 'playwright-core';

/** Smoke (v2 step 1b): dev server up, home base → New Run → tutorial
 *  overworld; address the ball → aim at a hex up the fairway → Swing → the
 *  ball flies, fog is carved, strokes tick; Walk to the ball; drag pans;
 *  wheel zooms; zero console errors. Run: `npm run dev` in one shell, then
 *  `SCRATCH=<dir> node scripts/e2e-smoke.mjs` (CHROMIUM overrides the browser
 *  path; BASE_URL targets another host). Screenshots go to SCRATCH. */

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

await page.goto(`${base}?seed=smoke`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const title = await page.textContent('.overlay h1');
console.log('home base title:', title);
await page.screenshot({ path: `${scratch}/s1b-home.png` });

await page.click('[data-action="new-run"]');
await page.waitForTimeout(800);

const state = () => page.evaluate(() => window.__hexlinks.manager.top.debugState);
const s0 = await state();
console.log('overworld entered, party at', s0.key, 'cleared', s0.cleared, 'mode', s0.mode);
await page.screenshot({ path: `${scratch}/s1b-overworld.png` });

const canvas = page.locator('#game');
const box = await canvas.boundingBox();
const rowPx = 1.5 * 42 * 0.56 * s0.zoom;
const cx = box.x + s0.partyScreen.x;
const cy = box.y + s0.partyScreen.y;

// Address the ball (tap own hex) → aim mode.
await page.mouse.click(cx, cy);
await page.waitForTimeout(300);
let s = await state();
console.log('after tapping the ball, mode', s.mode);
if (s.mode !== 'aim') errors.push(`expected aim mode, got ${s.mode}`);

// Aim six rows up the fairway, pick the iron, swing.
await page.mouse.click(cx, cy - 6 * rowPx);
await page.waitForTimeout(300);
s = await state();
console.log('target', s.target);
if (!s.target) errors.push('tap did not set a target');
await page.click('[data-club="iron"]');
await page.waitForTimeout(200);
await page.screenshot({ path: `${scratch}/s1b-aim.png` });
await page.click('[data-action="swing"]');
await page.waitForTimeout(600);
s = await state();
console.log('mid-flight mode', s.mode);
await page.screenshot({ path: `${scratch}/s1b-flight.png` });
await page.waitForTimeout(3500);
s = await state();
console.log('after swing: mode', s.mode, 'strokes', s.strokes, 'ball', s.ballKey, 'cleared', s.cleared, 'claimed', s.claimed);
if (s.mode !== 'traverse') errors.push(`expected traverse after flight, got ${s.mode}`);
if (s.strokes < 1) errors.push('stroke not counted');
if (s.ballKey === s0.key) errors.push('ball did not move');
if (!(s.cleared > s0.cleared)) errors.push('fog was not carved');
await page.screenshot({ path: `${scratch}/s1b-landed.png` });

// Walk to the ball via the panel.
await page.click('[data-action="walk-ball"]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${scratch}/s1b-walking.png` });
await page.waitForTimeout(4000);
const s1 = await state();
console.log('after walk, party', s1.key, 'ball', s1.ballKey, 'walking', s1.walking);
if (s1.key !== s1.ballKey) errors.push(`party ${s1.key} did not reach ball ${s1.ballKey}`);

// Drag → pan (camera center moves).
const px = box.x + s1.partyScreen.x;
const py = box.y + s1.partyScreen.y;
await page.mouse.move(px + 80, py + 150);
await page.mouse.down();
await page.mouse.move(px + 120, py + 270, { steps: 6 });
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
await page.screenshot({ path: `${scratch}/s1b-panned.png` });

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
