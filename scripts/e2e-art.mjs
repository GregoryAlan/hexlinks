import { chromium } from 'playwright-core';

/** P1 art-risk prototype shots: the stair-step fixture in both face styles
 *  and the tutorial hole, iPhone-width, plus a draw-order debug pass. Run
 *  with `npm run dev` up: `SCRATCH=<dir> node scripts/e2e-art.mjs`. */

const scratch = process.env.SCRATCH ?? '.';
const executablePath =
  process.env.CHROMIUM ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;

const browser = await chromium.launch({ executablePath });
const errors = [];
const shots = [
  ['stair-flat', '?proto=stair&style=flat&zoom=1.1'],
  ['stair-hachure', '?proto=stair&style=hachure&zoom=1.1'],
  ['stair-order', '?proto=stair&style=flat&zoom=1.1&debug=order'],
  ['hole-flat', '?proto=hole&style=flat&zoom=0.75'],
  ['hole-hachure', '?proto=hole&style=hachure&zoom=0.75'],
  ['hole-close', '?proto=hole&style=flat&zoom=1.25'],
  ['hole-nofog', '?proto=hole&style=flat&zoom=0.75&fog=off'],
  ['stair-nofog', '?proto=stair&style=flat&zoom=1.1&fog=off'],
];
for (const [name, qs] of shots) {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`${name}: ${m.text()}`);
  });
  await page.goto(`http://localhost:5173/${qs}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${scratch}/${name}.png` });
  console.log('shot', name);
  await page.close();
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
process.exit(errors.length ? 1 : 0);
