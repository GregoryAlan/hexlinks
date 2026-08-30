import { chromium } from 'playwright-core';

/** P0 smoke: dev server up, home-base stub renders, New Run → placeholder →
 *  Back, zero console errors. Run: `npm run dev` in one shell, then
 *  `SCRATCH=<dir> node scripts/e2e-smoke.mjs` (CHROMIUM overrides the
 *  browser path). Screenshots go to SCRATCH — never the repo. */

const scratch = process.env.SCRATCH ?? '.';
const executablePath =
  process.env.CHROMIUM ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ viewport: { width: 390, height: 780 } }); // iPhone-ish
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);

const title = await page.textContent('.overlay h1');
console.log('home base title:', title);
await page.screenshot({ path: `${scratch}/p0-home.png` });

await page.click('[data-action="new-run"]');
await page.waitForTimeout(300);
console.log('after New Run:', (await page.textContent('#overlay-root')).replace(/\s+/g, ' ').trim());
await page.screenshot({ path: `${scratch}/p0-placeholder.png` });

await page.click('[data-action="back"]');
await page.waitForTimeout(300);
console.log('after Back:', (await page.textContent('.overlay h1')));

console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
