/** Screenshots the live page at several scroll positions. */
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, 'preview');
mkdirSync(out, { recursive: true });

const url = process.argv[2] || 'http://localhost:4173/';
const marks = (process.argv[3] || '0,0.04,0.09,0.16,0.23,0.30,0.36,0.44,0.52,0.62,0.72,0.86,0.96')
  .split(',').map((v) => (v.startsWith('h:') ? v : Number(v)));
const vw = Number(process.argv[4]) || 1440;
const vh = Number(process.argv[5]) || 900;

const browser = await chromium.launch({
  executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required']
});
const page = await browser.newPage({ viewport: { width: vw, height: vh } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

// Values prefixed h: are positions on the hero video timeline rather than
// fractions of the whole page — which is what you actually want to inspect.
for (const raw of marks) {
  const heroT = typeof raw === 'string' && raw.startsWith('h:');
  const m = heroT ? parseFloat(raw.slice(2)) : raw;
  await page.evaluate(([f, onHero]) => {
    const run = document.documentElement.scrollHeight - window.innerHeight;
    if (onHero) {
      const hero = document.getElementById('hero');
      window.scrollTo(0, (hero.offsetHeight - window.innerHeight) * f);
    } else {
      window.scrollTo(0, run * f);
    }
  }, [m, heroT]);
  await page.waitForTimeout(1400);
  const name = `site-${heroT ? 'h' : 'p'}${String(Math.round(m * 100)).padStart(3, '0')}-${vw}.png`;
  await page.screenshot({ path: resolve(out, name) });
  console.log(name);
}
const state = await page.evaluate(() => {
  const v = document.getElementById('hero-video');
  return { src: v.currentSrc, dur: v.duration, ready: v.readyState,
           source: document.querySelector('.hero__stage').getAttribute('data-source') };
});
console.log('video:', JSON.stringify(state));
if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
await browser.close();
