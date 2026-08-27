/** Renders sample frames across the timeline to tools/preview/ for eyeballing. */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'preview');
mkdirSync(out, { recursive: true });

const W = 1280, H = 720, TOTAL = 264;
const marks = (process.argv[2] || '0.04,0.22,0.42,0.55,0.78,0.97')
  .split(',').map(Number);

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto('file://' + resolve(here, 'frame.html'));
await page.evaluate(([w, h, t]) => window.setup(w, h, t), [W, H, TOTAL]);

let cursor = 0;
for (const m of marks) {
  const target = Math.round(m * (TOTAL - 1));
  while (cursor <= target) { await page.evaluate((n) => window.renderFrame(n), cursor); cursor++; }
  await page.locator('#c').screenshot({ path: resolve(out, `t${String(Math.round(m * 100)).padStart(3, '0')}.png`) });
  console.log('frame', m);
}
await browser.close();
